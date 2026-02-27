// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DiagnosticSeverity } from "../types";
import { DiagnosticContext, reportDiagnosticAtPath } from "../diagnostics/diagnostic-reporter";
import {
  validateNotEmpty,
  validateMaxLength,
  validateArrayMaxLength,
  validateRequired,
  validateGuid,
  validatePrefixedGuid,
  getValueAtPath,
  forEachArrayItem,
  isFileReference,
  parseFileReference,
  validateFileReferencePath,
  validateFilePathExtension,
} from "./utils";
import * as fs from "fs";
import * as path from "path";
import { URI } from "vscode-uri";

interface ConversationStarter {
  title?: string;
  text: string;
}

interface ConnectedAgent {
  id: string;
}

/**
 * Validate declarative agent properties
 */
export function validateAgent(
  ctx: DiagnosticContext,
  content: unknown,
  documentUri?: string
): void {
  if (!content || typeof content !== "object") {
    return;
  }

  // Validate name (required, 1-100 chars)
  validateRequired(ctx, content, ["name"], "name");
  validateNotEmpty(ctx, content, ["name"], "name");
  validateMaxLength(ctx, content, ["name"], "name", 100);

  // Validate description (required, 1-1000 chars)
  validateRequired(ctx, content, ["description"], "description");
  validateNotEmpty(ctx, content, ["description"], "description");
  validateMaxLength(ctx, content, ["description"], "description", 1000);

  // Validate instructions (1-8000 chars, supports file references)
  validateInstructions(ctx, content, documentUri);

  // Validate conversation starters (max 12)
  validateConversationStarters(ctx, content);

  // Validate disclaimer
  validateDisclaimer(ctx, content);

  // Validate behavior overrides
  validateBehaviorOverrides(ctx, content);

  // Validate connected agents (max 10)
  validateConnectedAgents(ctx, content);

  // Validate worker agents (max 10)
  validateWorkerAgents(ctx, content);

  // Validate capabilities
  validateCapabilitiesArray(ctx, content);
}

// Allowed extensions for instruction files
const INSTRUCTION_FILE_EXTENSIONS = ["md", "txt"];

/**
 * Validate instructions - supports both inline text and file references
 */
function validateInstructions(
  ctx: DiagnosticContext,
  content: unknown,
  documentUri?: string
): void {
  const instructions = getValueAtPath(content, ["instructions"]);

  if (instructions === undefined) {
    return; // Instructions are optional
  }

  if (typeof instructions !== "string") {
    return; // Schema validation will catch this
  }

  // Check if it's a file reference
  if (isFileReference(instructions)) {
    const filePath = parseFileReference(instructions);

    if (!filePath) {
      reportDiagnosticAtPath(
        ctx,
        ["instructions"],
        "M365-002",
        "Invalid file reference syntax. Use $[file('path/to/file.md')]",
        DiagnosticSeverity.Error
      );
      return;
    }

    // Validate path security
    if (!validateFileReferencePath(ctx, ["instructions"], filePath, "instructions")) {
      return;
    }

    // Validate file extension
    if (
      !validateFilePathExtension(
        ctx,
        ["instructions"],
        filePath,
        "instructions",
        INSTRUCTION_FILE_EXTENSIONS
      )
    ) {
      return;
    }

    // Try to read and validate the file content
    if (documentUri) {
      validateInstructionFile(ctx, filePath, documentUri);
    }
  } else {
    // Inline text - validate directly
    validateNotEmpty(ctx, content, ["instructions"], "instructions");
    validateMaxLength(ctx, content, ["instructions"], "instructions", 8000);
  }
}

/**
 * Validate instruction file exists and content is valid
 */
function validateInstructionFile(
  ctx: DiagnosticContext,
  filePath: string,
  documentUri: string
): void {
  try {
    // Resolve the file path relative to the document
    const docPath = URI.parse(documentUri).fsPath;
    const docDir = path.dirname(docPath);
    const absolutePath = path.resolve(docDir, filePath);

    // Check file exists
    if (!fs.existsSync(absolutePath)) {
      reportDiagnosticAtPath(
        ctx,
        ["instructions"],
        "M365-007",
        `Instruction file not found: "${filePath}"`,
        DiagnosticSeverity.Error
      );
      return;
    }

    // Read file content
    const content = fs.readFileSync(absolutePath, "utf-8");

    // Check content is not empty
    if (content.trim().length === 0) {
      reportDiagnosticAtPath(
        ctx,
        ["instructions"],
        "M365-003",
        `Instruction file "${filePath}" is empty`,
        DiagnosticSeverity.Error
      );
      return;
    }

    // Check content length (8000 char limit)
    if (content.length > 8000) {
      reportDiagnosticAtPath(
        ctx,
        ["instructions"],
        "M365-003",
        `Instruction file "${filePath}" exceeds maximum length of 8000 characters (current: ${content.length})`,
        DiagnosticSeverity.Error
      );
      return;
    }
  } catch (error) {
    // File read error
    reportDiagnosticAtPath(
      ctx,
      ["instructions"],
      "M365-007",
      `Cannot read instruction file: "${filePath}"`,
      DiagnosticSeverity.Error
    );
  }
}

