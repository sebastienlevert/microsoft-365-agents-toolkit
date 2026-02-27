// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Bridge module between ATK's manifest validation flow and the
 * copilot-validation deep validation engine.
 *
 * Provides a simple string-array interface that matches
 * ManifestUtil.validateManifest() output, so callers can
 * append deep validation results to existing schema results.
 */

import { validate, ValidationResult, ValidationError } from "./copilot-validation";

export { ValidationResult, ValidationError };
export { getValidationRules, parseJson, DocumentType } from "./copilot-validation";
export type { ValidationRule } from "./copilot-validation/validation-rules";

/**
 * Run deep validation on a declarative agent or API plugin manifest.
 *
 * Returns the rich {@link ValidationResult} with typed errors, codes,
 * severity, line numbers, and fix hints.
 *
 * @param manifest - The manifest object (or raw JSON string)
 * @param options  - Optional filename for file-reference resolution
 */
export async function validateCopilotManifest(
  manifest: string | Record<string, unknown>,
  options: { filename?: string } = {}
): Promise<ValidationResult> {
  return validate(manifest, { filename: options.filename, skipFileChecks: false });
}

/**
 * Run deep validation and return results as a simple string array,
 * matching the format of ManifestUtil.validateManifest().
 *
 * Errors are prefixed with their diagnostic code (e.g. "M365-002").
 * Warnings are prefixed with "[warn]".
 *
 * @param manifest - The manifest object (or raw JSON string)
 * @param options  - Optional filename for file-reference resolution
 */
export async function validateCopilotManifestAsStrings(
  manifest: string | Record<string, unknown>,
  options: { filename?: string } = {}
): Promise<string[]> {
  const result = await validateCopilotManifest(manifest, options);
  return [
    ...result.errors.map(formatValidationError),
    ...result.warnings.map((w) => `[warn] ${formatValidationError(w)}`),
  ];
}

function formatValidationError(e: ValidationError): string {
  const location = `Ln ${e.line}, Col ${e.column}`;
  return `${e.code} ${e.path} ${e.message} (${location})${e.hint ? ` Hint: ${e.hint}` : ""}`;
}
