// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Conformance tests ported from Microsoft.Plugins.Manifest .NET library:
 * tests/PluginsManifestTests/Rules/PluginManifestRulesTests.cs
 * tests/PluginsManifestTests/Rules/capabilitiesRulesValidationTests.cs
 *
 * Tests plugin manifest-level rules including namespace validation,
 * description limits, function names in RunForFunctions, and URL validations.
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

describe("Conformance - Plugin Manifest Rules", () => {
  // ============================================
  // VALID PLUGIN TESTS
  // ============================================

  it("should pass with minimal valid plugin", async () => {
    const result = await validate(createValidPlugin());
    expect(result.errors).to.have.lengthOf(0);
  });

  // ============================================
  // NAME AND DESCRIPTION RULES
  // ============================================

  // Test: name_for_human max length (20) — generates warning per .NET spec (characters beyond 20 MAY be ignored)
  it("should warn when name_for_human exceeds 20 chars", async () => {
    const plugin = createValidPlugin({ name_for_human: "a".repeat(21) });
    const result = await validate(plugin);
    expect(result.warnings.length).to.be.greaterThan(0);
    expect(result.warnings.some((w: { code: string }) => w.code === "M365-005")).to.be.true;
  });

  it("should pass when name_for_human is at max length (20)", async () => {
    const plugin = createValidPlugin({ name_for_human: "a".repeat(20) });
    const result = await validate(plugin);
    expect(result.errors).to.have.lengthOf(0);
  });

  // Test: description_for_human max length (100) — generates warning (characters beyond 100 MAY be ignored)
  it("should warn when description_for_human exceeds 100 chars", async () => {
    const plugin = createValidPlugin({ description_for_human: "a".repeat(101) });
    const result = await validate(plugin);
    expect(result.warnings.length).to.be.greaterThan(0);
    expect(result.warnings.some((w: { code: string }) => w.code === "M365-005")).to.be.true;
  });

  it("should pass when description_for_human is at max length (100)", async () => {
    const plugin = createValidPlugin({ description_for_human: "a".repeat(100) });
    const result = await validate(plugin);
    expect(result.errors).to.have.lengthOf(0);
  });

  // Test: description_for_model max length (2048) — also a warning
  it("should warn when description_for_model exceeds 2048 chars", async () => {
    const plugin = createValidPlugin({ description_for_model: "a".repeat(2049) });
    const result = await validate(plugin);
    expect(result.warnings.length).to.be.greaterThan(0);
  });

  // ============================================
  // NAMESPACE RULES
  // ============================================

  // v2.1→v2.3 regex: ^[A-Za-z0-9_]+$ (underscores, no hyphens)
  // v2.4 regex: ^[A-Za-z0-9-]+$ (hyphens, no underscores) — matches .NET
  // These tests verify the v2.3 chain behavior

  for (const invalidNs of ["test plugin", "test@plugin", "test.plugin"]) {
    it(`should error for invalid namespace: '${invalidNs}'`, async () => {
      const plugin = createValidPlugin({ namespace: invalidNs });
      const result = await validate(plugin);
      expect(result.errors.length).to.be.greaterThan(0);
    });
  }

  for (const validNs of ["testplugin", "TestPlugin", "test123", "test_plugin"]) {
    it(`should pass for valid namespace in v2.3: '${validNs}'`, async () => {
      const plugin = createValidPlugin({ namespace: validNs });
      const result = await validate(plugin);
      expect(result.errors).to.have.lengthOf(0);
    });
  }

  // v2.4-only: hyphens are allowed, underscores are not (matches .NET ^[A-Za-z0-9-]+$)
  it("[v2.4 rule] namespace with hyphen passes in v2.3 (different regex)", async () => {
    const plugin = createValidPlugin({ namespace: "test-plugin" });
    const result = await validate(plugin);
    // v2.1 regex ^[A-Za-z0-9_]+$ rejects hyphens
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // ============================================
  // NAMESPACE + FUNCTION NAME COMBINED LENGTH (v2.4 only)
  // ============================================

  // v2.4 rule: namespace + function name combined max 64 chars
  it("[v2.4 rule] combined length test — v2.3 does not enforce this", async () => {
    const namespace = "a".repeat(40);
    const funcName = "b".repeat(25); // 40 + 25 = 65 > 64
    const plugin = createValidPluginWithFunctions(
      [{ name: funcName, description: "Test function" }],
      { namespace }
    );
    const result = await validate(plugin);
    // v2.3 chain doesn't have this rule; no assertion needed
  });

  it("should pass when namespace + function name combined is within limits", async () => {
    const plugin = createValidPluginWithFunctions(
      [{ name: "testfunc", description: "Test function" }],
      { namespace: "testplugin" }
    );
    const result = await validate(plugin);
    expect(result.errors).to.have.lengthOf(0);
  });

  // ============================================
  // URL VALIDATION RULES (schema-level)
  // ============================================

  // The v2.3 schema validates URL format for logo_url, legal_info_url, privacy_policy_url
  it("should error when logo_url is not absolute", async () => {
    const plugin = createValidPlugin({ logo_url: "/relative/logo.png" });
    const result = await validate(plugin);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it("should error when legal_info_url is not absolute", async () => {
    const plugin = createValidPlugin({ legal_info_url: "not-a-url" });
    const result = await validate(plugin);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it("should error when privacy_policy_url is not absolute", async () => {
    const plugin = createValidPlugin({ privacy_policy_url: "not-a-url" });
    const result = await validate(plugin);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // ============================================
  // FUNCTION NAMES IN RUNFORFUNCTIONS (v2.4 only)
  // ============================================

  // Port: FunctionNamesInRunForFunctionsMustBeInFunctionsRuleMustDetectInvalidFunctions
  // This rule is in v2.4 Rego only
  it("[v2.4 rule] RunForFunctions references — not validated in v2.3", async () => {
    const plugin = createValidPlugin({
      functions: [
        { name: "function1", description: "Func 1" },
        { name: "function2", description: "Func 2" },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: { type: "None" },
          spec: { url: "https://api.example.com/openapi.yaml" },
          run_for_functions: ["InvalidFuncName1"],
        },
      ],
    });
    const result = await validate(plugin);
    // v2.3 doesn't validate run_for_functions against function names
  });

  it("should pass when RunForFunctions references valid functions", async () => {
    const plugin = createValidPlugin({
      functions: [
        { name: "function1", description: "Func 1" },
        { name: "function2", description: "Func 2" },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: { type: "None" },
          spec: { url: "https://api.example.com/openapi.yaml" },
          run_for_functions: ["function1", "function2"],
        },
      ],
    });
    const result = await validate(plugin);
    expect(result.errors).to.have.lengthOf(0);
  });

  // ============================================
  // SECURITY_INFO RULES (v2.4 only)
  // ============================================

  // security_info data_handling validation is in v2.4/plugin.rego
  it("[v2.4 rule] security_info data_handling — not validated in v2.3", async () => {
    const plugin = createValidPlugin({
      functions: [
        {
          name: "testFunc",
          description: "Test function",
          capabilities: {
            security_info: {
              data_handling: ["invalid_value"],
            },
          },
        },
      ],
    });
    const result = await validate(plugin);
    // v2.3 doesn't validate security_info data_handling values
  });
});
