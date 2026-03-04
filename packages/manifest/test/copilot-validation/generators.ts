// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Test fixture generators for copilot-validation tests.
 */

export const SCHEMA_DECLARATIVE_AGENT =
  "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.6/schema.json";

export function createValidAgent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    $schema: SCHEMA_DECLARATIVE_AGENT,
    version: "v1.6",
    name: "Test Agent",
    description: "A test declarative agent for validation",
    instructions: "You are a helpful test agent. Answer questions accurately.",
    ...overrides,
  };
}

export function createValidAgentWithCapabilities(
  capabilities: Array<Record<string, unknown>>
): Record<string, unknown> {
  return createValidAgent({ capabilities });
}

export function createValidAgentWithConversationStarters(count: number): Record<string, unknown> {
  const starters = Array.from({ length: count }, (_, i) => ({
    title: `Starter ${i + 1}`,
    text: `How can I help you with topic ${i + 1}?`,
  }));
  return createValidAgent({ conversation_starters: starters });
}

export function createValidAgentWithActions(count: number): Record<string, unknown> {
  const actions = Array.from({ length: count }, (_, i) => ({
    id: `action-${i + 1}`,
    file: `plugin-${i + 1}.json`,
  }));
  return createValidAgent({ actions });
}

export function createValidAgentWithWorkerAgents(count: number): Record<string, unknown> {
  const workers = Array.from({ length: count }, (_, i) => ({
    id: `{${i.toString().padStart(8, "0")}-0000-0000-0000-000000000000}`,
  }));
  return createValidAgent({ worker_agents: workers });
}

// ============================================
// PLUGIN GENERATORS
// ============================================

export const SCHEMA_API_PLUGIN =
  "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.3/schema.json";

export function createValidPlugin(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    $schema: SCHEMA_API_PLUGIN,
    schema_version: "v2.3",
    name_for_human: "TestPlugin",
    description_for_human: "A test plugin for validation",
    namespace: "testplugin",
    logo_url: "https://example.com/logo.png",
    contact_email: "test@example.com",
    legal_info_url: "https://example.com/legal",
    privacy_policy_url: "https://example.com/privacy",
    functions: [
      {
        name: "testFunction",
        description: "A test function",
      },
    ],
    runtimes: [
      {
        type: "OpenApi",
        auth: { type: "None" },
        spec: { url: "https://api.example.com/openapi.yaml" },
        run_for_functions: ["testFunction"],
      },
    ],
    ...overrides,
  };
}

export function createValidPluginWithFunctions(
  functions: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return createValidPlugin({
    functions,
    runtimes: [
      {
        type: "OpenApi",
        auth: { type: "None" },
        spec: { url: "https://api.example.com/openapi.yaml" },
        run_for_functions: functions.map((f) => f.name as string).filter(Boolean),
      },
    ],
    ...overrides,
  });
}

export function createValidPluginWithRuntimes(
  runtimes: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return createValidPlugin({ runtimes, ...overrides });
}
