// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import Ajv, { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020";
import draft04 from "ajv-draft-04";
import { DiagnosticSeverity } from "../types";
import * as jsonc from "jsonc-parser";
import {
  DiagnosticContext,
  reportDiagnosticAtPath,
  reportDiagnosticAtRange,
} from "./diagnostic-reporter";
import { nodeToRange, findNodeByPath } from "../parser";

// Import schemas
import declarativeAgentSchema from "../schemas/declarative-agent-v1.6.json";
import apiPluginSchema from "../schemas/api-plugin-v2.3.json";

// Use AJV with draft-04 support for these schemas
const ajv = new draft04({
  allErrors: true,
  verbose: true,
  strict: false,
});
addFormats(ajv);

// Compile schemas
const validateDeclarativeAgent = ajv.compile(declarativeAgentSchema);
const validateApiPlugin = ajv.compile(apiPluginSchema);

export type SchemaType = "declarative-agent" | "api-plugin";

/**
 * Validate a document against its JSON schema
 */
export function validateSchema(
  ctx: DiagnosticContext,
  content: unknown,
  schemaType: SchemaType
): void {
  const validate =
    schemaType === "declarative-agent" ? validateDeclarativeAgent : validateApiPlugin;

  const valid = validate(content);

  if (!valid && validate.errors) {
    const filteredErrors = filterAnyOfErrors(validate.errors);
    for (const error of filteredErrors) {
      reportSchemaError(ctx, error);
    }
  }
}

/**
 * Filter out redundant anyOf/oneOf errors when we have a more specific error.
 *
 * When a capability has the correct "name" but fails another constraint (e.g., maxItems),
 * AJV reports errors for every alternative in the anyOf array. This function filters
 * those redundant errors to only show the actual constraint violation.
 */
