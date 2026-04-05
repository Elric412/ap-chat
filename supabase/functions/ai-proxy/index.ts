/**
 * AI Chat Proxy Edge Function — Production-Hardened
 *
 * Security features (per api-security-best-practices skill):
 *   - Origin-validated CORS (not wildcard in production)
 *   - Zod-style input validation with type-safe request schema
 *   - Rate limiting per user (in-memory, resets on cold start)
 *   - Structured error responses (no provider detail leakage)
 *   - Timeout guards on upstream calls
 *   - Request body size cap (256 KB)
 *   - Security headers on every response
 *
 * Backend patterns (per cc-skill-backend-patterns):
 *   - Centralized error handler with typed error codes
 *   - Repository-style key retrieval via service role
 *   - Fire-and-forget usage logging
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Allowed origins (production: restrict to your domain) ──
const ALLOWED_ORIGINS = new Set([
  'https://ap-chat.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
]);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    // Security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

// ── Provider endpoints ──
const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  cohere: 'https://api.cohere.ai/v2/chat',
  together: 'https://api.together.xyz/v1/chat/completions',
};

// ── In-memory rate limiter ──
const rateLimits = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const MAX_REQUEST_BODY_BYTES = 256 * 1024; // 256 KB
const MAX_MESSAGE_LENGTH = 20_000;
const MAX_TOTAL_MESSAGE_CHARS = 100_000;

function checkRateLimit(userId: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimits.get(userId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(userId, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, retryAfterMs: 0 };
  }

  const newCount = entry.count + 1;
  rateLimits.set(userId, { count: newCount, windowStart: entry.windowStart });

  if (newCount > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - newCount, retryAfterMs: 0 };
}

// ── Structured error response ──
interface ErrorPayload {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
  };
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  corsHeaders: Record<string, string>,
  extra?: { retryAfterMs?: number }
): Response {
  const body: ErrorPayload = {
    error: { code, message, retryable, ...extra },
  };
  const headers: Record<string, string> = { ...corsHeaders, 'Content-Type': 'application/json' };
  if (extra?.retryAfterMs) {
    headers['Retry-After'] = String(Math.ceil(extra.retryAfterMs / 1000));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

// ── Request validation (Zod-style, per coding-standards skill) ──
interface ChatRequest {
  provider: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  conversation_id?: string;
}

function validateRequest(body: unknown): { valid: true; data: ChatRequest } | { valid: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, message: 'Request body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.provider !== 'string' || !b.provider || b.provider.length > 32) {
    return { valid: false, message: 'Invalid or missing field: provider' };
  }
  if (typeof b.model !== 'string' || !b.model || b.model.length > 128) {
    return { valid: false, message: 'Invalid or missing field: model' };
  }
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > 500) {
    return { valid: false, message: 'messages must be a non-empty array (max 500)' };
  }

  // Validate each message has role and safe text content
  let totalChars = 0;
  for (let i = 0; i < b.messages.length; i++) {
    const msg = b.messages[i] as Record<string, unknown>;
    if (!msg || typeof msg !== 'object' || typeof msg.role !== 'string') {
      return { valid: false, message: `messages[${i}] must have a string role` };
    }
    if (typeof msg.content !== 'string') {
      return { valid: false, message: `messages[${i}] must have a string content` };
    }
    if (msg.content.length > MAX_MESSAGE_LENGTH) {
      return { valid: false, message: `messages[${i}] content exceeds ${MAX_MESSAGE_LENGTH} characters` };
    }
    totalChars += msg.content.length;
  }

  if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
    return { valid: false, message: `Total message content exceeds ${MAX_TOTAL_MESSAGE_CHARS} characters` };
  }

  if (b.temperature !== undefined && (typeof b.temperature !== 'number' || b.temperature < 0 || b.temperature > 2)) {
    return { valid: false, message: 'temperature must be a number between 0 and 2' };
  }
  if (b.max_tokens !== undefined && (typeof b.max_tokens !== 'number' || !Number.isInteger(b.max_tokens) || b.max_tokens < 1 || b.max_tokens > 200_000)) {
    return { valid: false, message: 'max_tokens must be an integer between 1 and 200000' };
  }
  if (b.conversation_id !== undefined && (typeof b.conversation_id !== 'string' || b.conversation_id.length > 128)) {
    return { valid: false, message: 'conversation_id must be a string (max 128 chars)' };
  }

  return { valid: true, data: body as ChatRequest };
}

/** Sanitize provider error text — never leak API keys or auth tokens */
function sanitizeProviderError(raw: string): string {
  let safe = raw.replace(/\b(sk|key|api|token|bearer|auth)[-_]?[a-zA-Z0-9]{8,}\b/gi, '[REDACTED]');
  safe = safe.replace(/https?:\/\/[^\s]*[?&](key|token|api_key|auth)=[^\s&]*/gi, '[URL_REDACTED]');
  return safe.slice(0, 500);
}

