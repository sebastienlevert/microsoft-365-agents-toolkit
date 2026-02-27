// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { TextDocument } from "./types";
import { Diagnostic, DiagnosticSeverity } from "./types";
import * as jsonc from "jsonc-parser";

// Re-export types
export { Diagnostic, DiagnosticSeverity };

// Document types
export enum DocumentType {
  Unknown = "unknown",
  DeclarativeAgent = "declarative-agent",
  ApiPlugin = "api-plugin",
}

// Validation error with hints
export interface ValidationError {
  code: string;
  path: string;
  message: string;
  severity: "error" | "warning" | "info";
  line: number;
  column: number;
  hint?: string;
  example?: string;
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  documentType: DocumentType;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// Import internal modules
import { parseDocument as internalParse, detectDocumentType } from "./parser";
import { validateDocumentAsync as internalValidateAsync } from "./diagnostics/rule-validator";
import { DECLARATIVE_AGENT_RULES, API_PLUGIN_RULES, ValidationRule } from "./validation-rules";

// Combine all rules
const ALL_RULES: Array<ValidationRule & { applies: "agent" | "plugin" | "both" }> = [
  ...DECLARATIVE_AGENT_RULES.map((r) => ({ ...r, applies: "agent" as const })),
  ...API_PLUGIN_RULES.map((r) => ({ ...r, applies: "plugin" as const })),
];

// Error hints for better AI/human feedback
const ERROR_HINTS: Record<string, { hint: string; example?: string }> = {
  "M365-001": {
    hint: "Add the missing required property",
  },
  "M365-002": {
    hint: "Fix the format to match the expected pattern",
  },
  "M365-003": {
    hint: "Adjust the value to meet the constraint",
  },
  "M365-004": {
    hint: "Fix the schema validation error - check property types and required fields",
  },
  "M365-005": {
    hint: "Consider shortening the text for better display",
  },
  "M365-006": {
    hint: "Remove duplicate values",
  },
  "M365-007": {
    hint: "Ensure the referenced file exists in the appPackage folder",
  },
  "M365-008": {
    hint: "Use an allowed file extension: doc, docx, ppt, pptx, xls, xlsx, txt, pdf",
  },
  "M365-009": {
    hint: "Consider optimizing for better performance",
  },
  "M365-010": {
    hint: 'Replace weak language ("try to", "consider") with direct imperatives ("must", "always")',
  },
  "M365-011": {
    hint: "Replace vague terms with specific numbers, conditions, or criteria",
  },
  "M365-012": {
    hint: 'Add a persona definition (e.g., "You are a...") and ensure instructions match agent complexity',
  },
  "M365-013": {
    hint: "Mention configured capabilities in instructions so the agent knows when to use them",
  },
  "M365-014": {
    hint: "Remove duplicate sentences to reduce noise and improve clarity",
  },
  "M365-015": {
    hint: "Resolve contradictions between conflicting instructions",
  },
  "M365-016": {
    hint: "Ensure persona traits are consistent throughout instructions",
  },
  "M365-017": {
    hint: "Simplify overly complex conditions and decision trees",
  },
  "M365-018": {
    hint: "Address coverage gaps by adding instructions for unhandled scenarios",
  },
  "M365-019": {
    hint: "Add safety guardrails and clarify expected output format",
  },
};

/**
 * Parse JSON content and detect document type
 */
export function parseJson(content: string): {
  documentType: DocumentType;
  parsed: unknown;
  parseErrors: jsonc.ParseError[];
} {
  const errors: jsonc.ParseError[] = [];
  const parsed = jsonc.parse(content, errors, {
    allowTrailingComma: true,
    allowEmptyContent: true,
  });

  // Detect document type from $schema
  const docType = detectDocumentType(parsed);
  let documentType = DocumentType.Unknown;
  if (docType === "declarative-agent") {
    documentType = DocumentType.DeclarativeAgent;
  } else if (docType === "api-plugin") {
    documentType = DocumentType.ApiPlugin;
  }

  return { documentType, parsed, parseErrors: errors };
}

/**
 * Validate JSON content for Microsoft 365 Copilot
 *
 * @param content - JSON string or object to validate
 * @param options - Validation options
 * @returns Validation result with errors and warnings
 */
export async function validate(
  content: string | Record<string, unknown>,
  options: {
    filename?: string;
    skipFileChecks?: boolean;
  } = {}
): Promise<ValidationResult> {
  // Convert to string if needed
  const jsonString = typeof content === "string" ? content : JSON.stringify(content, null, 2);

  // Create a text document for internal APIs
  // Use proper file URI format - on Unix absolute paths start with /, so file:// + path works
  const uri = options.filename
    ? options.filename.startsWith("/")
      ? `file://${options.filename}`
      : `file:///${options.filename}`
    : "file:///document.json";
  const doc = TextDocument.create(uri, "json", 1, jsonString);

  // Parse the document
  const parseResult = internalParse(doc);

  // Map internal document type
  const docType = detectDocumentType(parseResult.content);
  let documentType = DocumentType.Unknown;
  if (docType === "declarative-agent") {
    documentType = DocumentType.DeclarativeAgent;
  } else if (docType === "api-plugin") {
    documentType = DocumentType.ApiPlugin;
  }

  // Skip validation for unknown document types
  if (documentType === DocumentType.Unknown) {
    return {
      valid: true,
      documentType,
      errors: [],
      warnings: [
        {
          code: "M365-000",
          path: "$",
          message:
            "Document does not have a recognized $schema. Add $schema property to enable validation.",
          severity: "info",
          line: 1,
          column: 1,
          hint: 'Add "$schema": "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.6/schema.json" for declarative agents',
        },
      ],
    };
  }

  // Run all validation (schema + rules) via Rego WASM
  const allDiagnostics = await internalValidateAsync(
    doc,
    parseResult.root,
    parseResult.content,
    parseResult.errors
  );

  return formatDiagnosticsResult(allDiagnostics, documentType);
}

/**
 * Convert diagnostics to ValidationResult format
 */
function formatDiagnosticsResult(
  allDiagnostics: Diagnostic[],
  documentType: DocumentType
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  for (const diag of allDiagnostics) {
    const code = String(diag.code || "M365-000");
    const hintInfo = ERROR_HINTS[code] || {};

    const validationError: ValidationError = {
      code,
      path: formatPath(diag),
      message: diag.message,
      severity:
        diag.severity === DiagnosticSeverity.Error
          ? "error"
          : diag.severity === DiagnosticSeverity.Warning
          ? "warning"
          : "info",
      line: diag.range.start.line + 1, // 1-indexed for humans
      column: diag.range.start.character + 1,
      hint: hintInfo.hint,
      example: hintInfo.example,
    };

    if (diag.severity === DiagnosticSeverity.Error) {
      errors.push(validationError);
    } else {
      warnings.push(validationError);
    }
  }

  return {
    valid: errors.length === 0,
    documentType,
    errors,
    warnings,
  };
}

/**
 * Format diagnostic path from diagnostic data
 */
function formatPath(diag: Diagnostic): string {
  const data = diag.data as { path?: string } | undefined;
  if (data?.path) {
    return `$.${data.path}`.replace(/\.\./g, ".").replace(/\.$/, "");
  }
  return "$";
}

/**
 * Get validation rules as structured data
 */
export function getValidationRules(): {
  declarativeAgent: { schema: string; version: string; rules: ValidationRule[] };
  apiPlugin: { schema: string; version: string; rules: ValidationRule[] };
} {
  return {
    declarativeAgent: {
      schema:
        "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.6/schema.json",
      version: "v1.6",
      rules: DECLARATIVE_AGENT_RULES,
    },
    apiPlugin: {
      schema: "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.3/schema.json",
      version: "v2.3",
      rules: API_PLUGIN_RULES,
    },
  };
}

/**
 * Get example templates for agents and plugins
 */
export function getExamples(): {
  minimalAgent: Record<string, unknown>;
  fullAgent: Record<string, unknown>;
  minimalPlugin: Record<string, unknown>;
  fullPlugin: Record<string, unknown>;
} {
  return {
    minimalAgent: {
      $schema:
        "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.6/schema.json",
      version: "v1.6",
      name: "My Agent",
      description: "A helpful agent that assists with...",
    },
    fullAgent: {
      $schema:
        "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.6/schema.json",
      version: "v1.6",
      name: "My Agent",
      description: "A helpful agent that assists with common tasks.",
      instructions:
        "You are a helpful assistant. Help users with their questions. Be concise and accurate.",
      conversation_starters: [
        { title: "Get Started", text: "How can I help you today?" },
        { title: "Learn More", text: "What can you do?" },
      ],
      capabilities: [{ name: "WebSearch" }],
    },
    minimalPlugin: {
      $schema: "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.3/schema.json",
      schema_version: "v2.3",
      namespace: "MyPlugin",
      name_for_human: "My Plugin",
      description_for_model: "A plugin that helps with common tasks.",
      description_for_human: "Helps with common tasks",
      functions: [{ name: "myFunction", description: "Does something useful" }],
      runtimes: [
        {
          type: "OpenApi",
          auth: { type: "None" },
          spec: { url: "https://api.example.com/openapi.json" },
        },
      ],
    },
    fullPlugin: {
      $schema: "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.3/schema.json",
      schema_version: "v2.3",
      namespace: "MyPlugin",
      name_for_human: "My Plugin",
      description_for_model:
        "A comprehensive plugin that provides various operations for managing data.",
      description_for_human: "Manage your data with ease",
      logo_url: "https://example.com/logo.png",
      contact_email: "support@example.com",
      legal_info_url: "https://example.com/legal",
      privacy_policy_url: "https://example.com/privacy",
      functions: [
        { name: "listItems", description: "List all items" },
        { name: "getItem", description: "Get a specific item by ID" },
        { name: "createItem", description: "Create a new item" },
        { name: "updateItem", description: "Update an existing item" },
        { name: "deleteItem", description: "Delete an item" },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: { type: "OAuthPluginVault", reference_id: "{OAUTH_REF}" },
          spec: { url: "https://api.example.com/openapi.json" },
        },
      ],
    },
  };
}

