-- ============================================
-- BYOK Chat Backend Schema
-- ============================================

-- 1. Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 2. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. API keys storage (server-side encrypted, never exposed to client)
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_hint TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider_id)
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own keys"
  ON public.api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own keys"
  ON public.api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own keys"
  ON public.api_keys FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can view own key metadata"
  ON public.api_keys FOR SELECT USING (auth.uid() = user_id);

-- View that hides the encrypted key from client
CREATE VIEW public.api_keys_safe
WITH (security_invoker = on) AS
  SELECT id, user_id, provider_id, key_hint, is_active, created_at, updated_at
  FROM public.api_keys;

-- 4. Conversations sync
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  root_node_id UUID NOT NULL,
  active_leaf_id UUID NOT NULL,
  preset_id TEXT,
  tags TEXT[] DEFAULT '{}',
  total_cost DOUBLE PRECISION DEFAULT 0,
  total_tokens_input INTEGER DEFAULT 0,
  total_tokens_output INTEGER DEFAULT 0,
  total_tokens_thinking INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations"
  ON public.conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversations"
  ON public.conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations"
  ON public.conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversations"
  ON public.conversations FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_conversations_user ON public.conversations(user_id, updated_at DESC);

-- 5. Messages sync
CREATE TABLE public.messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content JSONB NOT NULL DEFAULT '[]',
  model TEXT,
  status TEXT DEFAULT 'complete',
  token_input INTEGER DEFAULT 0,
  token_output INTEGER DEFAULT 0,
  token_thinking INTEGER DEFAULT 0,
  token_cached INTEGER DEFAULT 0,
  cost_estimate DOUBLE PRECISION DEFAULT 0,
  latency_ms INTEGER,
  thinking_content TEXT,
  tool_calls JSONB DEFAULT '[]',
  web_search_results JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages"
  ON public.messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own messages"
  ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own messages"
  ON public.messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own messages"
  ON public.messages FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);

-- 6. Usage logs / analytics
CREATE TABLE public.usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_thinking INTEGER NOT NULL DEFAULT 0,
  tokens_cached INTEGER NOT NULL DEFAULT 0,
  cost_estimate DOUBLE PRECISION NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage logs"
  ON public.usage_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own usage logs"
  ON public.usage_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_usage_user_date ON public.usage_logs(user_id, created_at DESC);
CREATE INDEX idx_usage_provider ON public.usage_logs(user_id, provider_id, created_at DESC);

-- 7. Aggregated usage stats view
CREATE VIEW public.usage_stats
WITH (security_invoker = on) AS
  SELECT
    user_id,
    provider_id,
    date_trunc('day', created_at) AS day,
    COUNT(*) AS request_count,
    SUM(tokens_input) AS total_input,
    SUM(tokens_output) AS total_output,
    SUM(tokens_thinking) AS total_thinking,
    SUM(cost_estimate) AS total_cost,
    AVG(latency_ms)::INTEGER AS avg_latency_ms
  FROM public.usage_logs
  GROUP BY user_id, provider_id, date_trunc('day', created_at);