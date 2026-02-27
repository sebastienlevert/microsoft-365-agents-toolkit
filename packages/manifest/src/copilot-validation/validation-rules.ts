// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export interface ValidationRule {
  id: string;
  code: string;
  severity: "error" | "warning";
  property: string;
  description: string;
  constraint: string;
}

export interface DiagnosticCodeInfo {
  name: string;
  severity: "error" | "warning";
  description: string;
}

/**
 * Validation rules for declarative agents (metadata for documentation)
 * Actual validation is performed by Rego policies
 */
export const DECLARATIVE_AGENT_RULES: ValidationRule[] = [
  // Root properties
  {
    id: "name-required",
    code: "M365-001",
    severity: "error",
    property: "name",
    description: "Name is required",
    constraint: "1-100 characters",
  },
  {
    id: "name-length",
    code: "M365-003",
    severity: "error",
    property: "name",
    description: "Name exceeds maximum length",
    constraint: "Maximum 100 characters",
  },
  {
    id: "description-required",
    code: "M365-001",
    severity: "error",
    property: "description",
    description: "Description is required",
    constraint: "1-1000 characters",
  },
  {
    id: "description-length",
    code: "M365-003",
    severity: "error",
    property: "description",
    description: "Description exceeds maximum length",
    constraint: "Maximum 1000 characters",
  },
  {
    id: "instructions-length",
    code: "M365-003",
    severity: "error",
    property: "instructions",
    description: "Instructions exceed maximum length",
    constraint: "Maximum 8000 characters",
  },
  // Instructions quality
  {
    id: "instructions-weak-language",
    code: "M365-010",
    severity: "warning",
    property: "instructions",
    description: "Weak/hedging language in instructions",
    constraint: "Use direct, imperative language",
  },
  {
    id: "instructions-ambiguity",
    code: "M365-011",
    severity: "warning",
    property: "instructions",
    description: "Ambiguous or vague terms in instructions",
    constraint: "Use specific quantities and criteria",
  },
  {
    id: "instructions-missing-persona",
    code: "M365-012",
    severity: "warning",
    property: "instructions",
    description: "Missing persona definition or insufficient detail",
    constraint: 'Include "You are..." role definition',
  },
  {
    id: "instructions-missing-capability",
    code: "M365-013",
    severity: "warning",
    property: "instructions",
    description: "Configured capabilities not mentioned in instructions",
    constraint: "Reference capabilities so agent knows when to use them",
  },
  {
    id: "instructions-redundancy",
    code: "M365-014",
    severity: "warning",
    property: "instructions",
    description: "Duplicate sentences in instructions",
    constraint: "Remove redundant instructions",
  },
  // LLM-powered instruction quality (opt-in)
  {
    id: "instructions-contradiction",
    code: "M365-015",
    severity: "warning",
    property: "instructions",
    description: "Contradictory instructions detected by LLM",
    constraint: "Resolve conflicting directives",
  },
  {
    id: "instructions-persona-inconsistency",
    code: "M365-016",
    severity: "warning",
    property: "instructions",
    description: "Persona traits conflict detected by LLM",
    constraint: "Ensure consistent personality",
  },
  {
    id: "instructions-cognitive-load",
    code: "M365-017",
    severity: "warning",
    property: "instructions",
    description: "Overly complex instructions detected by LLM",
    constraint: "Simplify nested conditions",
  },
  {
    id: "instructions-coverage-gap",
    code: "M365-018",
    severity: "warning",
    property: "instructions",
    description: "Coverage gap detected by LLM",
    constraint: "Address unhandled scenarios",
  },
  {
    id: "instructions-safety",
    code: "M365-019",
    severity: "warning",
    property: "instructions",
    description: "Safety or output format concern detected by LLM",
    constraint: "Add guardrails and format guidance",
  },
  // Conversation starters
  {
    id: "conversation-starters-max",
    code: "M365-003",
    severity: "error",
    property: "conversation_starters",
    description: "Too many conversation starters",
    constraint: "Maximum 12 items (v1.6)",
  },
  // Actions
  {
    id: "actions-max",
    code: "M365-003",
    severity: "error",
    property: "actions",
    description: "Too many actions",
    constraint: "Maximum 10 items",
  },
  // Worker agents
  {
    id: "worker-agents-max",
    code: "M365-003",
    severity: "error",
    property: "worker_agents",
    description: "Too many worker agents",
    constraint: "Maximum 10 items",
  },
  {
    id: "worker-agent-id-guid",
    code: "M365-002",
    severity: "error",
    property: "worker_agents[].id",
    description: "Worker agent ID must be valid GUID",
    constraint: "GUID format",
  },
  // Capabilities
  {
    id: "capability-duplicate",
    code: "M365-006",
    severity: "warning",
    property: "capabilities",
    description: "Duplicate capability type",
    constraint: "Each type once",
  },
  {
    id: "websearch-sites-max",
    code: "M365-003",
    severity: "error",
    property: "capabilities[WebSearch].sites",
    description: "Too many sites",
    constraint: "Maximum 4 sites",
  },
  {
    id: "websearch-url-path-segments",
    code: "M365-002",
    severity: "error",
    property: "capabilities[WebSearch].sites[].url",
    description: "URL has too many path segments",
    constraint: "Maximum 2 path segments",
  },
  {
    id: "email-group-mailboxes-max",
    code: "M365-003",
    severity: "error",
    property: "capabilities[Email].group_mailboxes",
    description: "Too many group mailboxes",
    constraint: "Maximum 25 items",
  },
  {
    id: "embedded-knowledge-files-max",
    code: "M365-003",
    severity: "error",
    property: "capabilities[EmbeddedKnowledge].files",
    description: "Too many files",
    constraint: "Maximum 10 files",
  },
  {
    id: "embedded-knowledge-extension",
    code: "M365-008",
    severity: "error",
    property: "capabilities[EmbeddedKnowledge].files[].file",
    description: "Invalid file extension",
    constraint: "doc, docx, ppt, pptx, xls, xlsx, txt, pdf",
  },
];