/**
 * Get specific fix suggestions for validation errors
 */
export async function suggestFixes(content: string | Record<string, unknown>): Promise<{
  valid: boolean;
  documentType: DocumentType;
  fixes: Array<{
    error: ValidationError;
    fix: string;
    suggestedValue?: unknown;
  }>;
  warnings: ValidationError[];
}> {
  const result = await validate(content);

  const fixes = result.errors.map((error: ValidationError) => {
    let fix = error.hint || "Review the error and fix manually";
    let suggestedValue: unknown = undefined;

    // Generate specific fixes based on error patterns
    if (error.code === "M365-003") {
      if (error.path.includes("name") && error.message.includes("empty")) {
        suggestedValue = "My Agent";
        fix = "Add a descriptive name (1-100 characters)";
      } else if (error.path.includes("description") && error.message.includes("empty")) {
        suggestedValue = "A helpful agent that assists with...";
        fix = "Add a description (1-1000 characters)";
      } else if (error.path.includes("instructions") && error.message.includes("empty")) {
        suggestedValue = "You are a helpful assistant. Answer questions accurately.";
        fix = "Add instructions (1-8000 characters)";
      } else if (error.message.includes("conversation_starters") && error.message.includes("12")) {
        fix = "Remove conversation starters to have at most 12";
      } else if (error.message.includes("sites") && error.message.includes("4")) {
        fix = "Remove sites to have at most 4";
      } else if (error.message.includes("group_mailboxes") && error.message.includes("25")) {
        fix = "Remove mailboxes to have at most 25";
      }
    } else if (error.code === "M365-002") {
      if (error.message.includes("URL")) {
        fix = "Ensure URL starts with https:// and has no query parameters or fragments";
      } else if (error.message.includes("email")) {
        fix = "Use a valid email format: user@domain.com";
      } else if (error.message.includes("GUID")) {
        fix = "Use a valid GUID format: {xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}";
      }
    } else if (error.code === "M365-006") {
      fix = "Remove the duplicate entry";
    } else if (error.code === "M365-008") {
      fix = "Change to an allowed extension: doc, docx, ppt, pptx, xls, xlsx, txt, pdf";
    }

    return { error, fix, suggestedValue };
  });

  return {
    valid: result.valid,
    documentType: result.documentType,
    fixes,
    warnings: result.warnings,
  };
}

// Export the validation rules type
export type { ValidationRule };

// Re-export modules needed by LSP and other consumers
export { DocumentManager, ManagedDocument } from "./document-manager";
export { parseDocument, detectDocumentType, getLocationAtPosition } from "./parser";
export { validateDocumentAsync } from "./diagnostics/rule-validator";
export { provideHover } from "./providers/hover";
export { provideCompletions, getSnippetCompletions } from "./providers/completion";
export {
  InstructionsLLMAnalyzer,
  buildInstructionsAnalysisPrompt,
} from "./validators/instructions-llm-analyzer";
export type {
  LLMProxyFn,
  LLMProxyRequest,
  LLMProxyResponse,
} from "./validators/instructions-llm-analyzer";
export {
  resolveInstructionsText,
  analyzeInstructionsText,
} from "./validators/instructions-analyzer";
