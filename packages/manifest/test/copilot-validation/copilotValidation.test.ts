// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as chai from "chai";
import "mocha";
import { CopilotValidation, validateCopilotManifest } from "../../src";
import {
  createValidAgent,
  createValidAgentWithCapabilities,
  createValidAgentWithConversationStarters,
  createValidAgentWithActions,
  createValidAgentWithWorkerAgents,
} from "./generators";

const expect = chai.expect;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ValidationResult = { errors: any[]; warnings: any[] };

async function validate(content: Record<string, unknown>): Promise<ValidationResult> {
  return validateCopilotManifest(JSON.stringify(content, null, 2));
}

function errorCodes(result: ValidationResult): string[] {
  return result.errors.map((e: { code: string }) => e.code);
}

// ============================================
// VALID DECLARATIVE AGENT TESTS
// ============================================

describe("Copilot Validation - Valid Agents", () => {
  it("should validate minimal agent with required fields only", async () => {
    const result = await validate(createValidAgent());
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate agent without instructions (optional in v1.6)", async () => {
    const agent = createValidAgent();
    delete agent.instructions;
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate agent with 1 conversation starter", async () => {
    const result = await validate(createValidAgentWithConversationStarters(1));
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate agent with 12 conversation starters (max)", async () => {
    const result = await validate(createValidAgentWithConversationStarters(12));
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate agent with 1 action", async () => {
    const result = await validate(createValidAgentWithActions(1));
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate agent with 10 actions (max)", async () => {
    const result = await validate(createValidAgentWithActions(10));
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate agent with worker agents", async () => {
    const result = await validate(createValidAgentWithWorkerAgents(3));
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate worker agent with GUID without braces", async () => {
    const agent = createValidAgent({
      worker_agents: [{ id: "12345678-1234-1234-1234-123456789012" }],
    });
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate worker agent with GUID with braces", async () => {
    const agent = createValidAgent({
      worker_agents: [{ id: "{12345678-1234-1234-1234-123456789012}" }],
    });
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  for (const prefix of ["T_", "U_", "P_"]) {
    it(`should validate worker agent with ${prefix} prefixed GUID`, async () => {
      const agent = createValidAgent({
        worker_agents: [{ id: `${prefix}12345678-1234-1234-1234-123456789012` }],
      });
      const result = await validate(agent);
      expect(result.errors).to.have.lengthOf(0);
    });

    it(`should validate worker agent with ${prefix} prefixed GUID with braces`, async () => {
      const agent = createValidAgent({
        worker_agents: [{ id: `${prefix}{12345678-1234-1234-1234-123456789012}` }],
      });
      const result = await validate(agent);
      expect(result.errors).to.have.lengthOf(0);
    });
  }

  it("should validate agent with disclaimer", async () => {
    const agent = createValidAgent({
      disclaimer: { text: "This agent is for testing purposes only." },
    });
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });
});

// ============================================
// VALID CAPABILITY TESTS
// ============================================

describe("Copilot Validation - Valid Capabilities", () => {
  it("should validate WebSearch without sites", async () => {
    const agent = createValidAgentWithCapabilities([{ name: "WebSearch" }]);
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate WebSearch with sites", async () => {
    const agent = createValidAgentWithCapabilities([
      { name: "WebSearch", sites: [{ url: "https://example.com" }] },
    ]);
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate WebSearch with 4 sites (max)", async () => {
    const agent = createValidAgentWithCapabilities([
      {
        name: "WebSearch",
        sites: [
          { url: "https://site1.com" },
          { url: "https://site2.com" },
          { url: "https://site3.com" },
          { url: "https://site4.com" },
        ],
      },
    ]);
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate GraphicArt capability", async () => {
    const agent = createValidAgentWithCapabilities([{ name: "GraphicArt" }]);
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate CodeInterpreter capability", async () => {
    const agent = createValidAgentWithCapabilities([{ name: "CodeInterpreter" }]);
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate Email capability", async () => {
    const agent = createValidAgentWithCapabilities([{ name: "Email" }]);
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });

  it("should validate OneDriveAndSharePoint capability", async () => {
    const agent = createValidAgentWithCapabilities([{ name: "OneDriveAndSharePoint" }]);
    const result = await validate(agent);
    expect(result.errors).to.have.lengthOf(0);
  });
});

// ============================================
// INVALID AGENT TESTS
// ============================================

describe("Copilot Validation - Invalid Agents", () => {
  it("should error on missing name", async () => {
    const agent = createValidAgent();
    delete agent.name;
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it("should error on missing description", async () => {
    const agent = createValidAgent();
    delete agent.description;
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it("should error on missing version", async () => {
    const agent = createValidAgent();
    delete agent.version;
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it("should error on name too long (> 100 chars)", async () => {
    const result = await validate(createValidAgent({ name: "x".repeat(101) }));
    expect(result.errors.length).to.be.greaterThan(0);
    expect(errorCodes(result)).to.include("M365-004");
  });

  it("should error on description too long (> 1000 chars)", async () => {
    const result = await validate(createValidAgent({ description: "x".repeat(1001) }));
    expect(result.errors.length).to.be.greaterThan(0);
    expect(errorCodes(result)).to.include("M365-004");
  });

  it("should error on too many conversation starters (> 12)", async () => {
    const result = await validate(createValidAgentWithConversationStarters(13));
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it("should error on too many actions (> 10)", async () => {
    const result = await validate(createValidAgentWithActions(11));
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it("should error on invalid worker agent GUID", async () => {
    const agent = createValidAgent({
      worker_agents: [{ id: "not-a-guid" }],
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
    expect(errorCodes(result)).to.include("M365-002");
  });

  it("should error on WebSearch with > 4 sites", async () => {
    const agent = createValidAgent({
      capabilities: [
        {
          name: "WebSearch",
          sites: [
            { url: "https://site1.com" },
            { url: "https://site2.com" },
            { url: "https://site3.com" },
            { url: "https://site4.com" },
            { url: "https://site5.com" },
          ],
        },
      ],
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
  });

  it("should error on WebSearch with invalid URL", async () => {
    const agent = createValidAgent({
      capabilities: [{ name: "WebSearch", sites: [{ url: "not-a-url" }] }],
    });
    const result = await validate(agent);
    expect(result.errors.length).to.be.greaterThan(0);
    expect(errorCodes(result)).to.include("M365-002");
  });

  it("should error on duplicate capabilities", async () => {
    const agent = createValidAgent({
      capabilities: [{ name: "WebSearch" }, { name: "WebSearch" }],
    });
    const result = await validate(agent);
    const allCodes = [
      ...errorCodes(result),
      ...result.warnings.map((w: { code: string }) => w.code),
    ];
    expect(allCodes).to.include("M365-006");
  });
});

// ============================================
// BRIDGE FUNCTION TESTS
// ============================================

describe("Copilot Validation - Bridge Functions", () => {
  it("validateCopilotManifest should return errors and warnings arrays", async () => {
    const agent = createValidAgent();
    const result = await validateCopilotManifest(JSON.stringify(agent));
    expect(result).to.have.property("errors").that.is.an("array");
    expect(result).to.have.property("warnings").that.is.an("array");
  });

  it("getValidationRules should return rules for both schemas", () => {
    const rules = CopilotValidation.getValidationRules();
    expect(rules).to.have.property("declarativeAgent");
    expect(rules).to.have.property("apiPlugin");
    expect(rules.declarativeAgent.rules).to.be.an("array");
    expect(rules.declarativeAgent.rules.length).to.be.greaterThan(0);
    const first = rules.declarativeAgent.rules[0];
    expect(first).to.have.property("id");
    expect(first).to.have.property("code");
    expect(first).to.have.property("description");
  });

  it("parseJson should detect declarative agent document type", () => {
    const agent = createValidAgent();
    const result = CopilotValidation.parseJson(JSON.stringify(agent));
    expect(result).to.have.property("documentType");
    expect(result.documentType).to.equal("declarative-agent");
  });
});
