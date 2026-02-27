// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as jsonc from "jsonc-parser";
import { DiagnosticContext, reportDiagnosticAtPath } from "../diagnostics/diagnostic-reporter";
import { DiagnosticSeverity } from "../types";
import { findNodeByPath } from "../parser";

/**
 * Validate that a string property is not empty
 */
export function validateNotEmpty(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string
): boolean {
  const value = getValueAtPath(content, path);
  if (typeof value === "string" && value.trim().length === 0) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-003",
      `"${propertyName}" must not be empty`,
      DiagnosticSeverity.Error
    );
    return false;
  }
  return true;
}

/**
 * Validate string max length
 */
export function validateMaxLength(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string,
  maxLength: number,
  severity: DiagnosticSeverity = DiagnosticSeverity.Error
): boolean {
  const value = getValueAtPath(content, path);
  if (typeof value === "string" && value.length > maxLength) {
    reportDiagnosticAtPath(
      ctx,
      path,
      severity === DiagnosticSeverity.Error ? "M365-003" : "M365-005",
      `"${propertyName}" exceeds maximum length of ${maxLength} characters (current: ${value.length})`,
      severity
    );
    return false;
  }
  return true;
}

/**
 * Validate string min length
 */
export function validateMinLength(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string,
  minLength: number
): boolean {
  const value = getValueAtPath(content, path);
  if (typeof value === "string" && value.length < minLength) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-003",
      `"${propertyName}" must be at least ${minLength} characters`,
      DiagnosticSeverity.Error
    );
    return false;
  }
  return true;
}

/**
 * Validate array max length
 */
export function validateArrayMaxLength(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string,
  maxLength: number
): boolean {
  const value = getValueAtPath(content, path);
  if (Array.isArray(value) && value.length > maxLength) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-003",
      `"${propertyName}" exceeds maximum of ${maxLength} items (current: ${value.length})`,
      DiagnosticSeverity.Error
    );
    return false;
  }
  return true;
}

/**
 * Validate array min length
 */
export function validateArrayMinLength(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string,
  minLength: number
): boolean {
  const value = getValueAtPath(content, path);
  if (Array.isArray(value) && value.length < minLength) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-003",
      `"${propertyName}" must have at least ${minLength} items`,
      DiagnosticSeverity.Error
    );
    return false;
  }
  return true;
}

/**
 * Validate no duplicate values in array
 */
export function validateNoDuplicates(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string,
  keyExtractor?: (item: unknown) => string
): boolean {
  const value = getValueAtPath(content, path);
  if (!Array.isArray(value)) {
    return true;
  }

  const seen = new Set<string>();
  let hasError = false;

  for (let i = 0; i < value.length; i++) {
    const key = keyExtractor ? keyExtractor(value[i]) : String(value[i]);
    if (seen.has(key)) {
      reportDiagnosticAtPath(
        ctx,
        [...path, i],
        "M365-006",
        `Duplicate value in "${propertyName}": "${key}"`,
        DiagnosticSeverity.Warning
      );
      hasError = true;
    }
    seen.add(key);
  }

  return !hasError;
}

/**
 * Validate URL format (absolute URL, no file://)
 */
export function validateAbsoluteUrl(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string
): boolean {
  const value = getValueAtPath(content, path);
  if (typeof value !== "string") {
    return true;
  }

  try {
    const url = new URL(value);
    if (url.protocol === "file:") {
      reportDiagnosticAtPath(
        ctx,
        path,
        "M365-002",
        `"${propertyName}" must be an HTTP or HTTPS URL, not a file URL`,
        DiagnosticSeverity.Error
      );
      return false;
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      reportDiagnosticAtPath(
        ctx,
        path,
        "M365-002",
        `"${propertyName}" must be an HTTP or HTTPS URL`,
        DiagnosticSeverity.Error
      );
      return false;
    }
    return true;
  } catch {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-002",
      `"${propertyName}" is not a valid URL`,
      DiagnosticSeverity.Error
    );
    return false;
  }
}

/**
 * Validate URL has no query parameters
 */
