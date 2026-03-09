-- Clarify server-side key semantics: stored as provider API key value, not ciphertext.
ALTER TABLE public.api_keys
  RENAME COLUMN encrypted_key TO provider_api_key;
