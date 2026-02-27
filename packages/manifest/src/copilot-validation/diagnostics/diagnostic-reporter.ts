// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { Diagnostic, DiagnosticSeverity, Range, Position } from "../types";
import { TextDocument } from "../types";
import * as jsonc from "jsonc-parser";
import { findNodeByPath, nodeToRange } from "../parser";

export type DiagnosticCode =
  | "M365-001" // Missing required property
  | "M365-002" // Invalid format (URL, email, GUID)
  | "M365-003" // Constraint violation (length, count)
  | "M365-004" // Schema validation failure
  | "M365-005" // Length exceeds recommendation
  | "M365-006" // Duplicate values
  | "M365-007" // File not found
  | "M365-008" // Invalid file extension
  | "M365-009" // Performance concern
  | "M365-010" // Instruction quality - weak language
  | "M365-011" // Instruction quality - ambiguity
  | "M365-012" // Instruction quality - missing persona / insufficient detail
  | "M365-013" // Instruction quality - missing capability mention
  | "M365-014" // Instruction quality - redundancy
  | "M365-015" // LLM analysis - contradiction
  | "M365-016" // LLM analysis - persona inconsistency
  | "M365-017" // LLM analysis - cognitive load
  | "M365-018" // LLM analysis - coverage gap
  | "M365-019"; // LLM analysis - output shape / safety

export interface DiagnosticContext {
  document: TextDocument;
  root: jsonc.Node | undefined;
  diagnostics: Diagnostic[];
}

/**
 * Create a new diagnostic context for collecting diagnostics
 */
export function createDiagnosticContext(
  document: TextDocument,
  root: jsonc.Node | undefined
): DiagnosticContext {
  return {
    document,
    root,
    diagnostics: [],
  };
}

/**
 * Report a diagnostic at a specific JSON path
 */
export function reportDiagnosticAtPath(
  ctx: DiagnosticContext,
  path: jsonc.JSONPath,
  code: DiagnosticCode,
  message: string,
  severity: DiagnosticSeverity = DiagnosticSeverity.Error
): void {
  let range: Range;

  if (ctx.root) {
    const node = findNodeByPath(ctx.root, path);
    if (node) {
      range = nodeToRange(ctx.document, node);
    } else {
      // Path not found, report at document start
      range = { start: Position.create(0, 0), end: Position.create(0, 1) };
    }
  } else {
    range = { start: Position.create(0, 0), end: Position.create(0, 1) };
  }

  ctx.diagnostics.push({
    range,
    severity,
    code,
    source: "m365-copilot",
    message,
  });
}

/**
 * Report a diagnostic at a specific node
 */
export function reportDiagnosticAtNode(
  ctx: DiagnosticContext,
  node: jsonc.Node,
  code: DiagnosticCode,
  message: string,
  severity: DiagnosticSeverity = DiagnosticSeverity.Error
): void {
  const range = nodeToRange(ctx.document, node);
  ctx.diagnostics.push({
    range,
    severity,
    code,
    source: "m365-copilot",
    message,
  });
}

/**
 * Report a diagnostic at a specific range
 */
export function reportDiagnosticAtRange(
  ctx: DiagnosticContext,
  range: Range,
  code: DiagnosticCode,
  message: string,
  severity: DiagnosticSeverity = DiagnosticSeverity.Error
): void {
  ctx.diagnostics.push({
    range,
    severity,
    code,
    source: "m365-copilot",
    message,
  });
}

/**
 * Report a diagnostic for a missing required property
 */
export function reportMissingProperty(
  ctx: DiagnosticContext,
  parentPath: jsonc.JSONPath,
  propertyName: string
): void {
  reportDiagnosticAtPath(
    ctx,
    parentPath,
    "M365-001",
    `Missing required property: "${propertyName}"`,
    DiagnosticSeverity.Error
  );
}

/**
 * Report a diagnostic for an invalid format
 */
export function reportInvalidFormat(
  ctx: DiagnosticContext,
  path: jsonc.JSONPath,
  expectedFormat: string,
  actualValue?: string
): void {
  const valueInfo = actualValue ? ` (got: "${actualValue}")` : "";
  reportDiagnosticAtPath(
    ctx,
    path,
    "M365-002",
    `Invalid format: expected ${expectedFormat}${valueInfo}`,
    DiagnosticSeverity.Error
  );
}

/**
 * Report a diagnostic for a constraint violation
 */
export function reportConstraintViolation(
  ctx: DiagnosticContext,
  path: jsonc.JSONPath,
  constraint: string
): void {
  reportDiagnosticAtPath(ctx, path, "M365-003", constraint, DiagnosticSeverity.Error);
}

/**
 * Report a diagnostic for a length warning
 */
export function reportLengthWarning(
  ctx: DiagnosticContext,
  path: jsonc.JSONPath,
  propertyName: string,
  actualLength: number,
  maxLength: number
): void {
  reportDiagnosticAtPath(
    ctx,
    path,
    "M365-005",
    `"${propertyName}" length (${actualLength}) exceeds recommended maximum of ${maxLength} characters`,
    DiagnosticSeverity.Warning
  );
}

/**
 * Report a diagnostic for duplicate values
 */
export function reportDuplicateValues(
  ctx: DiagnosticContext,
  path: jsonc.JSONPath,
  duplicateValue: string
): void {
  reportDiagnosticAtPath(
    ctx,
    path,
    "M365-006",
    `Duplicate value: "${duplicateValue}"`,
    DiagnosticSeverity.Warning
  );
}

/**
 * Report a diagnostic for a file not found
 */
export function reportFileNotFound(
  ctx: DiagnosticContext,
  path: jsonc.JSONPath,
  filePath: string
): void {
  reportDiagnosticAtPath(
    ctx,
    path,
    "M365-007",
    `File not found: "${filePath}"`,
    DiagnosticSeverity.Error
  );
}

/**
 * Report a diagnostic for an invalid file extension
 */
export function reportInvalidExtension(
  ctx: DiagnosticContext,
  path: jsonc.JSONPath,
  filePath: string,
  allowedExtensions: string[]
): void {
  reportDiagnosticAtPath(
    ctx,
    path,
    "M365-008",
    `Invalid file extension for "${filePath}". Allowed: ${allowedExtensions.join(", ")}`,
    DiagnosticSeverity.Error
  );
}