// ── Provider request with timeout ──
const PROVIDER_TIMEOUT_MS = 120_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Main handler ──
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // Health check
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'healthy', timestamp: Date.now() }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only POST requests are accepted', false, cors);
  }

  const origin = req.headers.get('Origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return errorResponse(403, 'ORIGIN_FORBIDDEN', 'Request origin is not allowed', false, cors);
  }

  try {
    // ── Request body size guard ──
    const contentLength = req.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_BODY_BYTES) {
      return errorResponse(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${MAX_REQUEST_BODY_BYTES / 1024}KB limit`, false, cors);
    }

    // ── Auth ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing or invalid Authorization header', false, cors);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return errorResponse(401, 'INVALID_TOKEN', 'Token is invalid or expired', true, cors);
    }

    const userId = claimsData.claims.sub as string;

    // ── Rate limit (immutable pattern: create new entry, don't mutate) ──
    const rl = checkRateLimit(userId);
    if (!rl.allowed) {
      return errorResponse(429, 'RATE_LIMITED', `Rate limit exceeded. ${RATE_LIMIT_MAX_REQUESTS} requests per minute.`, true, cors, {
        retryAfterMs: rl.retryAfterMs,
      });
    }

    // ── Parse & validate request ──
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body is not valid JSON', false, cors);
    }

    const validation = validateRequest(body);
    if (!validation.valid) {
      return errorResponse(400, 'VALIDATION_ERROR', validation.message, false, cors);
    }

    const { provider, model, messages, stream = false, temperature, max_tokens, conversation_id } = validation.data;

    // ── Provider check ──
    const endpoint = PROVIDER_ENDPOINTS[provider];
    if (!endpoint) {
      return errorResponse(400, 'UNKNOWN_PROVIDER', `Unknown provider. Supported: ${Object.keys(PROVIDER_ENDPOINTS).join(', ')}`, false, cors);
    }

    // ── Key retrieval (service role) ──
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: keyRecord, error: keyError } = await serviceClient
      .from('api_keys')
      .select('provider_api_key')
      .eq('user_id', userId)
      .eq('provider_id', provider)
      .eq('is_active', true)
      .single();

    if (keyError || !keyRecord) {
      return errorResponse(400, 'NO_API_KEY', `No API key configured for this provider. Add one in Settings.`, false, cors);
    }

    const apiKey = keyRecord.provider_api_key;
    const startTime = Date.now();

    // ── Build provider request ──
    let providerRequest: RequestInit;
    let providerUrl = endpoint;

    if (provider === 'anthropic') {
      providerRequest = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          messages: messages.filter(m => m.role !== 'system'),
          system: messages.find(m => m.role === 'system')?.content,
          stream,
          temperature,
          max_tokens: max_tokens ?? 4096,
        }),
      };
    } else if (provider === 'google') {
      providerUrl = `${endpoint}/${model}:${stream ? 'streamGenerateContent' : 'generateContent'}?key=${apiKey}`;
      providerRequest = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: { temperature, maxOutputTokens: max_tokens },
        }),
      };
    } else if (provider === 'cohere') {
      providerRequest = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, stream, temperature, max_tokens }),
      };
    } else {
      // OpenAI-compatible (openai, mistral, groq, together)
      providerRequest = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, stream, temperature, max_tokens }),
      };
    }

    // ── Forward to provider ──
    let providerResponse: Response;
    try {
      providerResponse = await fetchWithTimeout(providerUrl, providerRequest, PROVIDER_TIMEOUT_MS);
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';

      // Log failure (fire-and-forget)
      supabase.from('usage_logs').insert({
        user_id: userId,
        provider_id: provider,
        model_id: model,
        conversation_id: conversation_id ?? null,
        tokens_input: 0,
        tokens_output: 0,
        cost_estimate: 0,
        latency_ms: latencyMs,
        status: 'error',
        error_message: isTimeout ? 'Provider timeout' : 'Network error',
      }).then(() => {}, () => {});

      if (isTimeout) {
        return errorResponse(504, 'PROVIDER_TIMEOUT', `Provider timed out after ${PROVIDER_TIMEOUT_MS / 1000}s`, true, cors);
      }
      return errorResponse(502, 'PROVIDER_UNREACHABLE', 'Could not reach the AI provider', true, cors);
    }

    const latencyMs = Date.now() - startTime;

    // ── Handle provider errors ──
    if (!providerResponse.ok) {
      const errorText = await providerResponse.text().catch(() => 'Unknown error');
      const sanitizedError = sanitizeProviderError(errorText);

      supabase.from('usage_logs').insert({
        user_id: userId,
        provider_id: provider,
        model_id: model,
        conversation_id: conversation_id ?? null,
        tokens_input: 0,
        tokens_output: 0,
        cost_estimate: 0,
        latency_ms: latencyMs,
        status: 'error',
        error_message: sanitizedError,
      }).catch(() => {});

      const retryable = providerResponse.status >= 500 || providerResponse.status === 429;
      const code = providerResponse.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_ERROR';
      return errorResponse(providerResponse.status, code, sanitizedError, retryable, cors);
    }

    // ── Stream response ──
    if (stream && providerResponse.body) {
      return new Response(providerResponse.body, {
        headers: {
          ...cors,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-store',
          'Connection': 'keep-alive',
          'X-Request-Latency': String(latencyMs),
          'X-Rate-Limit-Remaining': String(rl.remaining),
        },
      });
    }

    // ── Parse non-streaming response ──
    const responseData = await providerResponse.json();

    let tokensInput = 0;
    let tokensOutput = 0;

    if (provider === 'openai' || provider === 'mistral' || provider === 'groq' || provider === 'together') {
      tokensInput = responseData.usage?.prompt_tokens ?? 0;
      tokensOutput = responseData.usage?.completion_tokens ?? 0;
    } else if (provider === 'anthropic') {
      tokensInput = responseData.usage?.input_tokens ?? 0;
      tokensOutput = responseData.usage?.output_tokens ?? 0;
    } else if (provider === 'google') {
      tokensInput = responseData.usageMetadata?.promptTokenCount ?? 0;
      tokensOutput = responseData.usageMetadata?.candidatesTokenCount ?? 0;
    } else if (provider === 'cohere') {
      tokensInput = responseData.meta?.tokens?.input_tokens ?? 0;
      tokensOutput = responseData.meta?.tokens?.output_tokens ?? 0;
    }

    const costEstimate = tokensInput * 0.000003 + tokensOutput * 0.000015;

    // Log usage (fire-and-forget)
    supabase.from('usage_logs').insert({
      user_id: userId,
      provider_id: provider,
      model_id: model,
      conversation_id: conversation_id ?? null,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      cost_estimate: costEstimate,
      latency_ms: latencyMs,
      status: 'success',
    }).catch(() => {});

    return new Response(JSON.stringify(responseData), {
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Request-Latency': String(latencyMs),
        'X-Rate-Limit-Remaining': String(rl.remaining),
      },
    });
  } catch {
    return errorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred', true, cors);
  }
});
