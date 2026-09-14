// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLIContext, ok } from "@microsoft/teamsfx-api";
import { cloneDeep } from "lodash";
import fs from "fs-extra";
import path from "path";
import https from "https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AxiosMockAdapter from "../../../../fx-core/node_modules/axios-mock-adapter";
const {
  titleImportTransport,
}: typeof import("../../../../fx-core/build/component/agentMigration/titleTransport") = require("@microsoft/teamsfx-core/build/component/agentMigration/titleTransport");
import {
  syntheticLargeIcon,
  syntheticLaunchInfo,
  syntheticPng,
  syntheticSmallIcon,
  syntheticTitle,
} from "../../../../fx-core/tests/component/agentMigration/titleFixtures";
import { engine } from "../../../src/commands/engine";
import { rootCommand } from "../../../src/commands/models/root";
import { titleAgentCliDeps } from "../../../src/commands/models/agentPackage";
import M365TokenProviderWrapper from "../../../src/commonlib/M365TokenProviderWrapper";
import { createWorkspace } from "./agentPackage.fixtures";

describe("TTI-10 SCN-AGENT-TITLE-02: native Title-ID CLI", () => {
  let workspace: string;
  let stdout: string[];
  let http: AxiosMockAdapter;
  let oldExit: typeof process.exitCode;
  beforeEach(async () => {
    workspace = await createWorkspace();
    stdout = [];
    oldExit = process.exitCode;
    vi.spyOn(process.stdout, "write").mockImplementation((chunk, encoding, callback) => {
      stdout.push(String(chunk));
      (typeof encoding === "function" ? encoding : callback)?.();
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((_chunk, encoding, callback) => {
      (typeof encoding === "function" ? encoding : callback)?.();
      return true;
    });
    vi.spyOn(titleAgentCliDeps, "getStatus").mockResolvedValue(
      ok({ status: "SignedIn", token: "synthetic-cli-token" })
    );
    vi.spyOn(M365TokenProviderWrapper, "getProvider").mockImplementation(() => {
      throw new Error("Provider switching forbidden");
    });
    const transport = titleImportTransport.createClient();
    vi.spyOn(titleImportTransport, "createClient").mockReturnValue(transport);
    vi.spyOn(https, "request").mockImplementation(() => {
      throw new Error("Live HTTP forbidden in synthetic CLI tests");
    });
    http = new AxiosMockAdapter(transport);
    const base = "https://titles.prod.mos.microsoft.com";
    http
      .onGet(`${base}/config/v1/environment`)
      .reply(200, Buffer.from(JSON.stringify({ titlesServiceUrl: base })));
    http
      .onGet(`${base}/catalog/v1/users/titles/${syntheticTitle}/launchInfo`)
      .reply(200, Buffer.from(JSON.stringify(syntheticLaunchInfo())));
    http.onGet(syntheticLargeIcon).reply(200, syntheticPng(192));
    http.onGet(syntheticSmallIcon).reply(200, syntheticPng(300));
  });
  afterEach(async () => {
    expect(M365TokenProviderWrapper.getProvider).not.toHaveBeenCalled();
    http.restore();
    vi.restoreAllMocks();
    process.exitCode = oldExit;
    await fs.remove(workspace);
  });
  async function run(args: string[]) {
    const root = cloneDeep(rootCommand);
    const found = engine.findCommand(root, args);
    const context: CLIContext = {
      command: found.cmd,
      optionValues: {},
      globalOptionValues: {},
      argumentValues: [],
      telemetryProperties: {},
    };
    const result = await engine.execute(context, root, found.remainingArgs);
    await engine.processResult(context, result.isErr() ? result.error : undefined);
    return result;
  }
  it("emits a real native v2 report with --title-id and the unchanged JSON envelope", async () => {
    const result = await run([
      "import",
      "agent",
      "--title-id",
      syntheticTitle,
      "--output",
      path.join(workspace, "clone"),
      "--format",
      "json",
      "-i",
      "false",
    ]);
    if (result.isErr()) throw result.error;
    expect(result.isOk()).toBe(true);
    const envelope = JSON.parse(stdout.join(""));
    expect(envelope.success).toBe(true);
    expect(envelope.result.reportVersion).toBe(2);
    expect(envelope.result.source).toMatchObject({ kind: "title-id", titleId: syntheticTitle });
    expect(titleAgentCliDeps.getStatus).toHaveBeenCalledWith({
      scopes: ["https://titles.prod.mos.microsoft.com/.default"],
      showDialog: false,
    });
  });
  it("rejects both source options before token or transport calls", async () => {
    const result = await run([
      "import",
      "agent",
      "--source",
      "source.zip",
      "--title-id",
      syntheticTitle,
      "--format",
      "json",
    ]);
    expect(result.isErr()).toBe(true);
    expect(titleAgentCliDeps.getStatus).not.toHaveBeenCalled();
    expect(http.history.get).toHaveLength(0);
  });
  it("returns authentication-required exit 2 without initiating login", async () => {
    vi.mocked(titleAgentCliDeps.getStatus).mockResolvedValue(ok({ status: "SignedOut" }));
    const result = await run([
      "import",
      "agent",
      "--title-id",
      syntheticTitle,
      "--output",
      path.join(workspace, "clone"),
      "--format",
      "json",
    ]);
    expect(result.isErr()).toBe(true);
    expect(JSON.parse(stdout.join("")).error.name).toBe("AgentTitleAuthenticationRequired");
    expect(process.exitCode).toBe(2);
    expect(http.history.get).toHaveLength(0);
  });
  it("documents exclusive source selection and supports Title-ID dry runs", async () => {
    expect((await run(["import", "agent", "--help"])).isOk()).toBe(true);
    expect(stdout.join("")).toContain("--title-id");
    stdout.length = 0;
    const output = path.join(workspace, "preview");
    const result = await run([
      "import",
      "agent",
      "--title-id",
      syntheticTitle,
      "--output",
      output,
      "--dry-run",
      "--format",
      "json",
    ]);
    if (result.isErr()) throw result.error;
    expect(JSON.parse(stdout.join("")).result.operationMode).toBe("dry-run");
    expect(await fs.pathExists(output)).toBe(false);
  });
});
