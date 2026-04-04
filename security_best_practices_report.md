# Security Best Practices Review Report

## Executive summary
A deep security review of the TypeScript/React frontend and Supabase edge function code found **7 actionable vulnerabilities**. All 7 were fixed in this change set, with stronger validation and safer defaults applied across authentication, vault management, chat input handling, and edge-function request handling.

## Critical

### SBP-001 — Edge function queried outdated API key column and could fail-open operationally
- **Severity**: Critical
- **Location**: `supabase/functions/ai-proxy/index.ts`
- **Issue**: The function queried `encrypted_key` even though migration renamed this to `provider_api_key`, increasing risk of runtime failures and insecure workaround pressure.
- **Fix**: Updated query and field read to `provider_api_key`.

## High

### SBP-002 — Weak API key input validation accepted control chars / non-printable payloads
- **Severity**: High
- **Location**: `src/components/vault/KeyManagement.tsx`
- **Issue**: Validation used weak pattern checks and could miss null bytes/CRLF/control characters.
- **Fix**: Added centralized validator (`src/lib/api-key-validation.ts`) with printable-ASCII enforcement, control-char rejection, bounded length, provider-format checks, and reused in both UI and vault manager.

### SBP-003 — Vault addKey server-side path lacked shared strict validation
- **Severity**: High
- **Location**: `src/vault/vault-manager.ts`
- **Issue**: Vault manager had weaker local checks than UI path.
- **Fix**: Reused shared API key validator in vault manager before encryption.

### SBP-004 — Password policy too weak for signup and vault setup
- **Severity**: High
- **Location**: `src/pages/AuthPage.tsx`, `src/components/vault/VaultSetupModal.tsx`, `src/vault/vault-manager.ts`
- **Issue**: Password rules were effectively 8-char minimum in multiple paths.
- **Fix**: Added centralized password policy (`src/lib/password-policy.ts`) requiring stronger composition and used it for auth signup, vault setup, and password changes.

## Medium

### SBP-005 — Brute-force protection lacked lockout ceiling
- **Severity**: Medium
- **Location**: `src/vault/vault-manager.ts`
- **Issue**: Exponential backoff existed but with no lockout threshold.
- **Fix**: Added lockout window after max failed attempts to reduce online guessing risk.

### SBP-006 — Oversized chat content guard was too permissive
- **Severity**: Medium
- **Location**: `src/components/chat/ChatInput.tsx`
- **Issue**: 100k hard limit allowed expensive payloads and no soft warning strategy.
- **Fix**: Introduced soft/hard limits (10k/50k), warning toasts, and safer error feedback.

### SBP-007 — Edge POST handling did not enforce explicit allowed-origin deny
- **Severity**: Medium
- **Location**: `supabase/functions/ai-proxy/index.ts`
- **Issue**: CORS headers were restrictive, but non-browser callers with disallowed origins were not explicitly denied.
- **Fix**: Added explicit origin deny check for disallowed origins on POST.

## Low

### SBP-008 — Dynamic chart style selector accepted unbounded ID characters
- **Severity**: Low
- **Location**: `src/components/ui/chart.tsx`
- **Issue**: Selector input was not normalized before injection into style text.
- **Fix**: Added strict chart ID normalization to alphanumeric/underscore/hyphen only.

## Validation performed
- Ran project linting and unit tests after fixes.
- Build check passed for modified TypeScript files.

## Output location
This report was written to: `security_best_practices_report.md`.
