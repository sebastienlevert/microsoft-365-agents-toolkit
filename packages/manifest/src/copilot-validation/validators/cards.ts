// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DiagnosticSeverity } from "../types";
import { DiagnosticContext, reportDiagnosticAtPath } from "../diagnostics/diagnostic-reporter";
import { validateNotEmpty, validateRelativePath, getValueAtPath } from "./utils";
import * as fs from "fs";
import * as path from "path";
import { URI } from "vscode-uri";

interface CardDefinition {
  file: string;
  data_path?: string;
}

/**
 * Validate adaptive card references
 */
export function validateCard(
  ctx: DiagnosticContext,
  content: unknown,
  cardPath: (string | number)[],
  documentUri?: string
): void {
  const card = getValueAtPath(content, cardPath) as CardDefinition;
  if (!card || typeof card !== "object") {
    return;
  }

  // Validate file property
  const filePath = [...cardPath, "file"];
  if (card.file !== undefined) {
    validateNotEmpty(ctx, content, filePath, "file");
    validateRelativePath(ctx, content, filePath, "file");

    // Try to validate file exists and is valid JSON
    if (documentUri && card.file) {
      validateCardFile(ctx, filePath, card.file, documentUri);
    }
  }

  // Validate data_path if present
  if (card.data_path !== undefined) {
    validateNotEmpty(ctx, content, [...cardPath, "data_path"], "data_path");
  }
}

/**
 * Validate that a card file exists and contains valid JSON
 */
function validateCardFile(
  ctx: DiagnosticContext,
  filePath: (string | number)[],
  cardFile: string,
  documentUri: string
): void {
  try {
    const docUri = URI.parse(documentUri);
    const docDir = path.dirname(docUri.fsPath);
    const cardFullPath = path.resolve(docDir, cardFile);

    // Check if file exists
    if (!fs.existsSync(cardFullPath)) {
      reportDiagnosticAtPath(
        ctx,
        filePath,
        "M365-007",
        `Card file not found: "${cardFile}"`,
        DiagnosticSeverity.Error
      );
      return;
    }

    // Check if file is empty
    const stats = fs.statSync(cardFullPath);
    if (stats.size === 0) {
      reportDiagnosticAtPath(
        ctx,
        filePath,
        "M365-003",
        `Card file is empty: "${cardFile}"`,
        DiagnosticSeverity.Error
      );
      return;
    }

    // Try to parse as JSON
    const cardContent = fs.readFileSync(cardFullPath, "utf-8");
    try {
      JSON.parse(cardContent);
    } catch {
      reportDiagnosticAtPath(
        ctx,
        filePath,
        "M365-004",
        `Card file contains invalid JSON: "${cardFile}"`,
        DiagnosticSeverity.Error
      );
    }
  } catch {
    // File system errors are silently ignored
  }
}

/**
 * Validate response semantics constraints
 */
export function validateResponseSemantics(
  ctx: DiagnosticContext,
  content: unknown,
  semanticsPath: (string | number)[]
): void {
  const semantics = getValueAtPath(content, semanticsPath);
  if (!semantics || typeof semantics !== "object") {
    return;
  }

  const semObj = semantics as Record<string, unknown>;

  // If data_path is set, properties.title is required
  if (semObj.data_path !== undefined) {
    const titlePath = [...semanticsPath, "properties", "title"];
    const title = getValueAtPath(content, titlePath);

    if (title === undefined) {
      reportDiagnosticAtPath(
        ctx,
        semanticsPath,
        "M365-001",
        'When "data_path" is set, "properties.title" is required',
        DiagnosticSeverity.Error
      );
    }
  }
}
