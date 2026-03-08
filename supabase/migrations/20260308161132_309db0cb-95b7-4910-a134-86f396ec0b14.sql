-- Recreate api_keys_safe view as SECURITY INVOKER (default) instead of SECURITY DEFINER
DROP VIEW IF EXISTS public.api_keys_safe;

CREATE VIEW public.api_keys_safe
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  provider_id,
  key_hint,
  is_active,
  created_at,
  updated_at
FROM public.api_keys
WHERE user_id = auth.uid();