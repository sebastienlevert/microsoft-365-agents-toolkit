// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from "axios";
import AxiosMockAdapter from "axios-mock-adapter";
import AdmZip from "adm-zip";
import Ajv from "ajv";
import fs from "fs-extra";
import os from "os";
import path from "path";
import https from "https";
import {
  AgentTitleImportReport,
  agentTitleImportReportSchema,
  err,
  FxError,
  ManifestType,
  ok,
  Platform,
  resolveManifest,
  Result,
  UserError,
} from "@microsoft/teamsfx-api";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FxCoreClient } from "../../../src/core/FxCoreClient";
import {
  titleImportTransport,
  titleImportLimits,
} from "../../../src/component/agentMigration/titleTransport";
import {
  artifactDigest,
  JsonObject,
  object,
  objects,
} from "../../../src/component/agentMigration/model";
import { agentMigrationIo } from "../../../src/component/agentMigration/io";
import { readDirectory } from "../../../src/component/agentMigration/intake";
import { MockTools } from "../../core/utils";
import * as accountUtils from "../../../src/common/accountUtils";
import { ResourceServiceType, serviceEndpoints } from "../../../src/common/constants";
import { snapshot } from "./fixtures";
import {
  syntheticInstructions,
  syntheticLargeIcon,
  syntheticLaunchInfo,
  syntheticPng,
  syntheticSmallIcon,
  syntheticTitle,
} from "./titleFixtures";

function report(result: Result<AgentTitleImportReport, FxError>): AgentTitleImportReport {
  if (result.isErr()) throw result.error;
  return result.value;
}

