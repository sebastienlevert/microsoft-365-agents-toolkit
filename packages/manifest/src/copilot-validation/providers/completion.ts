// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
  TextDocument,
} from "../types";
import { getLocationAtPosition } from "../parser";
import { DocumentType } from "../parser";
import * as jsonc from "jsonc-parser";

// Completion items for declarative agent root properties
const DECLARATIVE_AGENT_ROOT_COMPLETIONS: CompletionItem[] = [
  {
    label: "$schema",
    kind: CompletionItemKind.Property,
    insertText:
      '"\\$schema": "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.6/schema.json"',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "The JSON schema for declarative agents",
  },
  {
    label: "version",
    kind: CompletionItemKind.Property,
    insertText: '"version": "v1.6"',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "Schema version (v1.6)",
  },
  {
    label: "name",
    kind: CompletionItemKind.Property,
    insertText: '"name": "$1"',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "The name of the declarative agent (1-100 chars)",
  },
  {
    label: "description",
    kind: CompletionItemKind.Property,
    insertText: '"description": "$1"',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "The description of the declarative agent (1-1000 chars)",
  },
  {
    label: "instructions",
    kind: CompletionItemKind.Property,
    insertText: '"instructions": "$1"',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "Behavioral guidelines for the agent (1-8000 chars)",
  },
  {
    label: "capabilities",
    kind: CompletionItemKind.Property,
    insertText: '"capabilities": [\n  {\n    "name": "$1"\n  }\n]',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "Array of capabilities the agent can use",
  },
  {
    label: "conversation_starters",
    kind: CompletionItemKind.Property,
    insertText: '"conversation_starters": [\n  {\n    "title": "$1",\n    "text": "$2"\n  }\n]',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "Suggested prompts (max 12)",
  },
  {
    label: "disclaimer",
    kind: CompletionItemKind.Property,
    insertText: '"disclaimer": {\n  "text": "$1"\n}',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "Disclaimer shown at conversation start",
  },
];

// Capability name completions
const CAPABILITY_NAMES: CompletionItem[] = [
  {
    label: "WebSearch",
    kind: CompletionItemKind.EnumMember,
    documentation: "Search the web for grounding information",
  },
  { label: "Email", kind: CompletionItemKind.EnumMember, documentation: "Search email messages" },
  {
    label: "OneDriveAndSharePoint",
    kind: CompletionItemKind.EnumMember,
    documentation: "Search SharePoint and OneDrive",
  },
  {
    label: "CopilotConnectors",
    kind: CompletionItemKind.EnumMember,
    documentation: "Search Copilot connectors",
  },
  {
    label: "TeamsMessages",
    kind: CompletionItemKind.EnumMember,
    documentation: "Search Teams channels, meetings, and chats",
  },
  {
    label: "Dataverse",
    kind: CompletionItemKind.EnumMember,
    documentation: "Search Microsoft Dataverse",
  },
  {
    label: "EmbeddedKnowledge",
    kind: CompletionItemKind.EnumMember,
    documentation: "Use embedded knowledge files",
  },
  {
    label: "ScenarioModels",
    kind: CompletionItemKind.EnumMember,
    documentation: "Use task-specific AI models",
  },
  {
    label: "GraphicArt",
    kind: CompletionItemKind.EnumMember,
    documentation: "Create images and art",
  },
  {
    label: "CodeInterpreter",
    kind: CompletionItemKind.EnumMember,
    documentation: "Generate and execute Python code",
  },
  { label: "Actions", kind: CompletionItemKind.EnumMember, documentation: "API plugin actions" },
  {
    label: "People",
    kind: CompletionItemKind.EnumMember,
    documentation: "Search for people information",
  },
  {
    label: "Meetings",
    kind: CompletionItemKind.EnumMember,
    documentation: "Search meeting content",
  },
];

