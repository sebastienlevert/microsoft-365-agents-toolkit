// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Conformance tests ported from Microsoft.Plugins.Manifest .NET library:
 * tests/DcManifestTests/DAEditorialAnswersTests.cs
 *
 * NOTE: The DA v1.6 JSON schema does not yet include `editorial_answers` as an
 * allowed property. The .NET library supports it via its object model, but the
 * JSON schema validator will reject it as an unrecognized property.
 *
 * Tests below verify that:
 * 1. editorial_answers IS caught as a schema error (current behavior)
 * 2. When schema support is added, these tests can be updated to verify Rego rules
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

describe("Conformance - DA Editorial Answers", () => {
  // The DA v1.6 schema does not include editorial_answers.
  // The .NET library supports it, so these tests document the gap.
  // When the schema is updated, flip the assertion to expect 0 errors.

  // Port: DAEditorialAnswers_WithValidUrlSchema_ShouldPass
  // GAP: Schema rejects editorial_answers as unknown property
  it("should reject editorial_answers (not yet in v1.6 schema)", async () => {
    const agent = createValidAgent({
      editorial_answers: {
        url: "https://example.com/answers",
      },
    });
    const result = await validate(agent);
    // Currently rejected by schema - when schema is updated, expect 0 errors
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Port: DAEditorialAnswers_WithBothUrlAndAnswers_ShouldFailValidation
  it("should error when both URL and answers are provided", async () => {
    const agent = createValidAgent({
      editorial_answers: {
        url: "https://example.com/answers",
        answers: [{ question: "What is AI?", answer: "Artificial Intelligence" }],
      },
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Port: DAEditorialAnswers_EmptyObject_ShouldPassSchema
  it("should error with editorial_answers (not yet in v1.6 schema)", async () => {
    const agent = createValidAgent({
      editorial_answers: {},
    });
    const result = await validate(agent);
    // Currently rejected by schema
    expect(result.errors.length).to.be.greaterThan(0);
  });

  // Test: all editorial_answers variants hit schema rejection
  it("should error for answers array (not yet in v1.6 schema)", async () => {
    const agent = createValidAgent({
      editorial_answers: {
        answers: [{ question: "What is AI?", answer: "AI is..." }],
      },
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });
});
