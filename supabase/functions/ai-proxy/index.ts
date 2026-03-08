// AI Chat Proxy Edge Function
// Routes AI API calls through the server, keeping provider keys secure
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Provider endpoint mappings
const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  cohere: 'https://api.cohere.ai/v2/chat',
  together: 'https://api.together.xyz/v1/chat/completions',
};

interface ChatRequest {
  provider: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  conversation_id?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub;

    // Service role client for reading encrypted keys (clients no longer have SELECT on api_keys)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Parse request
    const body: ChatRequest = await req.json();
    const { provider, model, messages, stream = false, temperature, max_tokens, conversation_id } = body;

    if (!provider || !model || !messages) {
      return new Response(JSON.stringify({ error: 'Missing required fields: provider, model, messages' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's API key for this provider using service role (clients have no SELECT on api_keys)
    const { data: keyRecord, error: keyError } = await serviceClient
      .from('api_keys')
      .select('encrypted_key')
      .eq('user_id', userId)
      .eq('provider_id', provider)
      .eq('is_active', true)
      .single();

    if (keyError || !keyRecord) {
      return new Response(JSON.stringify({ error: `No API key configured for ${provider}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Key is read server-side only; clients cannot SELECT from api_keys
    const apiKey = keyRecord.encrypted_key;
    const endpoint = PROVIDER_ENDPOINTS[provider];

    if (!endpoint) {
      return new Response(JSON.stringify({ error: `Unknown provider: ${provider}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();

    // Build provider-specific request
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
          generationConfig: {
            temperature,
            maxOutputTokens: max_tokens,
          },
        }),
      };
    } else if (provider === 'cohere') {
      providerRequest = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream,
          temperature,
          max_tokens,
        }),
      };
    } else {
      // OpenAI-compatible providers (openai, mistral, groq, together)
      providerRequest = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream,
          temperature,
          max_tokens,
        }),
      };
    }

    // Forward request to provider
    const providerResponse = await fetch(providerUrl, providerRequest);
    const latencyMs = Date.now() - startTime;

    if (!providerResponse.ok) {
      const errorText = await providerResponse.text();
      
      // Log failed request
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
      });

      return new Response(errorText, {
        status: providerResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For streaming responses, pipe through
    if (stream && providerResponse.body) {
      // For now, return the stream directly
      // In production, we'd parse and log usage after stream completes
      return new Response(providerResponse.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Parse non-streaming response
    const responseData = await providerResponse.json();

    // Extract usage stats (varies by provider)
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

    // Estimate cost (simplified - would use model-specific pricing in production)
    const costEstimate = (tokensInput * 0.000003 + tokensOutput * 0.000015);

    // Log usage
    await supabase.from('usage_logs').insert({
      user_id: userId,
      provider_id: provider,
      model_id: model,
      conversation_id: conversation_id ?? null,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      cost_estimate: costEstimate,
      latency_ms: latencyMs,
      status: 'success',
    });

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('AI Proxy error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