/**
 * Validate conversation starters
 */
function validateConversationStarters(ctx: DiagnosticContext, content: unknown): void {
  const starters = getValueAtPath(content, ["conversation_starters"]);
  if (!Array.isArray(starters)) {
    return;
  }

  // Max 12 conversation starters
  validateArrayMaxLength(ctx, content, ["conversation_starters"], "conversation_starters", 12);

  forEachArrayItem<ConversationStarter>(
    content,
    ["conversation_starters"],
    (starter, index, path) => {
      // Title is optional but must be non-empty if present
      if (starter.title !== undefined) {
        validateNotEmpty(ctx, content, [...path, "title"], "title");
      }

      // Text is required and must be non-empty
      validateRequired(ctx, content, [...path, "text"], "text");
      validateNotEmpty(ctx, content, [...path, "text"], "text");
    }
  );
}

/**
 * Validate disclaimer
 */
function validateDisclaimer(ctx: DiagnosticContext, content: unknown): void {
  const disclaimer = getValueAtPath(content, ["disclaimer"]);
  if (!disclaimer || typeof disclaimer !== "object") {
    return;
  }

  // Text is required (1-500 chars)
  validateRequired(ctx, content, ["disclaimer", "text"], "text");
  validateNotEmpty(ctx, content, ["disclaimer", "text"], "text");
  validateMaxLength(ctx, content, ["disclaimer", "text"], "text", 500);
}

/**
 * Validate behavior overrides
 */
function validateBehaviorOverrides(ctx: DiagnosticContext, content: unknown): void {
  const overrides = getValueAtPath(content, ["behavior_overrides"]);
  if (!overrides || typeof overrides !== "object") {
    return;
  }

  // Boolean properties are validated by schema
}

/**
 * Validate connected agents
 */
function validateConnectedAgents(ctx: DiagnosticContext, content: unknown): void {
  const agents = getValueAtPath(content, ["connected_agents"]);
  if (!Array.isArray(agents)) {
    return;
  }

  // Max 10 connected agents
  validateArrayMaxLength(ctx, content, ["connected_agents"], "connected_agents", 10);

  forEachArrayItem<ConnectedAgent>(content, ["connected_agents"], (agent, index, path) => {
    // Validate agent ID is valid GUID
    validateRequired(ctx, content, [...path, "id"], "id");
    validateGuid(ctx, content, [...path, "id"], "id");
  });
}

/**
 * Validate worker agents
 */
function validateWorkerAgents(ctx: DiagnosticContext, content: unknown): void {
  const agents = getValueAtPath(content, ["worker_agents"]);
  if (!Array.isArray(agents)) {
    return;
  }

  // Max 10 worker agents
  validateArrayMaxLength(ctx, content, ["worker_agents"], "worker_agents", 10);

  forEachArrayItem<ConnectedAgent>(content, ["worker_agents"], (agent, index, path) => {
    // Validate agent ID is valid GUID (with optional T_, U_, or P_ prefix)
    validateRequired(ctx, content, [...path, "id"], "id");
    validatePrefixedGuid(ctx, content, [...path, "id"], "id");
  });
}

/**
 * Validate capabilities array - check for duplicates
 */
function validateCapabilitiesArray(ctx: DiagnosticContext, content: unknown): void {
  const capabilities = getValueAtPath(content, ["capabilities"]);
  if (!Array.isArray(capabilities)) {
    return;
  }

  // Check for duplicate capability types
  const seenTypes = new Map<string, number>();

  for (let i = 0; i < capabilities.length; i++) {
    const cap = capabilities[i] as Record<string, unknown>;
    const capName = cap.name as string;

    if (capName && seenTypes.has(capName)) {
      reportDiagnosticAtPath(
        ctx,
        ["capabilities", i],
        "M365-006",
        `Duplicate capability type: "${capName}". Consider combining into a single capability.`,
        DiagnosticSeverity.Warning
      );
    } else if (capName) {
      seenTypes.set(capName, i);
    }
  }
}
