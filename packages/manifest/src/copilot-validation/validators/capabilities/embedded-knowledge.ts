// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DiagnosticSeverity } from "../../types";
import { DiagnosticContext, reportDiagnosticAtPath } from "../../diagnostics/diagnostic-reporter";
import {
  validateRelativePath,
  validateFileExtension,
  validateArrayMaxLength,
  validateArrayMinLength,
  validateNotEmpty,
  getValueAtPath,
  forEachArrayItem,
} from "../utils";
import * as fs from "fs";
import * as path from "path";

interface EmbeddedKnowledgeFile {
  file: string;
  description?: string;
}

interface EmbeddedKnowledgeCapability {
  name: "EmbeddedKnowledge";
  files?: EmbeddedKnowledgeFile[];
}

const ALLOWED_EXTENSIONS = ["doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "pdf"];
const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB per .NET ManifestRules

/**
 * Validate EmbeddedKnowledge capability
 */
export function validateEmbeddedKnowledge(
  ctx: DiagnosticContext,
  content: unknown,
  capabilityPath: (string | number)[],
  documentUri?: string
): void {
  const capability = getValueAtPath(content, capabilityPath) as EmbeddedKnowledgeCapability;
  if (!capability || capability.name !== "EmbeddedKnowledge") {
    return;
  }

  const filesPath = [...capabilityPath, "files"];
  const files = getValueAtPath(content, filesPath);

  if (!Array.isArray(files)) {
    // Files is required for EmbeddedKnowledge
    reportDiagnosticAtPath(
      ctx,
      capabilityPath,
      "M365-001",
      'EmbeddedKnowledge capability requires "files" array',
      DiagnosticSeverity.Error
    );
    return;
  }

  // Must have at least 1 file
  validateArrayMinLength(ctx, content, filesPath, "files", 1);

  // Max 10 files
  validateArrayMaxLength(ctx, content, filesPath, "files", 10);

  // Validate each file
  forEachArrayItem<EmbeddedKnowledgeFile>(content, filesPath, (fileObj, index, itemPath) => {
    const filePath = [...itemPath, "file"];
    const fileValue = fileObj.file;

    // File property is required
    validateNotEmpty(ctx, content, filePath, "file");

    // Must be relative path
    validateRelativePath(ctx, content, filePath, "file");

    // Must have valid extension
    validateFileExtension(ctx, content, filePath, "file", ALLOWED_EXTENSIONS);

    // Check if file exists and validate size (if documentUri provided)
    if (documentUri && fileValue) {
      validateEmbeddedFile(ctx, filePath, fileValue, documentUri);
    }
  });
}

/**
 * Validate that an embedded knowledge file exists, is not empty, and is within size limits
 */
function validateEmbeddedFile(
  ctx: DiagnosticContext,
  filePath: (string | number)[],
  fileValue: string,
  documentUri: string
): void {
  try {
    // Parse the document URI to get the directory
    const docPath = documentUri.replace("file://", "");
    const docDir = path.dirname(docPath);

    // Look in appPackage folder relative to document
    const appPackageDir = path.resolve(docDir, "..");
    const fullPath = path.resolve(appPackageDir, fileValue);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      reportDiagnosticAtPath(
        ctx,
        filePath,
        "M365-007",
        `File not found in appPackage folder: "${fileValue}"`,
        DiagnosticSeverity.Error
      );
      return;
    }

    // Check file size
    const stats = fs.statSync(fullPath);

    if (stats.size === 0) {
      reportDiagnosticAtPath(
        ctx,
        filePath,
        "M365-003",
        `File is empty: "${fileValue}"`,
        DiagnosticSeverity.Error
      );
      return;
    }

    if (stats.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = Math.round(stats.size / (1024 * 1024));
      reportDiagnosticAtPath(
        ctx,
        filePath,
        "M365-003",
        `File exceeds 1 MB size limit (current: ${sizeMB} MB): "${fileValue}"`,
        DiagnosticSeverity.Error
      );
    }
  } catch {
    // File system errors are silently ignored (file may not exist yet during editing)
  }
}
