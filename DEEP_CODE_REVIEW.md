# Deep Code Review (2026-03-09)

## Scope & Method
- Reviewed architecture, security-sensitive paths, and core state-management flows in frontend + Supabase Edge Function.
- Executed static and runtime checks: `npm run lint`, `npm test`, `npm run build`, `npm test -- --coverage`, `npm audit --json`.

## Executive Summary
- **Critical security issues in application code:** none found.
- **High-priority risks:** dependency vulnerabilities (6 high, 5 moderate, 3 low) from `npm audit`, including `react-router-dom` advisory chain.
- **Quality gaps:** no enforceable coverage pipeline and only one test file currently present.
- **Performance concerns:** production bundle warning (`~719 kB` JS chunk) and missing chunk-splitting strategy.

## Findings

### 1) Dependency security posture needs urgent maintenance (High)
- Audit reports **14 vulnerabilities** (including **6 high**) in current dependency graph.
- Notable direct/transitive risk includes `react-router-dom` via `react-router` / `@remix-run/router` advisories.
- Recommendation:
  1. Upgrade vulnerable direct deps first (`react-router-dom`, `vite`, etc.).
  2. Re-run `npm audit` and pin/resolution-override transitive dependencies where needed.
  3. Add CI gate for `npm audit --audit-level=high`.

### 2) Test coverage objective is currently unmet (High)
- Project currently has one passing test file (`src/test/example.test.ts`), and coverage run fails because `@vitest/coverage-v8` is not installed.
- Recommendation:
  1. Add coverage provider dependency.
  2. Enable `vitest --coverage` in CI.
  3. Set minimum thresholds (e.g., 80% lines/functions on critical modules).

### 3) Bundle size warning indicates likely UX/perf degradation risk (Medium)
- Build emits warning for a large chunk (`dist/assets/index-*.js` around 719 kB minified).
- Recommendation:
  1. Introduce route-level lazy loading in `react-router-dom` pages.
  2. Split heavy UI/editor/chart modules with dynamic imports.
  3. Track bundle budget in CI.

### 4) Edge function key-handling semantics should be clarified (Medium)
- `ai-proxy` reads `api_keys.encrypted_key` and uses it directly as provider credential.
- Schema comments say keys are "server-side encrypted"; if true, decryption step is missing in function. If naming is historical and data is plaintext, rename column/documentation to avoid dangerous ambiguity.
- Recommendation:
  1. Align naming (`provider_api_key_ciphertext` + explicit KMS decrypt flow) **or** rename to `provider_api_key` if plaintext-by-design.
  2. Document exact cryptographic boundary and threat model.

### 5) Minor maintainability issues from lint warnings (Low)
- Lint shows 10 warnings, including React Fast Refresh export pattern and one hook dependency warning in `ContextBar`.
- Recommendation:
  1. Split non-component exports into helper files where needed.
  2. Resolve or document hook dependency rationale to prevent stale memo bugs.

## Positive Notes
- `ai-proxy` has solid baseline controls: auth token checks, basic request validation, rate limiting, timeout-based upstream protection, and structured error responses.
- Local vault manager uses strong crypto defaults and stores the master key in closure scope instead of serialized app state.

## Suggested 2-Week Remediation Plan
1. **Week 1 (Security/Quality Gate):** dependency upgrades + audit clean-up + coverage tooling.
2. **Week 2 (Perf/Maintainability):** code-splitting and lint warning cleanup.
3. Add CI checks for lint/test/build/audit/coverage thresholds.