/**
 * Validation rules for API plugins (metadata for documentation)
 */
export const API_PLUGIN_RULES: ValidationRule[] = [
  {
    id: "namespace-required",
    code: "M365-001",
    severity: "error",
    property: "namespace",
    description: "Namespace is required",
    constraint: "Pattern: ^[A-Za-z0-9_]+$",
  },
  {
    id: "name-for-human-length",
    code: "M365-005",
    severity: "warning",
    property: "name_for_human",
    description: "Name may be truncated",
    constraint: "Max 20 characters recommended",
  },
  {
    id: "description-for-model-length",
    code: "M365-005",
    severity: "warning",
    property: "description_for_model",
    description: "Description may be truncated",
    constraint: "Max 2048 characters recommended",
  },
  {
    id: "function-name-required",
    code: "M365-001",
    severity: "error",
    property: "functions[].name",
    description: "Function name is required",
    constraint: "Required property",
  },
  {
    id: "function-description-required",
    code: "M365-001",
    severity: "error",
    property: "functions[].description",
    description: "Function description is required",
    constraint: "Required property",
  },
  {
    id: "runtime-auth-required",
    code: "M365-001",
    severity: "error",
    property: "runtimes[].auth",
    description: "Runtime auth configuration is required",
    constraint: "Required property",
  },
];

/**
 * Diagnostic codes used by the validator
 */
export const DIAGNOSTIC_CODES: Record<string, DiagnosticCodeInfo> = {
  "M365-001": {
    name: "Missing required property",
    severity: "error",
    description: "A required property is missing",
  },
  "M365-002": {
    name: "Invalid format",
    severity: "error",
    description: "Invalid format (URL, email, GUID, etc.)",
  },
  "M365-003": {
    name: "Constraint violation",
    severity: "error",
    description: "Violates a constraint (length, count)",
  },
  "M365-004": {
    name: "Schema validation failure",
    severity: "error",
    description: "Fails JSON schema validation",
  },
  "M365-005": {
    name: "Length warning",
    severity: "warning",
    description: "Exceeds recommended length",
  },
  "M365-006": {
    name: "Duplicate values",
    severity: "warning",
    description: "Array contains duplicates",
  },
  "M365-007": {
    name: "File not found",
    severity: "error",
    description: "Referenced file does not exist",
  },
  "M365-008": {
    name: "Invalid file extension",
    severity: "error",
    description: "Unsupported extension",
  },
  "M365-009": {
    name: "Performance concern",
    severity: "warning",
    description: "May cause performance issues",
  },
  "M365-010": {
    name: "Weak language",
    severity: "warning",
    description: "Instructions use hedging/weak language",
  },
  "M365-011": {
    name: "Ambiguity",
    severity: "warning",
    description: "Instructions contain ambiguous terms",
  },
  "M365-012": {
    name: "Missing persona",
    severity: "warning",
    description: "Missing persona definition or insufficient detail",
  },
  "M365-013": {
    name: "Missing capability mention",
    severity: "warning",
    description: "Capabilities not referenced in instructions",
  },
  "M365-014": {
    name: "Redundancy",
    severity: "warning",
    description: "Duplicate sentences in instructions",
  },
  "M365-015": {
    name: "Contradiction",
    severity: "warning",
    description: "Contradictory instructions detected (LLM)",
  },
  "M365-016": {
    name: "Persona inconsistency",
    severity: "warning",
    description: "Persona traits conflict (LLM)",
  },
  "M365-017": {
    name: "Cognitive load",
    severity: "warning",
    description: "Overly complex instructions (LLM)",
  },
  "M365-018": {
    name: "Coverage gap",
    severity: "warning",
    description: "Unhandled scenarios (LLM)",
  },
  "M365-019": {
    name: "Output shape / safety",
    severity: "warning",
    description: "Output format or safety concern (LLM)",
  },
};
