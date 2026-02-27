// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  DiagnosticContext,
  createDiagnosticContext,
  reportDiagnosticAtPath,
} from "./diagnostic-reporter";
import { validateSchema, detectSchemaType } from "./schema-validator";
import {
  validateDeclarativeAgentRego,
  validateApiPluginRego,
  isRegoAvailable,
} from "./rego-rule-validator";
import {
  validateAgent,
  validateActions,
  validateAgentActions,
  validateWebSearch,
  validateEmailCapability,
  validateOneDriveSharePoint,
  validateCopilotConnectors,
  validateTeamsMessages,
  validateEmbeddedKnowledge,
  validateScenarioModels,
  validateDataverse,
  getValueAtPath,
  forEachArrayItem,
  isFileReference,
  parseFileReference,
  analyzeInstructions,
} from "../validators";
import { TextDocument } from "../types";
import { Diagnostic } from "../types";
import * as jsonc from "jsonc-parser";
import { parseErrorToRange } from "../parser";
import { DiagnosticSeverity } from "../types";
import { URI } from "vscode-uri";
import * as fs from "fs";
import * as path from "path";

// Flag to use Rego-based validation (set to true to enable)
const USE_REGO_VALIDATION = true;

/**
 * Run all validations on a document (async version for WASM)
 */