export function validateNoQueryParams(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string
): boolean {
  const value = getValueAtPath(content, path);
  if (typeof value !== "string") {
    return true;
  }

  try {
    const url = new URL(value);
    if (url.search) {
      reportDiagnosticAtPath(
        ctx,
        path,
        "M365-002",
        `"${propertyName}" must not contain query parameters`,
        DiagnosticSeverity.Error
      );
      return false;
    }
    return true;
  } catch {
    return true; // URL validation handled elsewhere
  }
}

/**
 * Validate URL max path segments
 */
export function validateMaxPathSegments(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string,
  maxSegments: number
): boolean {
  const value = getValueAtPath(content, path);
  if (typeof value !== "string") {
    return true;
  }

  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter((s) => s.length > 0);
    if (segments.length > maxSegments) {
      reportDiagnosticAtPath(
        ctx,
        path,
        "M365-002",
        `"${propertyName}" URL path must have at most ${maxSegments} segments (current: ${segments.length})`,
        DiagnosticSeverity.Error
      );
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Validate email format
 */
export function validateEmail(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string
): boolean {
  const value = getValueAtPath(content, path);
  if (typeof value !== "string") {
    return true;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-002",
      `"${propertyName}" is not a valid email address`,
      DiagnosticSeverity.Error
    );
    return false;
  }
  return true;
}

/**
 * Validate GUID format {8-4-4-4-12}
 */
export function validateGuid(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string
): boolean {
  const value = getValueAtPath(content, path);
  if (typeof value !== "string") {
    return true;
  }

  const guidRegex =
    /^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?$/;
  if (!guidRegex.test(value)) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-002",
      `"${propertyName}" is not a valid GUID format`,
      DiagnosticSeverity.Error
    );
    return false;
  }
  return true;
}

/**
 * Validate prefixed GUID format: optional T_, U_, or P_ prefix followed by {8-4-4-4-12}
 */
export function validatePrefixedGuid(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string
): boolean {
  const value = getValueAtPath(content, path);
  if (typeof value !== "string") {
    return true;
  }

  const prefixedGuidRegex =
    /^(?:[TUP]_)?\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?$/;
  if (!prefixedGuidRegex.test(value)) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-002",
      `"${propertyName}" is not a valid GUID format (optional T_, U_, or P_ prefix allowed)`,
      DiagnosticSeverity.Error
    );
    return false;
  }
  return true;
}

/**
 * Validate file path is relative (no / prefix, no ../ traversal, no Windows absolute paths)
 */
export function validateRelativePath(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string
): boolean {
  const value = getValueAtPath(content, path);
  if (typeof value !== "string") {
    return true;
  }

  // Check for Unix absolute path
  if (value.startsWith("/")) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-002",
      `"${propertyName}" must be a relative path (no leading /)`,
      DiagnosticSeverity.Error
    );
    return false;
  }

  // Check for Windows absolute path (e.g., C:\, D:\, etc.)
  if (/^[A-Za-z]:[/\\]/.test(value)) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-002",
      `"${propertyName}" must be a relative path (no Windows drive letter)`,
      DiagnosticSeverity.Error
    );
    return false;
  }

  // Check for UNC path (\\server\share or //server/share)
  if (value.startsWith("\\\\") || value.startsWith("//")) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-002",
      `"${propertyName}" must be a relative path (no UNC paths)`,
      DiagnosticSeverity.Error
    );
    return false;
  }

  // Check for path traversal
  if (value.includes("../") || value.includes("..\\")) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-002",
      `"${propertyName}" must not contain path traversal (../)`,
      DiagnosticSeverity.Error
    );
    return false;
  }

  return true;
}

/**
 * Validate file extension
 */
export function validateFileExtension(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string,
  allowedExtensions: string[]
): boolean {
  const value = getValueAtPath(content, path);
  if (typeof value !== "string") {
    return true;
  }

  const ext = value.split(".").pop()?.toLowerCase();
  if (!ext || !allowedExtensions.includes(ext)) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-008",
      `"${propertyName}" has invalid extension. Allowed: ${allowedExtensions.join(", ")}`,
      DiagnosticSeverity.Error
    );
    return false;
  }
  return true;
}

/**
 * Validate a required property exists
 */
