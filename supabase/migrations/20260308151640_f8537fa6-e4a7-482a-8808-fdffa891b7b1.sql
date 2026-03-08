-- Recreate with per-user filtering so the definer view is safe
DROP VIEW IF EXISTS public.api_keys_safe;
CREATE VIEW public.api_keys_safe
  WITH (security_barrier = true)
AS
  SELECT id, user_id, provider_id, key_hint, is_active, created_at, updated_at
  FROM public.api_keys
  WHERE user_id = auth.uid();

GRANT SELECT ON public.api_keys_safe TO authenticated;
REVOKE SELECT ON public.api_keys_safe FROM anon;