/**
 * Asset budget limits for CI enforcement (section 16.10).
 * Build fails when any asset exceeds these thresholds.
 */

export interface BudgetLimits {
  /** Max GLB file size in bytes (default 4 MB). */
  maxGlbBytes: number;
  /** Max triangle count per model (default 50 000). */
  maxTriangles: number;
  /** Max WebP image size in bytes (default 1 MB). */
  maxImageBytes: number;
}

export const DEFAULT_BUDGET: BudgetLimits = {
  maxGlbBytes: 4 * 1024 * 1024,
  maxTriangles: 50_000,
  maxImageBytes: 1 * 1024 * 1024,
};

export interface BudgetViolation {
  file: string;
  kind: "size" | "triangles";
  actual: number;
  limit: number;
  message: string;
}

/** Check a single GLB buffer against size and triangle budgets. */
export function checkGlbBudget(
  name: string,
  data: Uint8Array,
  triangles: number,
  limits: BudgetLimits = DEFAULT_BUDGET,
): BudgetViolation[] {
  const violations: BudgetViolation[] = [];
  if (data.byteLength > limits.maxGlbBytes) {
    violations.push({
      file: name,
      kind: "size",
      actual: data.byteLength,
      limit: limits.maxGlbBytes,
      message: `${name}: ${fmtBytes(data.byteLength)} > ${fmtBytes(limits.maxGlbBytes)}`,
    });
  }
  if (triangles > limits.maxTriangles) {
    violations.push({
      file: name,
      kind: "triangles",
      actual: triangles,
      limit: limits.maxTriangles,
      message: `${name}: ${triangles.toLocaleString()} tris > ${limits.maxTriangles.toLocaleString()}`,
    });
  }
  return violations;
}

/** Check an image buffer against size budget. */
export function checkImageBudget(
  name: string,
  data: Uint8Array,
  limits: BudgetLimits = DEFAULT_BUDGET,
): BudgetViolation[] {
  if (data.byteLength > limits.maxImageBytes) {
    return [
      {
        file: name,
        kind: "size",
        actual: data.byteLength,
        limit: limits.maxImageBytes,
        message: `${name}: ${fmtBytes(data.byteLength)} > ${fmtBytes(limits.maxImageBytes)}`,
      },
    ];
  }
  return [];
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}
