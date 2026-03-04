// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Conformance tests ported from Microsoft.Plugins.Manifest .NET library:
 * tests/DcManifestTests/MeetingsDACapabilityTests.cs
 *
 * Tests Meetings capability validation rules including max items,
 * required fields (id, is_series), and valid/empty items_by_id arrays.
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

function errorCodes(result: ValidationResult): string[] {
  return result.errors.map((e: { code: string }) => e.code);
}

function allCodes(result: ValidationResult): string[] {
  return [
    ...result.errors.map((e: { code: string }) => e.code),
    ...result.warnings.map((w: { code: string }) => w.code),
  ];
}

describe("Conformance - DA Meetings Capability", () => {
  // Port: MeetingsItemsByIdWithValidFieldsReturnNoProblem
  it("should pass with valid Meetings items_by_id", async () => {
    const agent = createValidAgent({
      capabilities: [
        {
          name: "Meetings",
          items_by_id: [
            { id: "292e286f-d4cd-47b3-8221-607fdab8905f", is_series: false },
            { id: "5880c7d8-96cd-4871-85d9-c0f22d1b6bad", is_series: true },
          ],
        },
      ],
    });
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  // Port: MeetingsItemsByIdWithEmptyItemsByIdArrayReturnNoProblem
  it("should pass with empty Meetings items_by_id array", async () => {
    const agent = createValidAgent({
      capabilities: [{ name: "Meetings", items_by_id: [] }],
    });
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  // Port: MeetingsItemsByIdWithoutItemsByIdReturnNoProblem
  it("should pass with Meetings capability without items_by_id", async () => {
    const agent = createValidAgent({
      capabilities: [{ name: "Meetings" }],
    });
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  // Port: MeetingsExceedsMaxAllowedMeetingIdsReturnsProblems
  it("should error when Meetings exceeds max items_by_id (> 5)", async () => {
    const agent = createValidAgent({
      capabilities: [
        {
          name: "Meetings",
          items_by_id: Array.from({ length: 6 }, (_, i) => ({
            id: `${i}0000000-0000-0000-0000-000000000000`,
            is_series: false,
          })),
        },
      ],
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Port: MeetingsItemsByIdMissingRequiredFieldsReturnsProblems (is_series missing)
  it("should error when Meetings items_by_id is missing is_series", async () => {
    const agent = createValidAgent({
      capabilities: [
        {
          name: "Meetings",
          items_by_id: [
            { id: "292e286f-d4cd-47b3-8221-607fdab8905f", is_series: false },
            { id: "5880c7d8-96cd-4871-85d9-c0f22d1b6bad" }, // missing is_series
          ],
        },
      ],
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Port: MeetingsItemsByIdMissingRequiredFieldsReturnsProblems (id missing)
  it("should error when Meetings items_by_id is missing id", async () => {
    const agent = createValidAgent({
      capabilities: [
        {
          name: "Meetings",
          items_by_id: [
            { id: "292e286f-d4cd-47b3-8221-607fdab8905f", is_series: false },
            { is_series: true }, // missing id
          ],
        },
      ],
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Port: MeetingsItemsByIdMissingRequiredFieldsReturnsProblems (both missing)
  it("should error when Meetings items_by_id has empty object", async () => {
    const agent = createValidAgent({
      capabilities: [
        {
          name: "Meetings",
          items_by_id: [
            { id: "292e286f-d4cd-47b3-8221-607fdab8905f", is_series: false },
            {}, // both id and is_series missing
          ],
        },
      ],
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Port: MeetingsItemsByIdMissingRequiredFieldsReturnsProblems (multiple)
  it("should report multiple errors for multiple items with missing fields", async () => {
    const agent = createValidAgent({
      capabilities: [
        {
          name: "Meetings",
          items_by_id: [
            { id: "292e286f-d4cd-47b3-8221-607fdab8905f", is_series: false },
            { id: "5880c7d8-96cd-4871-85d9-c0f22d1b6bad" }, // missing is_series
            { is_series: true }, // missing id
            {}, // both missing
          ],
        },
      ],
    });
    const result = await validate(agent);
    // Should have at least 4 errors: is_series missing on index 1, id missing on index 2, both missing on index 3
    expect(result.errors.length).to.be.greaterThanOrEqual(4);
  });
});
