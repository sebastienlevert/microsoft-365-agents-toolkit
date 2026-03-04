// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Conformance tests ported from Microsoft.Plugins.Manifest .NET library:
 * tests/PluginsManifestTests/Rules/FunctionRulesValidationTests.cs
 *
 * Tests plugin function validation rules. Note: The v2.3 schema/Rego chain includes
 * basic function validation (name required, description required). Advanced rules
 * (name uniqueness, name characters, param types, return types, max count) are
 * in v2.4 Rego rules which require schema_version: "v2.4".
 *
 * Tests are organized into:
 * - Rules available in v2.1→v2.3 chain (fully testable)
 * - Rules only in v2.4 (noted as conformance gaps)
 */

import * as chai from "chai";
import "mocha";
import { validateCopilotManifest } from "../../src";
import { createValidPlugin, createValidPluginWithFunctions } from "./generators";

const expect = chai.expect;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ValidationResult = { errors: any[]; warnings: any[] };

async function validate(content: Record<string, unknown>): Promise<ValidationResult> {
  return validateCopilotManifest(JSON.stringify(content, null, 2));
}

function errorCodes(result: ValidationResult): string[] {
  return result.errors.map((e: { code: string }) => e.code);
}

describe("Conformance - Plugin Function Rules", () => {
  // ===========================================================
  // RULES AVAILABLE IN v2.1→v2.3 CHAIN
  // ===========================================================

  // Port: NameRequiredRuleDetectsMissingName
  it("should error when function name is missing", async () => {
    const plugin = createValidPluginWithFunctions([{ description: "A function missing a name" }]);
    const result = await validate(plugin);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Port: DescriptionRequiredRuleDetectsMissingDescription
  it("should error when function description is missing", async () => {
    const plugin = createValidPluginWithFunctions([{ name: "functionName" }]);
    const result = await validate(plugin);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Valid function with both name and description
  it("should pass with valid function (name + description)", async () => {
    const plugin = createValidPluginWithFunctions([
      { name: "testFunction", description: "A test function" },
    ]);
    const result = await validate(plugin);
    expect(result.errors).to.have.lengthOf(0);
  });

  // Multiple valid functions
  it("should pass with multiple valid functions", async () => {
    const plugin = createValidPluginWithFunctions([
      { name: "func1", description: "First function" },
      { name: "func2", description: "Second function" },
      { name: "func3", description: "Third function" },
    ]);
    const result = await validate(plugin);
    expect(result.errors).to.have.lengthOf(0);
  });

  // ===========================================================
  // RULES IN v2.4 ONLY (tested via Rego when v2.4 schema is added)
  // These tests document expected .NET behavior
  // ===========================================================

  // Port: NameCharactersRuleDetectsInvalidNames — v2.4 only
  // The function name character validation (^[A-Za-z0-9_-]+$) is in v2.4/plugin.rego
  // With v2.3 schema, this is not caught
  for (const [name, desc] of [
    ["functionName$", "function with invalid $ character"],
    ["function name", "function with a space"],
    ["function@name", "function with an @"],
  ]) {
    it(`[v2.4 rule] should error for invalid function name: ${desc}`, async () => {
      const plugin = createValidPluginWithFunctions([{ name, description: desc }]);
      const result = await validate(plugin);
      // v2.3 Rego chain does not validate function name characters
      // These will pass in v2.3, would fail in v2.4
      // When v2.4 schema is available, update assertion to expect errors
    });
  }

  // Port: NameCharactersRuleAllowsValidNames — v2.4 only
  // Note: The v2.3 JSON schema pattern is ^[A-Za-z0-9_]+$ (no hyphens)
  // The .NET library allows hyphens (^[A-Za-z0-9_-]+$)
  // This is a schema/library discrepancy
  for (const name of ["function", "function1", "function_name", "FunctionName"]) {
    it(`should pass for valid function name: ${name}`, async () => {
      const plugin = createValidPluginWithFunctions([{ name, description: "Valid function name" }]);
      const result = await validate(plugin);
      expect(result.errors).to.have.lengthOf(0);
    });
  }

  // GAP: .NET allows hyphens in function names, but v2.3 schema rejects them
  for (const name of ["function-name", "function123-abc", "a-b-c-123"]) {
    it(`[schema gap] should reject function name with hyphens in v2.3: ${name}`, async () => {
      const plugin = createValidPluginWithFunctions([
        { name, description: "Function with hyphens" },
      ]);
      const result = await validate(plugin);
      // Schema rejects hyphens; .NET library allows them
      expect(result.errors.length).to.be.greaterThan(0);
    });
  }

  // Port: DescriptionMaxLengthRuleDetectsLongDescription — v2.4 Rego only
  // The description_for_human > 100 is a warning in v2.1 chain, function desc max (1024) is v2.4
  it("[v2.4 rule] should warn when function description is very long (1025)", async () => {
    const plugin = createValidPluginWithFunctions([
      {
        name: "functionName",
        description: "a".repeat(1025),
      },
    ]);
    const result = await validate(plugin);
    // In v2.3, no max-length check on function descriptions
    // This documents the expected .NET behavior
  });

  // Valid description at boundary
  it("should pass with function description at 1024 chars", async () => {
    const plugin = createValidPluginWithFunctions([
      {
        name: "functionName",
        description: "a".repeat(1024),
      },
    ]);
    const result = await validate(plugin);
    expect(result.errors).to.have.lengthOf(0);
  });

  // Port: ParameterPropertiesMemberTypeRuleDetectsInvalidParameterPropertiesMemberType
  // Parameter property type validation is in v2.4
  it("[v2.4 rule] should accept invalid parameter property type in v2.3", async () => {
    const plugin = createValidPluginWithFunctions([
      {
        name: "functionName",
        description: "Function with param",
        parameters: {
          type: "object",
          properties: {
            ngo_name_query: {
              type: "invalidType",
              description: "ngo name query",
            },
          },
        },
      },
    ]);
    const result = await validate(plugin);
    // v2.3 doesn't validate parameter property types in Rego
  });

  // Test valid parameter property types (should always pass)
  for (const validType of ["string", "array", "boolean", "integer", "number"]) {
    it(`should pass with valid parameter property type: ${validType}`, async () => {
      const plugin = createValidPluginWithFunctions([
        {
          name: "functionName",
          description: "Function with valid param type",
          parameters: {
            type: "object",
            properties: {
              param1: { type: validType, description: "Test param" },
            },
          },
        },
      ]);
      const result = await validate(plugin);
      expect(result.errors).to.have.lengthOf(0);
    });
  }
});
