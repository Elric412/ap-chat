import type { SandboxLimits } from './types';

/**
 * Conservative defaults — tuned for in-browser Pyodide / JS workers.
 * The browser cannot truly enforce CPU/memory caps, so we approximate
 * via timeouts and output-size budgets; the worker is terminated on
 * limit breach.
 */
export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  timeoutMs: 90_000,                 // 90s — long enough for pip installs / non-trivial scripts
  maxOutputBytes: 8 * 1024 * 1024,   // 8 MB
  maxDiskBytes: 128 * 1024 * 1024,   // 128 MB per session
  heapMb: 512,
  networkAllowed: true,              // pip / fetch enabled by default for agentic flows
};

export function mergeLimits(
  base: SandboxLimits,
  override?: Partial<SandboxLimits>,
): SandboxLimits {
  if (!override) return base;
  return { ...base, ...override };
}
