// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Conformance tests ported from Microsoft.Plugins.Manifest .NET library:
 * tests/DcManifestTests/DAUserOverrideTests.cs
 * tests/DcManifestTests/Rules/UserOverridePathSyntaxRuleTests.cs
 * tests/DcManifestTests/Rules/UserOverridePathTargetRuleTests.cs
 *
 * Tests User Override validation including allowed_actions, path requirements,
 * path syntax validation, path target validation, and valid/invalid action values.
 */

import * as chai from "chai";
import "mocha";
import { validateCopilotManifest } from "../../src";
import { createValidAgent } from "./generators";

const expect = chai.expect;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ValidationResult = { errors: any[]; warnings: any[] };

async function validate(content: Record<string, unknown>): Promise<ValidationResult> {
  return validateCopilotManifest(JSON.stringify(content, null, 2));
}

function allCodes(result: ValidationResult): string[] {
  return [
    ...result.errors.map((e: { code: string }) => e.code),
    ...result.warnings.map((w: { code: string }) => w.code),
  ];
}

describe("Conformance - DA User Overrides", () => {
  // Port: DAUserOverride_ShouldSupportMultipleUserOverrides
  it("should pass with multiple valid user overrides", async () => {
    const agent = createValidAgent({
      capabilities: [
        {
          name: "OneDriveAndSharePoint",
          items_by_url: [{ url: "https://company-docs.sharepoint.com" }],
        },
        { name: "WebSearch", sites: [{ url: "https://research-journals.com" }] },
      ],
      user_overrides: [
        {
          path: "$.capabilities[?(@.name == 'OneDriveAndSharePoint')]",
          allowed_actions: ["remove"],
        },
        {
          path: "$.capabilities[?(@.name == 'WebSearch')]",
          allowed_actions: ["remove"],
        },
      ],
    });
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  // Port: DAUserOverride_ShouldRequireAtLeastOneAllowedAction
  it("should error when allowed_actions is empty", async () => {
    const agent = createValidAgent({
      capabilities: [{ name: "WebSearch" }],
      user_overrides: [
        {
          path: "$.capabilities[?(@.name == 'WebSearch')]",
          allowed_actions: [],
        },
      ],
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Port: DAUserOverride_ShouldRequirePath
  it("should error when path is missing", async () => {
    const agent = createValidAgent({
      capabilities: [{ name: "WebSearch" }],
      user_overrides: [{ allowed_actions: ["remove"] }],
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Port: DAUserOverride_EmptyUserOverridesArray_ShouldNotReportProblems
  // GAP: The JSON schema requires minItems: 1 for user_overrides, while .NET allows empty arrays
  it("should error with empty user_overrides array (schema requires minItems: 1)", async () => {
    const agent = createValidAgent({
      capabilities: [{ name: "WebSearch" }],
      user_overrides: [],
    });
    const result = await validate(agent);
    // Schema enforces minItems: 1, .NET library allows empty - conformance gap
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Port: DAUserOverride_ValidActions_ShouldBeAccepted ("remove")
  it("should pass with 'remove' as allowed action", async () => {
    const agent = createValidAgent({
      capabilities: [{ name: "WebSearch" }],
      user_overrides: [
        {
          path: "$.capabilities[?(@.name == 'WebSearch')]",
          allowed_actions: ["remove"],
        },
      ],
    });
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  // Port: DAUserOverride_InvalidActions_ShouldBeRejected
  for (const invalidAction of [
    "modify",
    "add",
    "update",
    "delete",
    "edit",
    "create",
    "replace",
    "invalid_action",
  ]) {
    it(`should error with invalid action '${invalidAction}'`, async () => {
      const agent = createValidAgent({
        capabilities: [{ name: "WebSearch" }],
        user_overrides: [
          {
            path: "$.capabilities[?(@.name == 'WebSearch')]",
            allowed_actions: [invalidAction],
          },
        ],
      });
      const result = await validate(agent);
      expect(result.errors.length).to.be.greaterThan(0);
    });
  }

  // Port: DAUserOverride_EmptyOverrideObject_ShouldReportProblems
  it("should error with empty override object", async () => {
    const agent = createValidAgent({
      capabilities: [{ name: "WebSearch" }],
      user_overrides: [{}],
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });
});

describe("Conformance - DA User Override Path Target", () => {
  // Port: UserOverridePathTargetRule_ValidTargets_ShouldNotCreateProblems
  for (const validPath of [
    "$.capabilities[0]",
    "$.capabilities[*]",
    "$.capabilities[?(@.name == 'WebSearch')]",
  ]) {
    it(`should pass with valid path target: ${validPath}`, async () => {
      const agent = createValidAgent({
        capabilities: [{ name: "WebSearch" }],
        user_overrides: [{ path: validPath, allowed_actions: ["remove"] }],
      });
      const result = await validate(agent);
      expect(result.errors).to.have.lengthOf(0);
    });
  }

  // Port: UserOverridePathTargetRule_InvalidTargets_ShouldCreateProblems
  for (const invalidPath of [
    "$.conversation_starters[0]",
    "$.description",
    "$.instructions",
    "$.actions[*]",
  ]) {
    it(`should error with invalid path target: ${invalidPath}`, async () => {
      const agent = createValidAgent({
        capabilities: [{ name: "WebSearch" }],
        user_overrides: [{ path: invalidPath, allowed_actions: ["remove"] }],
      });
      const result = await validate(agent);
      expect(result.errors.length).to.be.greaterThan(0);
    });
  }

  // Port: UserOverridePathTargetRule_MultipleUserOverrides_MixedTargets
  it("should report errors only for invalid path targets in mixed list", async () => {
    const agent = createValidAgent({
      capabilities: [{ name: "WebSearch" }],
      user_overrides: [
        { path: "$.capabilities[0]", allowed_actions: ["remove"] }, // valid
        { path: "$.conversation_starters[0]", allowed_actions: ["remove"] }, // invalid
        { path: "$.actions[0]", allowed_actions: ["remove"] }, // invalid
        { path: "$.description", allowed_actions: ["remove"] }, // invalid
      ],
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThanOrEqual(3);
  });
});
