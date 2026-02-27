// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as jsonc from "jsonc-parser";
import { Range, Position } from "./types";
import { TextDocument } from "./types";

export interface ParsedDocument {
  root: jsonc.Node | undefined;
  errors: jsonc.ParseError[];
  content: unknown;
}

export interface JsonLocation {
  path: jsonc.JSONPath;
  node: jsonc.Node | undefined;
}

/**
 * Parse a JSON document with error recovery
 */
export function parseDocument(document: TextDocument): ParsedDocument {
  const text = document.getText();
  const errors: jsonc.ParseError[] = [];

  const root = jsonc.parseTree(text, errors, {
    disallowComments: false,
    allowTrailingComma: true,
    allowEmptyContent: true,
  });

  let content: unknown = undefined;
  try {
    content = jsonc.parse(text, errors, {
      disallowComments: false,
      allowTrailingComma: true,
      allowEmptyContent: true,
    });
  } catch {
    // Content parsing failed, root tree may still be available
  }

  return { root, errors, content };
}

/**
 * Get the JSON path at a given position in the document
 */
export function getLocationAtPosition(document: TextDocument, position: Position): JsonLocation {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const path = jsonc.getLocation(text, offset).path;
  const root = jsonc.parseTree(text);
  const node = root ? jsonc.findNodeAtOffset(root, offset) : undefined;

  return { path, node };
}

/**
 * Find a node by JSON path
 */
export function findNodeByPath(root: jsonc.Node, path: jsonc.JSONPath): jsonc.Node | undefined {
  return jsonc.findNodeAtLocation(root, path);
}

/**
 * Convert a jsonc.Node offset/length to an LSP Range
 */
export function nodeToRange(document: TextDocument, node: jsonc.Node): Range {
  const start = document.positionAt(node.offset);
  const end = document.positionAt(node.offset + node.length);
  return { start, end };
}

/**
 * Convert a parse error to an LSP Range
 */
export function parseErrorToRange(document: TextDocument, error: jsonc.ParseError): Range {
  const start = document.positionAt(error.offset);
  const end = document.positionAt(error.offset + error.length);
  return { start, end };
}

/**
 * Get the value of a property from a parsed JSON object
 */
export function getPropertyValue<T>(obj: unknown, ...path: string[]): T | undefined {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current as T;
}

/**
 * Known Microsoft 365 Copilot schema URLs
 */
const DECLARATIVE_AGENT_SCHEMAS = [
  "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/",
  "https://aka.ms/json-schemas/copilot/declarative-agent/",
];

const API_PLUGIN_SCHEMAS = [
  "https://developer.microsoft.com/json-schemas/copilot/plugin/",
  "https://aka.ms/json-schemas/copilot/plugin/",
];

/**
 * Check if a document is a declarative agent JSON file based on $schema
 */
export function isDeclarativeAgentDocument(content: unknown): boolean {
  const schema = getPropertyValue<string>(content, "$schema");
  if (schema) {
    return DECLARATIVE_AGENT_SCHEMAS.some((prefix) => schema.startsWith(prefix));
  }
  return false;
}

/**
 * Check if a document is an API plugin JSON file based on $schema
 */
export function isApiPluginDocument(content: unknown): boolean {
  const schema = getPropertyValue<string>(content, "$schema");
  if (schema) {
    return API_PLUGIN_SCHEMAS.some((prefix) => schema.startsWith(prefix));
  }
  return false;
}

/**
 * Detect the document type from content
 */
export type DocumentType = "declarative-agent" | "api-plugin" | "unknown";

export function detectDocumentType(content: unknown): DocumentType {
  if (isDeclarativeAgentDocument(content)) {
    return "declarative-agent";
  }
  if (isApiPluginDocument(content)) {
    return "api-plugin";
  }
  return "unknown";
}
