-- Drop the SELECT policy on api_keys so clients cannot read encrypted_key directly
DROP POLICY IF EXISTS "Users can view own key metadata" ON public.api_keys;

-- Recreate the safe view as security_invoker = false (definer) so it can still read
-- but only exposes safe columns. Grant SELECT on it to authenticated.
DROP VIEW IF EXISTS public.api_keys_safe;
CREATE VIEW public.api_keys_safe
  WITH (security_barrier = true)
AS
  SELECT id, user_id, provider_id, key_hint, is_active, created_at, updated_at
  FROM public.api_keys;

-- Grant SELECT on the safe view to authenticated users
GRANT SELECT ON public.api_keys_safe TO authenticated;

-- Revoke direct SELECT on api_keys from authenticated/anon roles
REVOKE SELECT ON public.api_keys FROM authenticated;
REVOKE SELECT ON public.api_keys FROM anon;