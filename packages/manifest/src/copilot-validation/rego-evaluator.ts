// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import { loadPolicy } from "@open-policy-agent/opa-wasm";

export interface RegoResult {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
}

export type ManifestVersion = "v1.0" | "v1.2" | "v1.3" | "v1.4" | "v1.5" | "v1.6";
export type ApiPluginVersion = "v2.1" | "v2.2" | "v2.3" | "v2.4";

interface LoadedPolicy {
  evaluate: (input: unknown, entrypoint?: string | number) => unknown[];
  setData: (data: unknown) => void;
}

// Cache for loaded policy
let cachedPolicy: LoadedPolicy | null = null;
let policyLoadPromise: Promise<LoadedPolicy> | null = null;

// Entrypoint IDs (set after policy is loaded)
let entrypointIds: Record<string, number> = {};

/**
 * Get the path to the WASM bundle
 */
function getWasmPath(): string {
  const candidates = [
    path.join(__dirname, "rules", "bundle.wasm"), // From build/copilot-validation/
    path.join(__dirname, "..", "rules", "bundle.wasm"),
    path.join(__dirname, "..", "..", "rules", "bundle.wasm"),
    path.join(__dirname, "..", "copilot-validation", "rules", "bundle.wasm"), // From build/
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`WASM bundle not found. Searched: ${candidates.join(", ")}`);
}

/**
 * Load the compiled OPA policy (singleton with lazy loading)
 */
async function loadCompiledPolicy(): Promise<LoadedPolicy> {
  if (cachedPolicy) {
    return cachedPolicy;
  }

  // Prevent multiple simultaneous loads
  if (policyLoadPromise) {
    return policyLoadPromise;
  }

  policyLoadPromise = (async () => {
    const wasmPath = getWasmPath();
    const wasmBytes = fs.readFileSync(wasmPath);

    const policy = (await loadPolicy(wasmBytes)) as LoadedPolicy;

    // Get entrypoint IDs from the policy
    const policyAny = policy as unknown as { entrypoints: Record<string, number> };
    if (policyAny.entrypoints) {
      entrypointIds = policyAny.entrypoints;
    }

    cachedPolicy = policy;
    return policy;
  })();

  return policyLoadPromise;
}

/**
 * Evaluate a specific entrypoint
 */
function evaluateEntrypoint(
  policy: LoadedPolicy,
  input: unknown,
  entrypoint: string
): RegoResult[] {
  try {
    // Try to get the entrypoint ID
    const entrypointId = entrypointIds[entrypoint];

    let resultSet: unknown[];
    if (entrypointId !== undefined) {
      resultSet = policy.evaluate(input, entrypointId);
    } else {
      // Fallback: try with string entrypoint
      resultSet = policy.evaluate(input, entrypoint);
    }

    if (resultSet && resultSet.length > 0) {
      const result = resultSet[0] as { result?: RegoResult[] };
      if (result.result && Array.isArray(result.result)) {
        return result.result;
      }
    }
    return [];
  } catch (error) {
    // Entrypoint may not exist in bundle
    return [];
  }
}

/**
 * Evaluate declarative agent manifest
 */
export async function evaluateDeclarativeAgent(
  manifest: unknown,
  version?: ManifestVersion
): Promise<RegoResult[]> {
  const policy = await loadCompiledPolicy();
  const v = version || detectVersion(manifest);
  const versionPackage = v.replace(".", "_");

  const agentResults = evaluateEntrypoint(policy, manifest, `m365/${versionPackage}/agent/deny`);

  const capResults = evaluateEntrypoint(
    policy,
    manifest,
    `m365/${versionPackage}/capabilities/deny`
  );

  return [...agentResults, ...capResults];
}

/**
 * Evaluate API plugin manifest
 */
export async function evaluateApiPlugin(
  manifest: unknown,
  version?: ApiPluginVersion
): Promise<RegoResult[]> {
  const policy = await loadCompiledPolicy();
  const v = version || detectApiPluginVersion(manifest);
  const versionPackage = v.replace(".", "_");
  return evaluateEntrypoint(policy, manifest, `m365/api_plugin/${versionPackage}/deny`);
}

/**
 * Detect manifest version from content
 */
function detectVersion(manifest: unknown): ManifestVersion {
  if (typeof manifest === "object" && manifest !== null) {
    const m = manifest as Record<string, unknown>;
    if (m.version === "v1.0") return "v1.0";
    if (m.version === "v1.2") return "v1.2";
    if (m.version === "v1.3") return "v1.3";
    if (m.version === "v1.4") return "v1.4";
    if (m.version === "v1.5") return "v1.5";
  }
  return "v1.6";
}

/**
 * Detect API plugin version from content
 */
function detectApiPluginVersion(manifest: unknown): ApiPluginVersion {
  if (typeof manifest === "object" && manifest !== null) {
    const m = manifest as Record<string, unknown>;
    if (m.schema_version === "v2.1") return "v2.1";
    if (m.schema_version === "v2.2") return "v2.2";
    if (m.schema_version === "v2.3") return "v2.3";
  }
  return "v2.4";
}

/**
 * Check if Rego evaluation is available
 */
export function isRegoAvailable(): boolean {
  try {
    getWasmPath();
    return true;
  } catch {
    return false;
  }
}

/**
 * Pre-load the policy (call at startup for faster first validation)
 */
export async function preloadPolicy(): Promise<void> {
  await loadCompiledPolicy();
}

/**
 * Clear the policy cache (useful for testing)
 */
export function clearPolicyCache(): void {
  cachedPolicy = null;
  policyLoadPromise = null;
  entrypointIds = {};
}
