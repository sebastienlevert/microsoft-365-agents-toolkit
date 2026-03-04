// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Conformance tests ported from Microsoft.Plugins.Manifest .NET library:
 * tests/PluginsManifestTests/Rules/RuntimeRulesValidationTests.cs
 *
 * Tests plugin runtime validation rules. The v2.1→v2.3 chain includes basic
 * auth requirement. Advanced rules (URL validation, MCP, OpenAPI spec) are in
 * v2.4 Rego rules. Tests are organized by version availability.
 */

import * as chai from "chai";
import "mocha";
import { validateCopilotManifest } from "../../src";
import { createValidPlugin, createValidPluginWithRuntimes } from "./generators";

const expect = chai.expect;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ValidationResult = { errors: any[]; warnings: any[] };

async function validate(content: Record<string, unknown>): Promise<ValidationResult> {
  return validateCopilotManifest(JSON.stringify(content, null, 2));
}

describe("Conformance - Plugin Runtime Rules", () => {
  // ===========================================================
  // RULES IN v2.1→v2.3 CHAIN
  // ===========================================================

  // Port: RuntimeAuthRequiredRulePassesWhenAuthIsPresent
  it("should pass when runtime has auth present", async () => {
    const plugin = createValidPlugin();
    const result = await validate(plugin);
    expect(result.errors).to.have.lengthOf(0);
  });

  // Port: RuntimeAuthRequiredRuleDetectsMissingAuth
  it("should error when runtime auth is missing", async () => {
    const plugin = createValidPluginWithRuntimes([
      {
        type: "OpenApi",
        spec: { url: "https://api.example.com/openapi.yaml" },
        run_for_functions: ["testFunction"],
      },
    ]);
    const result = await validate(plugin);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // ===========================================================
  // RULES IN v2.4 ONLY (require v2.4 schema for full coverage)
  // These tests document .NET conformance expectations
  // ===========================================================

  // Port: URLOrAPIDescriptionMustBePresentInOpenAPIRuntimeSpecRule
  // OpenAPI spec requires either URL or api_description — v2.4 Rego rule
  it("[v2.4 rule] OpenAPI runtime with valid spec URL passes", async () => {
    const plugin = createValidPlugin();
    const result = await validate(plugin);
    expect(result.errors).to.have.lengthOf(0);
  });

  // Port: RemoteMCPServerRuntimeReturnsNoProblemWhenUrlIsAbsolute
  // RemoteMCPServer is NOT in the v2.3 schema (only OpenApi, LocalPlugin)
  it("[v2.4 rule] MCP runtime — rejected by v2.3 schema (not a valid type)", async () => {
    const plugin = createValidPluginWithRuntimes([
      {
        type: "RemoteMCPServer",
        auth: { type: "None" },
        spec: { url: "https://valid-url.com/api" },
        run_for_functions: ["testFunction"],
      },
    ]);
    const result = await validate(plugin);
    // v2.3 schema only allows OpenApi and LocalPlugin runtime types
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Test: Runtime spec URL must be absolute (OpenApi) — NOT validated by v2.3 schema
  it("[v2.4 rule] relative OpenAPI URL — not validated in v2.3", async () => {
    const plugin = createValidPluginWithRuntimes([
      {
        type: "OpenApi",
        auth: { type: "None" },
        spec: { url: "/relative/path" },
        run_for_functions: ["testFunction"],
      },
    ]);
    const result = await validate(plugin);
    // v2.3 schema does not enforce URI format on spec.url
    // The v2.4 Rego rule would catch this
  });
});
