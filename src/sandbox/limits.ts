import type { SandboxLimits } from './types';

/**
 * Conservative defaults — tuned for in-browser Pyodide / JS workers.
 * The browser cannot truly enforce CPU/memory caps, so we approximate
 * via timeouts and output-size budgets; the worker is terminated on
 * limit breach.
 */
export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  timeoutMs: 30_000,
  maxOutputBytes: 2 * 1024 * 1024,   // 2 MB
  maxDiskBytes: 32 * 1024 * 1024,    // 32 MB per session
  heapMb: 256,
  networkAllowed: false,             // workers run with no fetch by default
};

export function mergeLimits(
  base: SandboxLimits,
  override?: Partial<SandboxLimits>,
): SandboxLimits {
  if (!override) return base;
  return { ...base, ...override };
}