export async function validateDocumentAsync(
  document: TextDocument,
  root: jsonc.Node | undefined,
  content: unknown,
  parseErrors: jsonc.ParseError[]
): Promise<Diagnostic[]> {
  const ctx = createDiagnosticContext(document, root);
  const documentUri = document.uri;

  // Report JSON parse errors
  reportParseErrors(ctx, document, parseErrors);

  if (!content || typeof content !== "object") {
    return ctx.diagnostics;
  }

  // Detect document type
  const schemaType = detectSchemaType(content);

  // Always run schema validation for required fields and structural checks
  if (schemaType) {
    validateSchema(ctx, content, schemaType);
  }

  // Run type-specific validations
  // Use Rego validation when available, otherwise fall back to TypeScript
  if (schemaType === "declarative-agent") {
    if (USE_REGO_VALIDATION && isRegoAvailable()) {
      await validateDeclarativeAgentRego(ctx, content);
    } else {
      validateDeclarativeAgentSync(ctx, content, documentUri);
    }
    // Run file I/O validations (Rego can't do file system access)
    validateFileReferences(ctx, content, documentUri);
    // Run instructions quality analysis
    analyzeInstructions(ctx, content, documentUri);
  } else if (schemaType === "api-plugin") {
    if (USE_REGO_VALIDATION && isRegoAvailable()) {
      await validateApiPluginRego(ctx, content);
    } else {
      validateApiPluginSync(ctx, content);
    }
  }

  // Deduplicate diagnostics
  // 1. Remove exact duplicates (same code+line+char+message)
  // 2. When both schema (M365-004) and Rego report same constraint at same location, prefer Rego
  const seen = new Set<string>();
  const locationToRego = new Map<string, boolean>();

  // First pass: identify which locations have Rego diagnostics
  for (const d of ctx.diagnostics) {
    if (d.code !== "M365-004") {
      const locKey = `${d.range.start.line}:${d.range.start.character}`;
      locationToRego.set(locKey, true);
    }
  }

  // Second pass: filter diagnostics
  ctx.diagnostics = ctx.diagnostics.filter((d) => {
    const key = `${String(d.code)}:${d.range.start.line}:${d.range.start.character}:${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);

    // If this is a schema diagnostic (M365-004) at a location where Rego also reported,
    // check if it's a redundant constraint (e.g., maxItems, minLength)
    if (d.code === "M365-004") {
      const locKey = `${d.range.start.line}:${d.range.start.character}`;
      if (locationToRego.has(locKey)) {
        // Check if schema message overlaps with Rego (e.g., "Must have at most" vs "Too many")
        const msg = d.message?.toLowerCase() || "";
        if (
          msg.includes("must have at most") ||
          msg.includes("must have at least") ||
          msg.includes("must not have more") ||
          msg.includes("maximum") ||
          msg.includes("minimum")
        ) {
          return false; // Skip redundant schema constraint
        }
      }
    }

    return true;
  });

  return ctx.diagnostics;
}

/**
 * Report JSON parse errors as diagnostics
 */
function reportParseErrors(
  ctx: DiagnosticContext,
  document: TextDocument,
  errors: jsonc.ParseError[]
): void {
  for (const error of errors) {
    const range = parseErrorToRange(document, error);
    const message = getParseErrorMessage(error.error);

    ctx.diagnostics.push({
      range,
      severity: DiagnosticSeverity.Error,
      code: "M365-004",
      source: "m365-copilot",
      message,
    });
  }
}

/**
 * Get human-readable message for parse error
 */
function getParseErrorMessage(errorCode: jsonc.ParseErrorCode): string {
  switch (errorCode) {
    case jsonc.ParseErrorCode.InvalidSymbol:
      return "Invalid symbol";
    case jsonc.ParseErrorCode.InvalidNumberFormat:
      return "Invalid number format";
    case jsonc.ParseErrorCode.PropertyNameExpected:
      return "Property name expected";
    case jsonc.ParseErrorCode.ValueExpected:
      return "Value expected";
    case jsonc.ParseErrorCode.ColonExpected:
      return "Colon expected";
    case jsonc.ParseErrorCode.CommaExpected:
      return "Comma expected";
    case jsonc.ParseErrorCode.CloseBraceExpected:
      return "Closing brace expected";
    case jsonc.ParseErrorCode.CloseBracketExpected:
      return "Closing bracket expected";
    case jsonc.ParseErrorCode.EndOfFileExpected:
      return "End of file expected";
    case jsonc.ParseErrorCode.InvalidCommentToken:
      return "Invalid comment";
    case jsonc.ParseErrorCode.UnexpectedEndOfComment:
      return "Unexpected end of comment";
    case jsonc.ParseErrorCode.UnexpectedEndOfString:
      return "Unexpected end of string";
    case jsonc.ParseErrorCode.UnexpectedEndOfNumber:
      return "Unexpected end of number";
    case jsonc.ParseErrorCode.InvalidUnicode:
      return "Invalid unicode escape sequence";
    case jsonc.ParseErrorCode.InvalidEscapeCharacter:
      return "Invalid escape character";
    case jsonc.ParseErrorCode.InvalidCharacter:
      return "Invalid character";
    default:
      return "Parse error";
  }
}

/**
 * Validate declarative agent document (TypeScript fallback)
 */
function validateDeclarativeAgentSync(
  ctx: DiagnosticContext,
  content: unknown,
  documentUri?: string
): void {
  // Run agent-level validations
  validateAgent(ctx, content, documentUri);

  // Validate each capability
  const capabilities = getValueAtPath(content, ["capabilities"]);
  if (Array.isArray(capabilities)) {
    forEachArrayItem(content, ["capabilities"], (_cap, index, path) => {
      const capName = getValueAtPath(content, [...path, "name"]) as string;

      switch (capName) {
        case "WebSearch":
          validateWebSearch(ctx, content, path);
          break;
        case "Email":
          validateEmailCapability(ctx, content, path);
          break;
        case "OneDriveAndSharePoint":
          validateOneDriveSharePoint(ctx, content, path);
          break;
        case "GraphConnectors":
          validateCopilotConnectors(ctx, content, path);
          break;
        case "TeamsMessages":
          validateTeamsMessages(ctx, content, path);
          break;
        case "EmbeddedKnowledge":
          validateEmbeddedKnowledge(ctx, content, path, documentUri);
          break;
        case "ScenarioModels":
          validateScenarioModels(ctx, content, path);
          break;
        case "Dataverse":
          validateDataverse(ctx, content, path);
          break;
        case "Actions":
          validateAgentActions(ctx, content, path);
          break;
      }
    });
  }
}

/**
 * Validate API plugin document (TypeScript fallback)
 */
function validateApiPluginSync(ctx: DiagnosticContext, content: unknown): void {
  validateActions(ctx, content);
}

/**
 * Validate file references that require I/O operations (runs after Rego)
 * This handles file existence and content checks that Rego can't do in WASM
 */
function validateFileReferences(
  ctx: DiagnosticContext,
  content: unknown,
  documentUri?: string
): void {
  if (!documentUri) {
    return;
  }

  // Check instructions file reference
  const instructions = getValueAtPath(content, ["instructions"]);
  if (typeof instructions === "string" && isFileReference(instructions)) {
    const filePath = parseFileReference(instructions);
    if (filePath) {
      validateFileReferenceIO(ctx, ["instructions"], filePath, documentUri);
    }
  }

  // Check embedded knowledge files
  const capabilities = getValueAtPath(content, ["capabilities"]);
  if (Array.isArray(capabilities)) {
    forEachArrayItem(content, ["capabilities"], (_cap, capIndex, capPath) => {
      const capName = getValueAtPath(content, [...capPath, "name"]) as string;
      if (capName === "EmbeddedKnowledge") {
        const files = getValueAtPath(content, [...capPath, "files"]);
        if (Array.isArray(files)) {
          forEachArrayItem(content, [...capPath, "files"], (_file, fileIndex, filePath) => {
            const fileRef = getValueAtPath(content, [...filePath, "file"]) as string;
            if (typeof fileRef === "string") {
              // EmbeddedKnowledge files are direct paths, not $[file()] syntax
              validateEmbeddedFileIO(ctx, [...filePath, "file"], fileRef, documentUri);
            }
          });
        }
      }
    });
  }
}

/**
 * Validate file reference I/O for instructions
 */
function validateFileReferenceIO(
  ctx: DiagnosticContext,
  jsonPath: jsonc.JSONPath,
  filePath: string,
  documentUri: string
): void {
  try {
    const docPath = URI.parse(documentUri).fsPath;
    const docDir = path.dirname(docPath);
    const absolutePath = path.resolve(docDir, filePath);

    if (!fs.existsSync(absolutePath)) {
      reportDiagnosticAtPath(
        ctx,
        jsonPath,
        "M365-007",
        `Instruction file not found: "${filePath}"`,
        DiagnosticSeverity.Error
      );
      return;
    }

    const content = fs.readFileSync(absolutePath, "utf-8");

    if (content.trim().length === 0) {
      reportDiagnosticAtPath(
        ctx,
        jsonPath,
        "M365-003",
        `Instruction file "${filePath}" is empty`,
        DiagnosticSeverity.Error
      );
      return;
    }

    if (content.length > 8000) {
      reportDiagnosticAtPath(
        ctx,
        jsonPath,
        "M365-003",
        `Instruction file "${filePath}" exceeds maximum length of 8000 characters (current: ${content.length})`,
        DiagnosticSeverity.Error
      );
    }
  } catch {
    reportDiagnosticAtPath(
      ctx,
      jsonPath,
      "M365-007",
      `Cannot read instruction file: "${filePath}"`,
      DiagnosticSeverity.Error
    );
  }
}

/**
 * Validate embedded knowledge file I/O
 */
function validateEmbeddedFileIO(
  ctx: DiagnosticContext,
  jsonPath: jsonc.JSONPath,
  filePath: string,
  documentUri: string
): void {
  try {
    const docPath = URI.parse(documentUri).fsPath;
    const docDir = path.dirname(docPath);
    const absolutePath = path.resolve(docDir, filePath);

    if (!fs.existsSync(absolutePath)) {
      reportDiagnosticAtPath(
        ctx,
        jsonPath,
        "M365-007",
        `Embedded knowledge file not found: "${filePath}"`,
        DiagnosticSeverity.Error
      );
    }
  } catch {
    reportDiagnosticAtPath(
      ctx,
      jsonPath,
      "M365-007",
      `Cannot access embedded knowledge file: "${filePath}"`,
      DiagnosticSeverity.Error
    );
  }
}
