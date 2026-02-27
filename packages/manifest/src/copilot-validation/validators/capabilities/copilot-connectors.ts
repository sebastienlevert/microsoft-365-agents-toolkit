// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DiagnosticContext, reportDiagnosticAtPath } from "../../diagnostics/diagnostic-reporter";
import { validateAbsoluteUrl, validateNotEmpty, getValueAtPath, forEachArrayItem } from "../utils";
import { DiagnosticSeverity } from "../../types";

interface Connection {
  connection_id: string;
  additional_search_terms?: string;
  items_by_external_id?: Array<{ item_id: string }>;
  items_by_path?: Array<{ path: string }>;
  items_by_container_name?: Array<{ container_name: string }>;
  items_by_container_url?: Array<{ container_url: string }>;
}

interface CopilotConnectorsCapability {
  name: "GraphConnectors";
  connections?: Connection[];
}

// Basic KQL validation - checks for common syntax issues
const KQL_INVALID_PATTERNS = [
  /^\s*$/, // Empty
  /[^\x20-\x7E]/, // Non-ASCII characters that are suspicious
];

const KQL_VALID_OPERATORS = ["AND", "OR", "NOT", "NEAR", "ONEAR", "WORDS", "XRANK"];

/**
 * Validate KQL query syntax (basic validation)
 */
function isValidKqlQuery(query: string): { valid: boolean; error?: string } {
  if (!query || query.trim().length === 0) {
    return { valid: false, error: "KQL query cannot be empty" };
  }

  // Check for unbalanced parentheses
  let parenCount = 0;
  for (const char of query) {
    if (char === "(") parenCount++;
    if (char === ")") parenCount--;
    if (parenCount < 0) {
      return { valid: false, error: "Unbalanced parentheses in KQL query" };
    }
  }
  if (parenCount !== 0) {
    return { valid: false, error: "Unbalanced parentheses in KQL query" };
  }

  // Check for unbalanced quotes
  const doubleQuotes = (query.match(/"/g) || []).length;
  if (doubleQuotes % 2 !== 0) {
    return { valid: false, error: "Unbalanced quotes in KQL query" };
  }

  return { valid: true };
}

/**
 * Validate CopilotConnectors capability
 */
export function validateCopilotConnectors(
  ctx: DiagnosticContext,
  content: unknown,
  capabilityPath: (string | number)[]
): void {
  const capability = getValueAtPath(content, capabilityPath) as CopilotConnectorsCapability;
  if (!capability || capability.name !== "GraphConnectors") {
    return;
  }

  const connectionsPath = [...capabilityPath, "connections"];
  const connections = getValueAtPath(content, connectionsPath);

  if (!Array.isArray(connections)) {
    return;
  }

  // Validate each connection
  forEachArrayItem<Connection>(content, connectionsPath, (connection, index, itemPath) => {
    // connection_id is required
    validateNotEmpty(ctx, content, [...itemPath, "connection_id"], "connection_id");

    // Validate KQL in additional_search_terms
    if (connection.additional_search_terms !== undefined) {
      const kqlPath = [...itemPath, "additional_search_terms"];
      const kqlResult = isValidKqlQuery(connection.additional_search_terms);

      if (!kqlResult.valid) {
        reportDiagnosticAtPath(
          ctx,
          kqlPath,
          "M365-002",
          `Invalid KQL query: ${kqlResult.error ?? "unknown error"}`,
          DiagnosticSeverity.Error
        );
      }
    }

    // Validate container URLs
    if (connection.items_by_container_url) {
      forEachArrayItem<{ container_url: string }>(
        content,
        [...itemPath, "items_by_container_url"],
        (item, urlIndex, urlPath) => {
          validateAbsoluteUrl(ctx, content, [...urlPath, "container_url"], "container_url");
        }
      );
    }
  });
}