describe("native Title-ID snapshot import", () => {
  const endpoint = "https://titles.prod.mos.microsoft.com";
  let root: string;
  let output: string;
  let tools: MockTools;
  let client: FxCoreClient;
  let http: AxiosMockAdapter;
  let launchInfo: JsonObject;
  let large: Buffer;
  let small: Buffer;
  const bootstrap = `${endpoint}/config/v1/environment`;
  const launchUrl = `${endpoint}/catalog/v1/users/titles/${syntheticTitle}/launchInfo`;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "atk-title-test-"));
    output = path.join(root, "clone");
    tools = new MockTools();
    client = new FxCoreClient(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getStatus").mockResolvedValue(
      ok({ status: "SignedIn", token: "synthetic-mos-token" })
    );
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockImplementation(() => {
      throw new Error("Interactive token acquisition forbidden");
    });
    const transport = axios.create();
    http = new AxiosMockAdapter(transport);
    vi.spyOn(titleImportTransport, "createClient").mockReturnValue(transport);
    vi.spyOn(https, "request").mockImplementation(() => {
      throw new Error("Live HTTP forbidden in synthetic Title-ID tests");
    });
    launchInfo = syntheticLaunchInfo();
    large = syntheticPng(192);
    small = syntheticPng(300);
    http.onGet(bootstrap).reply(200, Buffer.from(JSON.stringify({ titlesServiceUrl: endpoint })));
    http.onGet(launchUrl).reply(() => [200, Buffer.from(JSON.stringify(launchInfo))]);
    http
      .onGet(syntheticLargeIcon)
      .reply(() => [200, large, { "Content-Type": "image/png;base64" }]);
    http.onGet(syntheticSmallIcon).reply(() => [200, small]);
  });
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    http.restore();
    await fs.remove(root);
  });
  async function imported(dryRun = false): Promise<AgentTitleImportReport> {
    return report(
      await client.importAgentFromTitle({ titleId: syntheticTitle, outputPath: output, dryRun })
    );
  }
  const definition = () => objects(object(launchInfo.elementDefinitions)?.declarativeCopilots)[0];

  it("TTI-01 TTI-02 TTI-03: clones the returned snapshot with exact behavior and honest generated metadata", async () => {
    const original = JSON.stringify(launchInfo);
    const result = await imported();
    expect(result.reportVersion).toBe(2);
    expect(result.source).toMatchObject({ kind: "title-id", titleId: syntheticTitle });
    expect(new Ajv().compile(agentTitleImportReportSchema)(result)).toBe(true);
    const manifest = await fs.readJSON(path.join(output, "appPackage", "manifest.json"));
    const agentFile = path.join(
      output,
      "appPackage",
      manifest.copilotAgents.declarativeAgents[0].file
    );
    const agent = await fs.readJSON(agentFile);
    expect(agent.id).toBe("declarativeAgent");
    expect(agent.conversation_starters).toEqual(definition().conversation_starters);
    expect(agent.capabilities).toEqual(definition().capabilities);
    expect(agent.version).toBe("v1.0");
    expect(agent.$schema).toBe(
      "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.0/schema.json"
    );
    const resolved = await resolveManifest(JSON.stringify(agent), {
      fromPath: agentFile,
      envs: {},
      manifestType: ManifestType.DeclarativeCopilotManifest,
    });
    expect(JSON.parse(resolved.content).instructions).toBe(syntheticInstructions);
    expect(await fs.readFile(path.join(output, "appPackage", manifest.icons.color))).toEqual(large);
    const outline = await fs.readFile(path.join(output, "appPackage", manifest.icons.outline));
    expect(outline).not.toEqual(small);
    expect(outline.readUInt32BE(16)).toBe(32);
    expect(manifest.name.short).toBe(launchInfo.name);
    expect(manifest.description.short).toBe(launchInfo.shortDescription);
    expect(manifest.developer.name).toBe(launchInfo.developerName);
    expect(manifest.version).toBe(launchInfo.version);
    expect(manifest.validDomains).toEqual([]);
    expect(manifest.id).toBe("${{TEAMS_APP_ID}}");
    expect(result.identity).toMatchObject({
      policy: "new",
      provisionedByOperation: false,
      agentId: "declarativeAgent",
    });
    expect(result.identity.sourceAppId).toBeUndefined();
    expect(result.identity.sourceAgentId).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toContain("GeneratedContainerMetadata");
    expect(result.diagnostics.map((item) => item.code)).toContain("GeneratedOutlineIcon");
    expect(result.configuration.requirements.length).toBeGreaterThan(0);
    expect(result.files.find((item) => item.path === "appPackage/outline.png")?.action).toBe(
      "created"
    );
    expect(JSON.stringify(launchInfo)).toBe(original);
    expect(tools.tokenProvider.m365TokenProvider.getAccessToken).not.toHaveBeenCalled();
    expect(tools.tokenProvider.m365TokenProvider.getStatus).toHaveBeenCalledWith({
      scopes: [`${endpoint}/.default`],
      showDialog: false,
    });
  });

  it("TTI-02: whole-field file-like prose remains literal rather than a source include", async () => {
    definition().instructions = "$[file('missing.txt')]";
    await imported();
    const file = path.join(output, "appPackage", "declarativeAgent.json");
    const resolved = await resolveManifest(await fs.readFile(file, "utf8"), {
      fromPath: file,
      envs: {},
      manifestType: ManifestType.DeclarativeCopilotManifest,
    });
    expect(JSON.parse(resolved.content).instructions).toBe("$[file('missing.txt')]");
  });

  it("TTI-02: preserves CRLF and modern metadata when supported by the selected schema", async () => {
    const agent = definition();
    agent.version = "v1.8";
    agent.$schema = "https://aka.ms/json-schemas/copilot/declarative-agent/v1.8/schema.json";
    agent.instructions = syntheticInstructions.replace(/\n/g, "\r\n");
    agent.disclaimer = { text: "Synthetic disclaimer" };
    agent.sensitivity_label = { id: "synthetic-label" };
    agent.worker_agents = [{ id: "synthetic-external-worker" }];
    agent.user_overrides = [];
    agent.behavior_overrides = { special_instructions: { discourage_model_knowledge: false } };
    await imported();
    const file = path.join(output, "appPackage", "declarativeAgent.json");
    const resolved = JSON.parse(
      (
        await resolveManifest(await fs.readFile(file, "utf8"), {
          fromPath: file,
          envs: {},
          manifestType: ManifestType.DeclarativeCopilotManifest,
        })
      ).content
    );
    for (const key of [
      "id",
      "instructions",
      "disclaimer",
      "sensitivity_label",
      "worker_agents",
      "user_overrides",
      "behavior_overrides",
    ]) {
      expect(resolved[key]).toEqual(agent[key]);
    }
  });

  it("TTI-02 TTI-09: preserves the observed v1.0 launch-info CRLF dialect through edits and packaging", async () => {
    const original = syntheticInstructions.replace(/\n/g, "\r\n");
    definition().instructions = original;
    const importedReport = await imported();
    expect(importedReport.diagnostics.map((item) => item.code)).toContain(
      "LaunchInfoSchemaCompatibility"
    );
    const sourcePath = path.join(output, "appPackage", "declarativeAgent.json");
    expect((await fs.readJSON(sourcePath)).version).toBe("v1.0");
    const resolved = await resolveManifest(await fs.readFile(sourcePath, "utf8"), {
      fromPath: sourcePath,
      envs: {},
      manifestType: ManifestType.DeclarativeCopilotManifest,
    });
    expect(JSON.parse(resolved.content).instructions).toBe(original);
    const changes = path.join(root, "crlf-changes.json");
    await fs.writeJSON(changes, { schemaVersion: 1, agentId: "declarativeAgent", operations: [] });
    const noop = await client.applyAgentEdits({ projectPath: output, changesFile: changes });
    if (noop.isErr()) throw noop.error;
    expect(noop.value.operationMode).toBe("no-op");
    await fs.appendFile(
      path.join(output, "env", ".env.dev"),
      "\nTEAMS_APP_ID=00000000-0000-4000-8000-000000000001\n"
    );
    const result = await client.package({
      projectPath: output,
      platform: Platform.CLI,
      env: "dev",
    });
    if (result.isErr()) throw result.error;
    const zip = new AdmZip(await fs.readFile(result.value.packagePath));
    expect(JSON.parse(zip.readAsText("declarativeAgent.json")).instructions).toBe(original);
    const approved = "Approved synthetic edit\r\n${{still_literal}}";
    await fs.writeFile(path.join(root, "approved-crlf.txt"), approved);
    await fs.writeJSON(changes, {
      schemaVersion: 1,
      agentId: "declarativeAgent",
      operations: [{ kind: "replaceInstructions", sourceFile: "approved-crlf.txt" }],
    });
    const edited = await client.applyAgentEdits({ projectPath: output, changesFile: changes });
    if (edited.isErr()) throw edited.error;
    expect(edited.value.reportVersion).toBe(1);
    expect(edited.value.operationMode).toBe("edited");
    const repackaged = await client.package({
      projectPath: output,
      platform: Platform.CLI,
      env: "dev",
    });
    if (repackaged.isErr()) throw repackaged.error;
    expect(
      JSON.parse(
        new AdmZip(await fs.readFile(repackaged.value.packagePath)).readAsText(
          "declarativeAgent.json"
        )
      ).instructions
    ).toBe(approved);
    const withoutProvenance = await client.importAgentPackage({
      sourcePath: path.join(output, "appPackage"),
      outputPath: path.join(root, "local-unchanged"),
    });
    expect(withoutProvenance.isErr()).toBe(true);
    if (withoutProvenance.isErr())
      expect(withoutProvenance.error.name).toBe("AgentPackageSchemaInvalid");
  });

  it.each([
    "",
    " ",
    "../escape",
    "x/y",
    "x\\y",
    "https://host",
    "x?query",
    "x#hash",
    "x%2fy",
    "x@host",
    "x\n",
    "a.b.c",
  ])("TTI-04: rejects invalid title before auth: %j", async (titleId) => {
    const result = await client.importAgentFromTitle({ titleId, outputPath: output });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("AgentTitleSourceInvalid");
    expect(tools.tokenProvider.m365TokenProvider.getStatus).not.toHaveBeenCalled();
    expect(http.history.get).toHaveLength(0);
  });

  it("TTI-04: checks destination and link safety before authentication", async () => {
    await fs.ensureDir(output);
    const exists = await client.importAgentFromTitle({
      titleId: syntheticTitle,
      outputPath: output,
    });
    expect(exists.isErr()).toBe(true);
    if (exists.isErr()) expect(exists.error.name).toBe("AgentPackageDestinationExists");
    await fs.symlink(output, path.join(root, "linked"), "junction");
    expect(
      (
        await client.importAgentFromTitle({
          titleId: syntheticTitle,
          outputPath: path.join(root, "linked", "child"),
        })
      ).isErr()
    ).toBe(true);
    expect(tools.tokenProvider.m365TokenProvider.getStatus).not.toHaveBeenCalled();
  });

  it("TTI-04: normalizes one logical suffix only after matching the returned DA id", async () => {
    const result = report(
      await client.importAgentFromTitle({
        titleId: ` ${syntheticTitle}.declarativeAgent `,
        outputPath: output,
      })
    );
    expect(result.source.titleId).toBe(syntheticTitle);
    const failed = await client.importAgentFromTitle({
      titleId: `${syntheticTitle}.different`,
      outputPath: path.join(root, "mismatch"),
    });
    expect(failed.isErr()).toBe(true);
    if (failed.isErr()) expect(failed.error.name).toBe("AgentTitleSourceInvalid");
  });

  it.each(["signed-out", "no-token", "provider-error"])(
    "TTI-05: %s does not trigger interactive auth",
    async (mode) => {
      vi.mocked(tools.tokenProvider.m365TokenProvider.getStatus).mockResolvedValue(
        mode === "provider-error"
          ? err(new UserError("test", "SilentFailure", "synthetic"))
          : ok({ status: mode === "signed-out" ? "SignedOut" : "SignedIn" })
      );
      const result = await client.importAgentFromTitle({
        titleId: syntheticTitle,
        outputPath: output,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.name).toBe("AgentTitleAuthenticationRequired");
      expect(tools.tokenProvider.m365TokenProvider.getAccessToken).not.toHaveBeenCalled();
      expect(http.history.get).toHaveLength(0);
    }
  );

  it("TTI-05: hung token status is bounded and caller cancellation is distinct", async () => {
    vi.mocked(tools.tokenProvider.m365TokenProvider.getStatus).mockReturnValue(
      new Promise(() => {})
    );
    const controller = new AbortController();
    const aborted = client.importAgentFromTitle(
      { titleId: syntheticTitle, outputPath: output },
      { signal: controller.signal }
    );
    controller.abort();
    const cancellation = await aborted;
    expect(cancellation.isErr()).toBe(true);
    if (cancellation.isErr()) expect(cancellation.error.name).toBe("UserCancel");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const timed = client.importAgentFromTitle({ titleId: syntheticTitle, outputPath: output });
    await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
    await vi.advanceTimersByTimeAsync(titleImportLimits.totalTimeoutMs + 1);
    const expired = await timed;
    expect(expired.isErr()).toBe(true);
    if (expired.isErr()) expect(expired.error.name).toBe("AgentTitleRequestFailed");
  });

  it("TTI-06: anonymous asset requests never carry the MOS bearer and all hops forbid redirects", async () => {
    await imported();
    expect(http.history.get).toHaveLength(4);
    for (const request of http.history.get) {
      expect(request.maxRedirects).toBe(0);
      expect(request.timeout).toBe(titleImportLimits.requestTimeoutMs);
      expect(request.signal).toBeDefined();
      const token = request.headers?.Authorization;
      expect(token).toBe(
        request.url?.startsWith(endpoint) ? "Bearer synthetic-mos-token" : undefined
      );
    }
  });

  it("TTI-06: accepts an extensionless approved CDN path based on PNG bytes", async () => {
    const uri = `https://res.cdn.office.net/synthetic/${"A".repeat(64)}`;
    launchInfo.iconLarge = { uri };
    http.onGet(uri).reply(200, large);
    await imported();
    expect(await fs.readFile(path.join(output, "appPackage", "color.png"))).toEqual(large);
  });

  it("TTI-06: ignores inherited HTTP authentication and account headers on its isolated client", async () => {
    const transport = titleImportTransport.createClient();
    transport.defaults.headers.common.Authorization = "Bearer forbidden-default";
    transport.defaults.headers.common.Cookie = "forbidden-cookie";
    transport.defaults.headers.common["X-Account"] = "forbidden-account";
    transport.defaults.auth = { username: "forbidden-user", password: "forbidden-password" };
    await imported();
    for (const request of http.history.get) {
      expect(request.auth).toBeUndefined();
      expect(request.headers?.Cookie).toBeUndefined();
      expect(request.headers?.["X-Account"]).toBeUndefined();
      expect(request.headers?.Authorization).toBe(
        request.url?.startsWith(endpoint) ? "Bearer synthetic-mos-token" : undefined
      );
    }
  });

  it.each([bootstrap, launchUrl, syntheticLargeIcon])(
    "TTI-05 TTI-06: timeout on %s remains a request failure",
    async (url) => {
      http.onGet(url).timeout();
      const result = await client.importAgentFromTitle({
        titleId: syntheticTitle,
        outputPath: output,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.name).toBe("AgentTitleRequestFailed");
      expect(await fs.readdir(root)).toEqual([]);
    }
  );

  it.each([
    "bootstrap-limit",
    "snapshot-limit",
    "declared-icon-limit",
    "malformed-json",
    "deep-json",
  ])("TTI-06 TTI-07: rejects bounded or malformed %s", async (mode) => {
    if (mode === "bootstrap-limit")
      http.onGet(bootstrap).reply(200, Buffer.alloc(titleImportLimits.bootstrapBytes + 1));
    if (mode === "snapshot-limit")
      http.onGet(launchUrl).reply(200, Buffer.alloc(titleImportLimits.snapshotBytes + 1));
    if (mode === "declared-icon-limit")
      http
        .onGet(syntheticLargeIcon)
        .reply(200, large, { "Content-Length": titleImportLimits.iconBytes + 1 });
    if (mode === "malformed-json") http.onGet(launchUrl).reply(200, Buffer.from("{ malformed"));
    if (mode === "deep-json") {
      let nested: JsonObject = {};
      for (let depth = 0; depth < titleImportLimits.jsonDepth + 1; depth++)
        nested = { child: nested };
      launchInfo.additionalMetadata = nested;
    }
    expect(
      (await client.importAgentFromTitle({ titleId: syntheticTitle, outputPath: output })).isErr()
    ).toBe(true);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it("TTI-08: cancellation after acquisition rolls back staging before exposing a project", async () => {
    const controller = new AbortController();
    vi.spyOn(agentMigrationIo, "beforeCommit").mockImplementationOnce(async () => {
      controller.abort();
    });
    const result = await client.importAgentFromTitle(
      { titleId: syntheticTitle, outputPath: output },
      { signal: controller.signal }
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("UserCancel");
    expect(await fs.readdir(root)).toEqual([]);
  });

  it("TTI-09: fingerprints ordered snapshot content and all downloaded bytes, not the generated scaffold", async () => {
    const first = await imported(true);
    launchInfo = Object.fromEntries(Object.entries(launchInfo).reverse());
    const reordered = await imported(true);
    expect(reordered.source.digest).toBe(first.source.digest);
    launchInfo.ingestionSource = "synthetic-updated";
    const changed = await imported(true);
    expect(changed.source.digest).not.toBe(first.source.digest);
    small = syntheticPng(301);
    const changedAsset = await imported(true);
    expect(changedAsset.source.digest).not.toBe(changed.source.digest);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it.each([
    "http://res.cdn.office.net/icon.png",
    "https://127.0.0.1/icon.png",
    "https://res.cdn.office.net.evil.example/icon.png",
    "https://user:password@res.cdn.office.net/icon.png",
    "https://res.cdn.office.net/icon.png?token=secret",
    "data:image/png;base64,AAAA",
  ])("TTI-06: rejects unapproved or credentialed asset URI %s", async (uri) => {
    launchInfo.iconLarge = { uri };
    const result = await client.importAgentFromTitle({
      titleId: syntheticTitle,
      outputPath: output,
    });
    expect(result.isErr()).toBe(true);
    expect(http.history.get.every((request) => request.url?.startsWith(endpoint))).toBe(true);
    expect(await fs.pathExists(output)).toBe(false);
  });

  it.each([
    "http://titles.prod.mos.microsoft.com",
    "https://evil.example",
    "https://titles.prod.mos.microsoft.com?token=secret",
    "https://titles.msit.mos.microsoft.com.evil.example",
    "https://titles.gccm.mos.microsoft.com",
    "http://titles.msit.mos.microsoft.com",
    "https://user:password@titles.msit.mos.microsoft.com",
    "https://titles.msit.mos.microsoft.com?token=secret",
    "https://titles.msit.mos.microsoft.com#fragment",
    "https://titles.msit.mos.microsoft.com/unapproved-path",
  ])("TTI-06: refuses unapproved bootstrap endpoint %s", async (titlesServiceUrl) => {
    http.onGet(bootstrap).reply(200, Buffer.from(JSON.stringify({ titlesServiceUrl })));
    expect(
      (await client.importAgentFromTitle({ titleId: syntheticTitle, outputPath: output })).isErr()
    ).toBe(true);
    expect(http.history.get).toHaveLength(1);
  });

  it("TTI-06A: public bootstrap discovers exact MSIT while retaining the configured MOS audience", async () => {
    const msit = "https://titles.msit.mos.microsoft.com";
    http.onGet(bootstrap).reply(200, Buffer.from(JSON.stringify({ titlesServiceUrl: msit })));
    http
      .onGet(`${msit}/catalog/v1/users/titles/${syntheticTitle}/launchInfo`)
      .reply(200, Buffer.from(JSON.stringify(launchInfo)));
    const result = await imported();
    expect(result.reportVersion).toBe(2);
    expect(http.history.get.map((request) => request.url)).toEqual([
      bootstrap,
      `${msit}/catalog/v1/users/titles/${syntheticTitle}/launchInfo`,
      syntheticLargeIcon,
      syntheticSmallIcon,
    ]);
    expect(tools.tokenProvider.m365TokenProvider.getStatus).toHaveBeenCalledExactlyOnceWith({
      scopes: [`${endpoint}/.default`],
      showDialog: false,
    });
    expect(http.history.get[1].headers?.Authorization).toBe("Bearer synthetic-mos-token");
    expect(http.history.get[2].headers?.Authorization).toBeUndefined();
    expect(await fs.readFile(path.join(output, "appPackage", "color.png"))).toEqual(large);
  });

  it.each([
    accountUtils.SovereignCloudEnvironment.GCCM,
    accountUtils.SovereignCloudEnvironment.GCCH,
    accountUtils.SovereignCloudEnvironment.DOD,
  ])("TTI-06A: %s cannot discover the public MSIT title service", async (cloud) => {
    vi.spyOn(accountUtils, "getSovereignCloudEnvironment").mockReturnValue(cloud);
    const configured = serviceEndpoints[cloud][ResourceServiceType.MOS3];
    const bootstrapUrl = `${configured}/config/v1/environment`;
    http.onGet(bootstrapUrl).reply(
      200,
      Buffer.from(
        JSON.stringify({
          titlesServiceUrl: "https://titles.msit.mos.microsoft.com",
        })
      )
    );
    const result = await client.importAgentFromTitle({
      titleId: syntheticTitle,
      outputPath: output,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("AgentTitleSourceUnsupported");
    expect(http.history.get.map((request) => request.url)).toEqual([bootstrapUrl]);
    expect(tools.tokenProvider.m365TokenProvider.getStatus).toHaveBeenCalledWith({
      scopes: [`${configured}/.default`],
      showDialog: false,
    });
  });

  it("TTI-06A: an approved discovered origin still cannot redirect authenticated requests", async () => {
    const msit = "https://titles.msit.mos.microsoft.com";
    http.onGet(bootstrap).reply(200, Buffer.from(JSON.stringify({ titlesServiceUrl: msit })));
    http
      .onGet(`${msit}/catalog/v1/users/titles/${syntheticTitle}/launchInfo`)
      .reply(302, Buffer.alloc(0), { Location: launchUrl });
    const result = await client.importAgentFromTitle({
      titleId: syntheticTitle,
      outputPath: output,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("AgentTitleRequestFailed");
    expect(http.history.get).toHaveLength(2);
  });

  it.each([bootstrap, launchUrl, syntheticLargeIcon])(
    "TTI-06: refuses redirect from %s",
    async (url) => {
      http.onGet(url).reply(302, Buffer.alloc(0), { Location: "https://evil.example" });
      const result = await client.importAgentFromTitle({
        titleId: syntheticTitle,
        outputPath: output,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr())
        expect(result.error.name).toBe(
          url === syntheticLargeIcon ? "AgentTitleSourceIncomplete" : "AgentTitleRequestFailed"
        );
      expect(http.history.get.some((request) => request.url?.includes("evil.example"))).toBe(false);
    }
  );

  it.each([
    "missing",
    "multiple",
    "other-elements",
    "local-action",
    "local-worker",
    "local-knowledge",
    "unknown-schema",
  ])(
    "TTI-07: rejects unsupported or incomplete %s snapshot without reconstruction",
    async (mode) => {
      const agent = definition();
      if (mode === "missing") delete agent.instructions;
      if (mode === "multiple")
        object(launchInfo.elementDefinitions)!.declarativeCopilots = [agent, agent];
      if (mode === "other-elements")
        object(launchInfo.elementDefinitions)!.bots = [{ id: "synthetic" }];
      if (mode === "local-action") agent.actions = [{ id: "action", file: "missing-plugin.json" }];
      if (mode === "local-worker" || mode === "local-knowledge") {
        agent.version = "v1.8";
        agent.$schema =
          "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.8/schema.json";
        if (mode === "local-worker") agent.worker_agents = [{ file: "missing-worker.json" }];
        else
          agent.capabilities = [
            { name: "EmbeddedKnowledge", files: [{ file: "knowledge/missing.txt" }] },
          ];
      }
      if (mode === "unknown-schema") agent.$schema = "https://unknown.example/schema.json";
      const result = await client.importAgentFromTitle({
        titleId: syntheticTitle,
        outputPath: output,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.name).toMatch(/^AgentTitleSource/);
      expect(await fs.pathExists(output)).toBe(false);
    }
  );

  it.each(["unreachable", "malformed", "oversize", "wrong-size", "missing-advertised-small"])(
    "TTI-08: %s icon fails with no default-color fallback",
    async (mode) => {
      if (mode === "unreachable") http.onGet(syntheticLargeIcon).networkError();
      if (mode === "malformed") large = Buffer.from("not PNG");
      if (mode === "oversize") large = Buffer.alloc(titleImportLimits.iconBytes + 1);
      if (mode === "wrong-size") large = syntheticPng(300);
      if (mode === "missing-advertised-small") http.onGet(syntheticSmallIcon).reply(404);
      const result = await client.importAgentFromTitle({
        titleId: syntheticTitle,
        outputPath: output,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.name).toBe("AgentTitleSourceIncomplete");
      expect(await fs.pathExists(output)).toBe(false);
    }
  );

  it("TTI-08: dry-run and promotion failures clean up all owned state", async () => {
    expect((await imported(true)).operationMode).toBe("dry-run");
    expect(await fs.pathExists(output)).toBe(false);
    expect(await fs.readdir(root)).toEqual([]);
    vi.spyOn(agentMigrationIo, "promote").mockRejectedValueOnce(
      new Error("synthetic promotion fault")
    );
    expect(
      (await client.importAgentFromTitle({ titleId: syntheticTitle, outputPath: output })).isErr()
    ).toBe(true);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it("TTI-09 SCN-AGENT-TITLE-01: historical provenance participates in digest, then v1 edits/package preserve effective bytes", async () => {
    const result = await imported();
    const provenanceFile = path.join(output, ".atk", "import.json");
    const provenanceBytes = await fs.readFile(provenanceFile);
    const provenance = JSON.parse(provenanceBytes.toString("utf8"));
    expect(provenance.reportVersion).toBe(2);
    expect(provenance.source).toEqual(result.source);
    expect(provenance.sourceDigest).toBe(result.source.digest);
    expect(provenance.sourceAgents).toEqual({});
    expect(provenanceBytes.toString("utf8")).not.toContain(syntheticInstructions);
    expect(provenanceBytes.toString("utf8")).not.toContain("synthetic-mos-token");
    const files = await readDirectory(output, undefined, true);
    if (files.isErr()) throw files.error;
    expect(result.projectDigest).toBe(artifactDigest(files.value));
    await fs.appendFile(
      path.join(output, "env", ".env.dev"),
      "\nTEAMS_APP_ID=00000000-0000-4000-8000-000000000001\n"
    );
    const packaged = await client.package({
      projectPath: output,
      platform: Platform.CLI,
      env: "dev",
    });
    if (packaged.isErr()) throw packaged.error;
    const zip = new AdmZip(await fs.readFile(packaged.value.packagePath));
    expect(JSON.parse(zip.readAsText("declarativeAgent.json")).instructions).toBe(
      syntheticInstructions
    );
    expect(zip.getEntry("color.png")!.getData()).toEqual(large);
    await fs.outputFile(path.join(root, "approved.txt"), "Approved\n${{literal}}");
    const changes = path.join(root, "changes.json");
    await fs.writeJSON(changes, {
      schemaVersion: 1,
      agentId: "declarativeAgent",
      operations: [{ kind: "replaceInstructions", sourceFile: "approved.txt" }],
    });
    const edited = await client.applyAgentEdits({ projectPath: output, changesFile: changes });
    if (edited.isErr()) throw edited.error;
    expect(edited.value.reportVersion).toBe(1);
    const beforeNoop = await snapshot(output);
    const noop = await client.applyAgentEdits({ projectPath: output, changesFile: changes });
    if (noop.isErr()) throw noop.error;
    expect(noop.value.operationMode).toBe("no-op");
    expect(await snapshot(output)).toEqual(beforeNoop);
    expect(await fs.readFile(provenanceFile)).toEqual(provenanceBytes);
    const again = await client.package({ projectPath: output, platform: Platform.CLI, env: "dev" });
    if (again.isErr()) throw again.error;
    expect(
      JSON.parse(
        new AdmZip(await fs.readFile(again.value.packagePath)).readAsText("declarativeAgent.json")
      ).instructions
    ).toBe("Approved\n${{literal}}");
  });
});
