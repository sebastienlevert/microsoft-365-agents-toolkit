// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DiagnosticContext } from "./diagnostic-reporter";
import { DiagnosticSeverity } from "../types";
import { findNodeByPath, nodeToRange } from "../parser";
import { Position } from "../types";
import * as jsonc from "jsonc-parser";
import {
  evaluateDeclarativeAgent,
  evaluateApiPlugin,
  RegoResult,
  isRegoAvailable,
} from "../rego-evaluator";

/**
 * Convert a Rego path string to a JSON path array
 * Handles both numeric indices and capability name lookups
 * e.g., "capabilities[WebSearch].sites[0].url" -> ["capabilities", <index>, "sites", 0, "url"]
 * e.g., "conversation_starters[0].text" -> ["conversation_starters", 0, "text"]
 */
function parseRegoPath(pathStr: string, content?: unknown): jsonc.JSONPath {
  if (!pathStr || pathStr === "$") {
    return [];
  }

  const path: jsonc.JSONPath = [];

  // Handle paths like "conversation_starters[0].text" or "capabilities[WebSearch].sites"
  const parts = pathStr.split(/\.|\[|\]/).filter((p) => p !== "");

  let currentObj: unknown = content;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Check if it's a number (array index)
    const num = parseInt(part, 10);
    if (!isNaN(num)) {
      path.push(num);
      // Navigate into the array
      if (Array.isArray(currentObj) && currentObj[num] !== undefined) {
        currentObj = currentObj[num];
      } else {
        currentObj = undefined;
      }
    } else {
      // Check if this is a capability name lookup (e.g., "WebSearch" after "capabilities")
      const prevPart = path.length > 0 ? path[path.length - 1] : null;
      if (prevPart === "capabilities" && Array.isArray(currentObj)) {
        // Find the index of the capability with this name
        const capIndex = (currentObj as Array<{ name?: string }>).findIndex((c) => c.name === part);
        if (capIndex >= 0) {
          path.push(capIndex);
          currentObj = currentObj[capIndex];
          continue;
        }
      }

      // Regular property name
      path.push(part);
      if (currentObj && typeof currentObj === "object" && !Array.isArray(currentObj)) {
        currentObj = (currentObj as Record<string, unknown>)[part];
      } else {
        currentObj = undefined;
      }
    }
  }

  return path;
}

/**
 * Convert Rego results to LSP diagnostics
 */
function regoResultsToDiagnostics(
  ctx: DiagnosticContext,
  results: RegoResult[],
  content: unknown
): void {
  for (const result of results) {
    const path = parseRegoPath(result.path, content);
    let range;

    if (ctx.root) {
      const node = findNodeByPath(ctx.root, path);
      if (node) {
        range = nodeToRange(ctx.document, node);
      } else {
        range = { start: Position.create(0, 0), end: Position.create(0, 1) };
      }
    } else {
      range = { start: Position.create(0, 0), end: Position.create(0, 1) };
    }

    const severity =
      result.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;

    ctx.diagnostics.push({
      range,
      severity,
      code: result.code,
      source: "m365-copilot",
      message: result.message,
      data: { path: result.path },
    });
  }
}

/**
 * Validate declarative agent using Rego policies (async)
 */
export async function validateDeclarativeAgentRego(
  ctx: DiagnosticContext,
  content: unknown
): Promise<void> {
  if (!isRegoAvailable()) {
    return;
  }

  try {
    const results = await evaluateDeclarativeAgent(content);
    regoResultsToDiagnostics(ctx, results, content);
  } catch (error) {
    console.error("Rego evaluation error:", error);
  }
}

/**
 * Validate API plugin using Rego policies (async)
 */
export async function validateApiPluginRego(
  ctx: DiagnosticContext,
  content: unknown
): Promise<void> {
  if (!isRegoAvailable()) {
    return;
  }

  try {
    const results = await evaluateApiPlugin(content);
    regoResultsToDiagnostics(ctx, results, content);
  } catch (error) {
    console.error("Rego evaluation error:", error);
  }
}

// Re-export for convenience
export { isRegoAvailable };