function filterAnyOfErrors(errors: ErrorObject[]): ErrorObject[] {
  // Group errors by their instance path (e.g., /capabilities/0)
  const errorsByPath = new Map<string, ErrorObject[]>();

  for (const error of errors) {
    const basePath = getBasePath(error.instancePath);
    if (!errorsByPath.has(basePath)) {
      errorsByPath.set(basePath, []);
    }
    errorsByPath.get(basePath)!.push(error);
  }

  const result: ErrorObject[] = [];

  for (const [basePath, pathErrors] of errorsByPath) {
    // Check if we have "name" related errors (indicating trying to match wrong capability type)
    const hasNameConstError = pathErrors.some(
      (e) => e.keyword === "const" && e.instancePath.endsWith("/name")
    );

    // Find direct constraint violation errors (like maxItems, maxLength, etc.)
    // These are the "real" errors we want to show
    const directConstraintErrors = pathErrors.filter((e) =>
      [
        "maxItems",
        "minItems",
        "maxLength",
        "minLength",
        "pattern",
        "format",
        "maximum",
        "minimum",
      ].includes(e.keyword)
    );

    // If we have direct constraint errors and name matching failures,
    // it means the capability type is correct but a constraint is violated
    // In this case, only keep the constraint errors
    if (directConstraintErrors.length > 0 && hasNameConstError) {
      result.push(...directConstraintErrors);
      continue;
    }

    // If we don't have constraint errors, check if there are meaningful structural errors
    const structuralErrors = pathErrors.filter(
      (e) =>
        e.keyword !== "anyOf" &&
        e.keyword !== "oneOf" &&
        e.keyword !== "const" &&
        e.keyword !== "enum" &&
        e.keyword !== "propertyNames"
    );

    // If we have name matching failures, filter out "required" errors from wrong schema matches
    if (hasNameConstError) {
      // Only keep required errors if they're NOT from trying to match a different capability
      // (i.e., don't show "Missing required property: files" when we're validating WebSearch)
      const filteredStructural = structuralErrors.filter((e) => {
        if (e.keyword === "required") {
          // Skip required errors when we have direct constraint violations
          return false;
        }
        return true;
      });

      if (filteredStructural.length > 0) {
        result.push(...filteredStructural);
        continue;
      }
    }

    // Check for anyOf/oneOf errors - these are noisy when we have real errors
    const anyOfErrors = pathErrors.filter((e) => e.keyword === "anyOf" || e.keyword === "oneOf");
    const otherErrors = pathErrors.filter((e) => e.keyword !== "anyOf" && e.keyword !== "oneOf");

    // If we have both anyOf errors and other errors at the same exact path,
    // prefer the more specific errors
    if (anyOfErrors.length > 0 && otherErrors.length > 0) {
      // Check if we have meaningful other errors (not just const/enum for name matching)
      const meaningfulOtherErrors = otherErrors.filter(
        (e) => e.keyword !== "const" || !e.instancePath.endsWith("/name")
      );

      if (meaningfulOtherErrors.length > 0) {
        result.push(...meaningfulOtherErrors);
      } else {
        // All other errors are just name matching failures, keep anyOf errors
        result.push(...anyOfErrors);
      }
    } else {
      result.push(...pathErrors);
    }
  }

  // Final deduplication: remove duplicate error messages at the same location
  const seen = new Set<string>();
  return result.filter((error) => {
    const key = `${error.instancePath}:${error.keyword}:${error.message ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Get the base path for grouping related errors.
 * For capability errors, this groups by the capability index.
 */
function getBasePath(instancePath: string): string {
  // For paths like /capabilities/0/sites or /capabilities/0/name,
  // return /capabilities/0 to group related errors
  const match = instancePath.match(/^(\/capabilities\/\d+)/);
  if (match) {
    return match[1];
  }

  // For paths like /functions/0/name, group by /functions/0
  const funcMatch = instancePath.match(/^(\/functions\/\d+)/);
  if (funcMatch) {
    return funcMatch[1];
  }

  return instancePath;
}

/**
 * Convert an AJV error to an LSP diagnostic
 */
function reportSchemaError(ctx: DiagnosticContext, error: ErrorObject): void {
  const path = ajvPathToJsonPath(error.instancePath);
  const message = formatSchemaErrorMessage(error);

  // Try to find the node for better range detection
  if (ctx.root) {
    const node = findNodeByPath(ctx.root, path);
    if (node) {
      reportDiagnosticAtRange(
        ctx,
        nodeToRange(ctx.document, node),
        "M365-004",
        message,
        DiagnosticSeverity.Error
      );
      return;
    }
  }

  reportDiagnosticAtPath(ctx, path, "M365-004", message, DiagnosticSeverity.Error);
}

/**
 * Convert AJV instance path to JSON path array
 */
function ajvPathToJsonPath(instancePath: string): jsonc.JSONPath {
  if (!instancePath || instancePath === "") {
    return [];
  }

  // AJV uses /foo/0/bar format
  return instancePath
    .split("/")
    .filter((p) => p !== "")
    .map((p) => {
      const num = parseInt(p, 10);
      return isNaN(num) ? p : num;
    });
}

/**
 * Format a schema error message for display
 */
function formatSchemaErrorMessage(error: ErrorObject): string {
  const property = error.instancePath || "root";
  const params = error.params as Record<string, unknown>;

  switch (error.keyword) {
    case "required":
      return `Missing required property: "${String(params.missingProperty)}"`;

    case "type":
      return `${property}: Expected ${String(params.type)}, got ${typeof error.data}`;

    case "enum":
      return `${property}: Must be one of: ${(params.allowedValues as string[]).join(", ")}`;

    case "minLength":
      return `${property}: Must be at least ${String(params.limit)} characters`;

    case "maxLength":
      return `${property}: Must be at most ${String(params.limit)} characters`;

    case "minimum":
      return `${property}: Must be >= ${String(params.limit)}`;

    case "maximum":
      return `${property}: Must be <= ${String(params.limit)}`;

    case "minItems":
      return `${property}: Must have at least ${String(params.limit)} items`;

    case "maxItems":
      return `${property}: Must have at most ${String(params.limit)} items`;

    case "pattern":
      return `${property}: Does not match required pattern`;

    case "format":
      return `${property}: Invalid ${String(params.format)} format`;

    case "additionalProperties":
      return `${property}: Unknown property "${String(params.additionalProperty)}"`;

    case "oneOf":
    case "anyOf":
      return `${property}: Does not match any allowed schema`;

    default:
      return `${property}: ${error.message || "Schema validation failed"}`;
  }
}

/**
 * Detect schema type from $schema property or content heuristics
 */
export function detectSchemaType(content: unknown): SchemaType | undefined {
  if (!content || typeof content !== "object") {
    return undefined;
  }

  const obj = content as Record<string, unknown>;
  const schema = obj.$schema;

  if (typeof schema === "string") {
    if (schema.includes("declarative-agent")) {
      return "declarative-agent";
    }
    if (schema.includes("plugin")) {
      return "api-plugin";
    }
  }

  // Heuristic detection
  if ("instructions" in obj && "name" in obj) {
    return "declarative-agent";
  }
  if ("runtimes" in obj || "functions" in obj) {
    return "api-plugin";
  }

  return undefined;
}
