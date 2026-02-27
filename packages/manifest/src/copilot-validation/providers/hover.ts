// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { Hover, MarkupContent, MarkupKind, Position, TextDocument } from "../types";
import { getLocationAtPosition } from "../parser";
import { DocumentType } from "../parser";

// Property documentation for declarative agents
const DECLARATIVE_AGENT_DOCS: Record<string, { description: string; constraints?: string }> = {
  $schema: {
    description: "The JSON schema URL for validation.",
    constraints: "Must be a valid declarative agent schema URL.",
  },
  version: {
    description: "The version of the schema this manifest is using.",
    constraints: "Current version: v1.6",
  },
  id: {
    description: "Optional identifier for the declarative agent.",
  },
  name: {
    description: "The name of the declarative agent.",
    constraints: "1-100 characters, must contain at least one non-whitespace character.",
  },
  description: {
    description: "The description of the declarative agent.",
    constraints: "1-1000 characters, must contain at least one non-whitespace character.",
  },
  instructions: {
    description:
      "Detailed instructions or guidelines on how the declarative agent should behave, its functions, and any behaviors to avoid.",
    constraints: "1-8000 characters.",
  },
  disclaimer: {
    description: "A disclaimer message shown at the start of conversations.",
  },
  "disclaimer.text": {
    description: "The disclaimer text displayed to users.",
    constraints: "1-500 characters.",
  },
  conversation_starters: {
    description: "Suggested prompts users can use to start conversations.",
    constraints: "Maximum 12 conversation starters.",
  },
  "conversation_starters.title": {
    description: "Optional title for the conversation starter.",
    constraints: "Must be non-empty if provided.",
  },
  "conversation_starters.text": {
    description: "The text of the conversation starter prompt.",
    constraints: "Required, must be non-empty.",
  },
  capabilities: {
    description: "Array of capabilities that define what the agent can access and do.",
  },
  "capabilities.name": {
    description:
      "The type of capability: WebSearch, Email, OneDriveAndSharePoint, CopilotConnectors, TeamsMessages, Dataverse, EmbeddedKnowledge, ScenarioModels, GraphicArt, CodeInterpreter, Actions.",
  },
  connected_agents: {
    description: "Worker agents that this orchestrator agent can delegate tasks to.",
    constraints: "Maximum 10 connected agents.",
  },
  "connected_agents.id": {
    description: "The unique identifier (GUID) of the connected worker agent.",
    constraints: "Must be a valid GUID format: {8-4-4-4-12}",
  },
  behavior_overrides: {
    description: "Configuration settings that modify the behavior of the agent orchestration.",
  },
};

// Property documentation for API plugins
const API_PLUGIN_DOCS: Record<string, { description: string; constraints?: string }> = {
  $schema: {
    description: "The JSON schema URL for validation.",
  },
  schema_version: {
    description: "The schema version.",
    constraints: "Current version: v2.3",
  },
  name_for_human: {
    description: "A short, human-readable name for the plugin.",
    constraints: "Characters beyond 20 may be ignored.",
  },
  namespace: {
    description:
      "An identifier used to prevent name conflicts between function names from different plugins.",
    constraints: "Must match pattern: ^[A-Za-z0-9_]+$",
  },
  description_for_model: {
    description:
      "The description for the plugin that is provided to the model. Describes what the plugin is for and when its functions are relevant.",
    constraints: "Characters beyond 2048 may be ignored.",
  },
  description_for_human: {
    description: "A human-readable description of the plugin.",
    constraints: "Characters beyond 100 may be ignored.",
  },
  functions: {
    description: "A set of function objects describing the functions available to the plugin.",
  },
  "functions.name": {
    description: "The name of the function. Must be unique within the plugin.",
  },
  "functions.description": {
    description: "A description of what the function does.",
    constraints: "Required for proper function invocation.",
  },
  runtimes: {
    description: "Configuration for the runtime environments that execute plugin functions.",
  },
};

/**
 * Provide hover information for a position in a document
 */
export function provideHover(
  document: TextDocument,
  position: Position,
  documentType: DocumentType
): Hover | null {
  const location = getLocationAtPosition(document, position);
  const path = location.path;

  if (path.length === 0) {
    return null;
  }

  // Build the property path string
  const propertyPath = path.filter((p) => typeof p === "string").join(".");

  // Get the last property name
  const lastProperty = path[path.length - 1];
  const propertyName = typeof lastProperty === "string" ? lastProperty : undefined;

  if (!propertyName) {
    return null;
  }

  // Look up documentation
  const docs = documentType === "declarative-agent" ? DECLARATIVE_AGENT_DOCS : API_PLUGIN_DOCS;

  // Try full path first, then just the property name
  const docEntry = docs[propertyPath] || docs[propertyName];

  if (!docEntry) {
    return null;
  }

  // Build hover content
  let content = `**${propertyName}**\n\n${docEntry.description}`;

  if (docEntry.constraints) {
    content += `\n\n*Constraints:* ${docEntry.constraints}`;
  }

  const hoverContent: MarkupContent = {
    kind: MarkupKind.Markdown,
    value: content,
  };

  return {
    contents: hoverContent,
  };
}