// Completions for API plugin root
const API_PLUGIN_ROOT_COMPLETIONS: CompletionItem[] = [
  {
    label: "$schema",
    kind: CompletionItemKind.Property,
    insertText:
      '"\\$schema": "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.3/schema.json"',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "The JSON schema for API plugins",
  },
  {
    label: "schema_version",
    kind: CompletionItemKind.Property,
    insertText: '"schema_version": "v2.3"',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "Schema version (v2.3)",
  },
  {
    label: "name_for_human",
    kind: CompletionItemKind.Property,
    insertText: '"name_for_human": "$1"',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "Human-readable plugin name",
  },
  {
    label: "namespace",
    kind: CompletionItemKind.Property,
    insertText: '"namespace": "$1"',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "Unique namespace identifier",
  },
  {
    label: "description_for_model",
    kind: CompletionItemKind.Property,
    insertText: '"description_for_model": "$1"',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "Description provided to the model",
  },
  {
    label: "description_for_human",
    kind: CompletionItemKind.Property,
    insertText: '"description_for_human": "$1"',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "Human-readable description",
  },
  {
    label: "functions",
    kind: CompletionItemKind.Property,
    insertText: '"functions": [\n  {\n    "name": "$1",\n    "description": "$2"\n  }\n]',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "Array of plugin functions",
  },
  {
    label: "runtimes",
    kind: CompletionItemKind.Property,
    insertText:
      '"runtimes": [\n  {\n    "type": "OpenApi",\n    "spec": {\n      "url": "$1"\n    }\n  }\n]',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: "Runtime configurations",
  },
];

/**
 * Provide completion items for a position in a document
 */
export function provideCompletions(
  document: TextDocument,
  position: Position,
  documentType: DocumentType
): CompletionItem[] {
  const location = getLocationAtPosition(document, position);
  const path = location.path;

  // Determine context and provide appropriate completions
  if (path.length === 0) {
    // At root level
    return documentType === "declarative-agent"
      ? DECLARATIVE_AGENT_ROOT_COMPLETIONS
      : documentType === "api-plugin"
      ? API_PLUGIN_ROOT_COMPLETIONS
      : [...DECLARATIVE_AGENT_ROOT_COMPLETIONS, ...API_PLUGIN_ROOT_COMPLETIONS];
  }

  // Check if we're in a capabilities array, completing "name"
  if (isCapabilityNameContext(path)) {
    return CAPABILITY_NAMES;
  }

  // Check if we're at root object level (inside braces but not in a property value)
  if (path.length === 1 && typeof path[0] === "string") {
    // We're editing a property name at root
    return documentType === "declarative-agent"
      ? DECLARATIVE_AGENT_ROOT_COMPLETIONS
      : documentType === "api-plugin"
      ? API_PLUGIN_ROOT_COMPLETIONS
      : [...DECLARATIVE_AGENT_ROOT_COMPLETIONS, ...API_PLUGIN_ROOT_COMPLETIONS];
  }

  return [];
}

/**
 * Check if we're in a context where we should complete capability names
 */
function isCapabilityNameContext(path: jsonc.JSONPath): boolean {
  // Path like: ["capabilities", 0, "name"]
  if (path.length >= 3) {
    const [first, second, third] = path;
    if (first === "capabilities" && typeof second === "number" && third === "name") {
      return true;
    }
  }
  return false;
}

/**
 * Provide snippet completions for common patterns
 */
export function getSnippetCompletions(documentType: DocumentType): CompletionItem[] {
  const snippets: CompletionItem[] = [];

  if (documentType === "declarative-agent" || documentType === "unknown") {
    snippets.push({
      label: "Declarative Agent (full)",
      kind: CompletionItemKind.Snippet,
      insertText: `{
  "\\$schema": "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.6/schema.json",
  "version": "v1.6",
  "name": "\${1:Agent Name}",
  "description": "\${2:Agent description}",
  "instructions": "\${3:Behavioral instructions for the agent}",
  "conversation_starters": [
    {
      "title": "\${4:Starter title}",
      "text": "\${5:Starter text}"
    }
  ],
  "capabilities": [
    {
      "name": "\${6|WebSearch,Email,OneDriveAndSharePoint|}"
    }
  ]
}`,
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: "Full declarative agent template",
    });

    snippets.push({
      label: "WebSearch capability",
      kind: CompletionItemKind.Snippet,
      insertText: `{
  "name": "WebSearch",
  "sites": [
    {
      "url": "\${1:https://example.com}"
    }
  ]
}`,
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: "WebSearch capability with sites",
    });

    snippets.push({
      label: "EmbeddedKnowledge capability",
      kind: CompletionItemKind.Snippet,
      insertText: `{
  "name": "EmbeddedKnowledge",
  "files": [
    {
      "file": "\${1:knowledge.pdf}",
      "description": "\${2:File description}"
    }
  ]
}`,
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: "EmbeddedKnowledge capability with files",
    });
  }

  return snippets;
}