export function validateRequired(
  ctx: DiagnosticContext,
  content: unknown,
  path: jsonc.JSONPath,
  propertyName: string
): boolean {
  const parentPath = path.slice(0, -1);
  const parent = getValueAtPath(content, parentPath);

  if (parent === undefined || parent === null) {
    return true; // Parent doesn't exist, will be caught elsewhere
  }

  const value = getValueAtPath(content, path);
  if (value === undefined) {
    reportDiagnosticAtPath(
      ctx,
      parentPath.length > 0 ? parentPath : [],
      "M365-001",
      `Missing required property: "${propertyName}"`,
      DiagnosticSeverity.Error
    );
    return false;
  }
  return true;
}

/**
 * Get value at a JSON path from parsed content
 */
export function getValueAtPath(content: unknown, path: jsonc.JSONPath): unknown {
  let current: unknown = content;
  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof key === "number" && Array.isArray(current)) {
      current = current[key];
    } else if (typeof key === "string" && typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Check if a value exists at a path
 */
export function hasValueAtPath(content: unknown, path: jsonc.JSONPath): boolean {
  return getValueAtPath(content, path) !== undefined;
}

/**
 * Iterate over array items and validate each
 */
export function forEachArrayItem<T>(
  content: unknown,
  path: jsonc.JSONPath,
  callback: (item: T, index: number, itemPath: jsonc.JSONPath) => void
): void {
  const value = getValueAtPath(content, path);
  if (!Array.isArray(value)) {
    return;
  }

  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    // Skip null/undefined items - schema validation will catch these
    if (item === null || item === undefined) {
      continue;
    }
    callback(item as T, i, [...path, i]);
  }
}

// File reference pattern: $[file('path/to/file.md')] or $[file("path/to/file.md")]
const FILE_REFERENCE_PATTERN = /^\$\[file\(['"](.+)['"]\)\]$/;

/**
 * Check if a string is a file reference ($[file('path')] syntax)
 */
export function isFileReference(value: string): boolean {
  return FILE_REFERENCE_PATTERN.test(value);
}

/**
 * Parse a file reference and extract the path
 * Returns null if not a valid file reference
 */
export function parseFileReference(value: string): string | null {
  const match = value.match(FILE_REFERENCE_PATTERN);
  return match ? match[1] : null;
}

/**
 * Validate file reference path security (no traversal, relative paths only)
 */
export function validateFileReferencePath(
  ctx: DiagnosticContext,
  path: jsonc.JSONPath,
  filePath: string,
  propertyName: string
): boolean {
  // Check for path traversal
  if (filePath.includes("..")) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-002",
      `"${propertyName}" file path must not contain path traversal (..)`,
      DiagnosticSeverity.Error
    );
    return false;
  }

  // Check for absolute paths
  if (filePath.startsWith("/") || filePath.startsWith("\\")) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-002",
      `"${propertyName}" file path must be relative, not absolute`,
      DiagnosticSeverity.Error
    );
    return false;
  }

  // Check for Windows absolute paths (C:\, D:\, etc.)
  if (/^[a-zA-Z]:[\\/]/.test(filePath)) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-002",
      `"${propertyName}" file path must be relative, not an absolute Windows path`,
      DiagnosticSeverity.Error
    );
    return false;
  }

  // Check for UNC paths
  if (filePath.startsWith("//") || filePath.startsWith("\\\\")) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-002",
      `"${propertyName}" file path must not be a UNC path`,
      DiagnosticSeverity.Error
    );
    return false;
  }

  return true;
}

/**
 * Validate file path extension is allowed (for parsed file reference paths)
 */
export function validateFilePathExtension(
  ctx: DiagnosticContext,
  path: jsonc.JSONPath,
  filePath: string,
  propertyName: string,
  allowedExtensions: string[]
): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext || !allowedExtensions.includes(ext)) {
    reportDiagnosticAtPath(
      ctx,
      path,
      "M365-008",
      `"${propertyName}" has invalid file extension. Allowed: ${allowedExtensions.join(", ")}`,
      DiagnosticSeverity.Error
    );
    return false;
  }
  return true;
}
