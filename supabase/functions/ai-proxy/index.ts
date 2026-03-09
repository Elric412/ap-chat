// AI Chat Proxy Edge Function — Chaos-Hardened
// Rate limiting, structured errors, health checks, timeout guards
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

// ── In-memory rate limiter (per-user, resets on cold start) ──
const rateLimits = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30;  // 30 req/min per user

function checkRateLimit(userId: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  let entry = rateLimits.get(userId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    rateLimits.set(userId, entry);
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, retryAfterMs: 0 };
}

// ── Structured error response ──
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
    provider?: string;
  };
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  extra?: { retryAfterMs?: number; provider?: string }
): Response {
  const body: ErrorResponse = {
    error: { code, message, retryable, ...extra },
  };
  const headers: Record<string, string> = { ...corsHeaders, 'Content-Type': 'application/json' };
  if (extra?.retryAfterMs) {
    headers['Retry-After'] = String(Math.ceil(extra.retryAfterMs / 1000));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

// ── Request validation ──
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
  if (!body || typeof body !== 'object') return { valid: false, message: 'Request body must be a JSON object' };
  const b = body as Record<string, unknown>;

  if (typeof b.provider !== 'string' || !b.provider) return { valid: false, message: 'Missing required field: provider' };
  if (typeof b.model !== 'string' || !b.model) return { valid: false, message: 'Missing required field: model' };
  if (!Array.isArray(b.messages) || b.messages.length === 0) return { valid: false, message: 'Missing required field: messages (non-empty array)' };

  // Sanitize inputs
  if (b.temperature !== undefined && (typeof b.temperature !== 'number' || b.temperature < 0 || b.temperature > 2)) {
    return { valid: false, message: 'temperature must be a number between 0 and 2' };
  }
  if (b.max_tokens !== undefined && (typeof b.max_tokens !== 'number' || b.max_tokens < 1 || b.max_tokens > 200_000)) {
    return { valid: false, message: 'max_tokens must be a number between 1 and 200000' };
  }

  return { valid: true, data: body as ChatRequest };
}

// ── Provider request with timeout ──
const PROVIDER_TIMEOUT_MS = 120_000; // 2 minutes

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
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'healthy', timestamp: Date.now() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing or invalid Authorization header', false);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return errorResponse(401, 'INVALID_TOKEN', 'Token is invalid or expired', true);
    }

    const userId = claimsData.claims.sub as string;

    // ── Rate limit ──
    const rl = checkRateLimit(userId);
    if (!rl.allowed) {
      return errorResponse(429, 'RATE_LIMITED', `Rate limit exceeded. ${RATE_LIMIT_MAX_REQUESTS} requests per minute.`, true, {
        retryAfterMs: rl.retryAfterMs,
      });
    }

    // ── Validate request ──
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body is not valid JSON', false);
    }

    const validation = validateRequest(body);
    if (!validation.valid) {
      return errorResponse(400, 'VALIDATION_ERROR', validation.message, false);
    }

    const { provider, model, messages, stream = false, temperature, max_tokens, conversation_id } = validation.data;

    // ── Provider check ──
    const endpoint = PROVIDER_ENDPOINTS[provider];
    if (!endpoint) {
      return errorResponse(400, 'UNKNOWN_PROVIDER', `Unknown provider: ${provider}. Supported: ${Object.keys(PROVIDER_ENDPOINTS).join(', ')}`, false);
    }

    // ── Key retrieval (service role — clients cannot SELECT api_keys) ──
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
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
      return errorResponse(400, 'NO_API_KEY', `No API key configured for ${provider}. Add one in Settings.`, false, { provider });
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

    // ── Forward to provider with timeout ──
    let providerResponse: Response;
    try {
      providerResponse = await fetchWithTimeout(providerUrl, providerRequest, PROVIDER_TIMEOUT_MS);
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';

      // Log failure
      await supabase.from('usage_logs').insert({
        user_id: userId,
        provider_id: provider,
        model_id: model,
        conversation_id: conversation_id ?? null,
        tokens_input: 0,
        tokens_output: 0,
        cost_estimate: 0,
        latency_ms: latencyMs,
        status: 'error',
        error_message: isTimeout ? 'Provider timeout' : String(err),
      }).catch(() => {}); // Don't fail on logging errors

      if (isTimeout) {
        return errorResponse(504, 'PROVIDER_TIMEOUT', `Provider ${provider} timed out after ${PROVIDER_TIMEOUT_MS / 1000}s`, true, { provider });
      }
      return errorResponse(502, 'PROVIDER_UNREACHABLE', `Could not reach ${provider}: ${String(err)}`, true, { provider });
    }

    const latencyMs = Date.now() - startTime;

    // ── Handle provider errors ──
    if (!providerResponse.ok) {
      const errorText = await providerResponse.text().catch(() => 'Unknown error');

      await supabase.from('usage_logs').insert({
        user_id: userId,
        provider_id: provider,
        model_id: model,
        conversation_id: conversation_id ?? null,
        tokens_input: 0,
        tokens_output: 0,
        cost_estimate: 0,
        latency_ms: latencyMs,
        status: 'error',
        error_message: errorText.slice(0, 500),
      }).catch(() => {});

      const retryable = providerResponse.status >= 500 || providerResponse.status === 429;
      const code = providerResponse.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_ERROR';
      return errorResponse(providerResponse.status, code, errorText.slice(0, 500), retryable, { provider });
    }

    // ── Stream response ──
    if (stream && providerResponse.body) {
      return new Response(providerResponse.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
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
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Request-Latency': String(latencyMs),
        'X-Rate-Limit-Remaining': String(rl.remaining),
      },
    });
  } catch (error) {
    console.error('AI Proxy unhandled error:', error);
    return errorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred', true);
  }
});
