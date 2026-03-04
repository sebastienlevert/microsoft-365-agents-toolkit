// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Inputs, ok, Platform } from "@microsoft/teamsfx-api";
import { assert } from "chai";
import fs from "fs-extra";
import "mocha";
import * as os from "os";
import * as path from "path";
import AdmZip from "adm-zip";
import { createContext, setTools } from "../../../src/common/globalVars";
import { importDeclarativeAgent } from "../../../src/component/generator/declarativeAgent/importGenerator";
import { MockTools } from "../../core/utils";

describe("importDeclarativeAgent", () => {
  setTools(new MockTools());
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "import-test-"));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  function createTestZip(options?: {
    agentName?: string;
    agentDescription?: string;
    instructions?: string;
    capabilities?: unknown[];
    conversationStarters?: unknown[];
  }): string {
    const zip = new AdmZip();

    const agentName = options?.agentName ?? "Test Agent";
    const agentDescription = options?.agentDescription ?? "A test agent";
    const instructions = options?.instructions ?? "You are a helpful assistant.";

    const declarativeAgent: Record<string, unknown> = {
      $schema:
        "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.5/schema.json",
      version: "v1.5",
      name: agentName,
      description: agentDescription,
      instructions,
    };

    if (options?.capabilities) {
      declarativeAgent.capabilities = options.capabilities;
    }
    if (options?.conversationStarters) {
      declarativeAgent.conversation_starters = options.conversationStarters;
    }

    const teamsManifest = {
      $schema:
        "https://developer.microsoft.com/en-us/json-schemas/teams/v1.25/MicrosoftTeams.schema.json",
      manifestVersion: "1.25",
      version: "1.0.0",
      id: "test-id",
      developer: {
        name: "Test Developer",
        websiteUrl: "https://example.com",
        privacyUrl: "https://example.com/privacy",
        termsOfUseUrl: "https://example.com/terms",
      },
      name: { short: "Test App", full: "Test Application" },
      description: { short: "Short desc", full: "Full description" },
      icons: { color: "color.png", outline: "outline.png" },
      copilotAgents: {
        declarativeAgents: [{ id: "declarativeAgent", file: "declarativeAgent.json" }],
      },
    };

    zip.addFile("manifest.json", Buffer.from(JSON.stringify(teamsManifest, null, 2)));
    zip.addFile("declarativeAgent.json", Buffer.from(JSON.stringify(declarativeAgent, null, 2)));
    // Add a dummy icon
    zip.addFile("color.png", Buffer.from("fake-png-data"));

    const zipPath = path.join(tmpDir, "test-agent.zip");
    zip.writeZip(zipPath);
    return zipPath;
  }

  it("should fail with missing zip file path", async () => {
    const context = createContext();
    const inputs: Inputs = { platform: Platform.CLI };

    const result = await importDeclarativeAgent(context, inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.include(result.error.name, "MissingZipFilePath");
    }
  });

  it("should fail with non-existent zip file", async () => {
    const context = createContext();
    const inputs: Inputs = {
      platform: Platform.CLI,
      "zip-file-path": "/non/existent/file.zip",
    };

    const result = await importDeclarativeAgent(context, inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.include(result.error.name, "ZipFileNotFound");
    }
  });

  it("should fail with zip missing manifest.json", async () => {
    const zip = new AdmZip();
    zip.addFile("readme.txt", Buffer.from("hello"));
    const zipPath = path.join(tmpDir, "no-manifest.zip");
    zip.writeZip(zipPath);

    const context = createContext();
    const inputs: Inputs = {
      platform: Platform.CLI,
      "zip-file-path": zipPath,
      folder: tmpDir,
      "app-name": "test",
    };

    const result = await importDeclarativeAgent(context, inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.include(result.error.name, "NoTeamsManifest");
    }
  });

  it("should fail with manifest missing declarativeAgent reference", async () => {
    const zip = new AdmZip();
    zip.addFile("manifest.json", Buffer.from(JSON.stringify({ manifestVersion: "1.25" })));
    const zipPath = path.join(tmpDir, "no-da-ref.zip");
    zip.writeZip(zipPath);

    const context = createContext();
    const inputs: Inputs = {
      platform: Platform.CLI,
      "zip-file-path": zipPath,
      folder: tmpDir,
      "app-name": "test",
    };

    const result = await importDeclarativeAgent(context, inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.include(result.error.name, "NoDeclarativeAgent");
    }
  });
});
