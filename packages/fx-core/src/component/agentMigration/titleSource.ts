// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AgentMigrationReport,
  AgentTitleImportReport,
  err,
  FxError,
  ok,
  Result,
} from "@microsoft/teamsfx-api";
import { getLocalizedString } from "../../common/localizeUtils";
import { Generator } from "../generator/generator";
import { renderTemplateFileData } from "../generator/utils";
import { migrationError, titleFailure } from "./errors";
import { loadAgentImportProfile } from "./generator";
import { inspectGraph, PackageGraph } from "./graph";
import {
  artifactDigest,
  Artifacts,
  digest,
  isObject,
  JsonObject,
  JsonValue,
  jsonBytes,
  object,
  objects,
  parseJson,
} from "./model";
import { localReference } from "./paths";
import { titleImportLimits } from "./titleTransport";
import { schemaUrl, validateDocument } from "./validation";

export interface TitlePackageSource {
  packageFiles: Artifacts;
  snapshotFiles: Artifacts;
  graph: PackageGraph;
  colorPath: string;
  outlinePath: string;
  source: AgentTitleImportReport["source"];
  schemaAlias: boolean;
  schemaCompatibility: boolean;
}

export function canonicalTitleSnapshot(snapshot: JsonObject): Result<Buffer, FxError> {
  function ordered(value: JsonValue, depth: number): Result<JsonValue, FxError> {
    if (depth > titleImportLimits.jsonDepth) return err(migrationError("AgentTitleSourceInvalid"));
    if (Array.isArray(value)) {
      const result: JsonValue[] = [];
      for (const item of value) {
        const child = ordered(item, depth + 1);
        if (child.isErr()) return err(child.error);
        result.push(child.value);
      }
      return ok(result);
    }
    if (isObject(value)) {
      const entries: Array<[string, JsonValue]> = [];
      for (const key of Object.keys(value).sort()) {
        const child = ordered(value[key], depth + 1);
        if (child.isErr()) return err(child.error);
        entries.push([key, child.value]);
      }
      return ok(Object.fromEntries(entries));
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      return err(migrationError("AgentTitleSourceInvalid"));
    }
    return ok(value);
  }
  const result = ordered(snapshot, 0);
  return result.isErr() ? err(result.error) : ok(Buffer.from(`${JSON.stringify(result.value)}\n`));
}

export async function titleDefinition(
  snapshot: JsonObject,
  logicalSuffix?: string
): Promise<Result<{ agent: JsonObject; schemaAlias: boolean }, FxError>> {
  const definitions = object(snapshot.elementDefinitions);
  const agents = definitions?.declarativeCopilots;
  if (!Array.isArray(agents) || agents.length === 0)
    return err(migrationError("AgentTitleSourceIncomplete"));
  if (agents.length !== 1 || snapshot.blockStatus === true)
    return err(
      titleFailure(
        "AgentTitleSourceUnsupported",
        snapshot.blockStatus === true ? "blocked-snapshot" : "element-groups"
      )
    );
  for (const [name, value] of Object.entries(definitions!)) {
    if (
      name === "declarativeCopilots" ||
      value === null ||
      (Array.isArray(value) && value.length === 0) ||
      (isObject(value) && Object.keys(value).length === 0)
    )
      continue;
    return err(titleFailure("AgentTitleSourceUnsupported", "element-groups"));
  }
  if (!isObject(agents[0])) return err(migrationError("AgentTitleSourceInvalid"));
  const parsed = parseJson(jsonBytes(agents[0]));
  if (parsed.isErr()) return err(migrationError("AgentTitleSourceInvalid"));
  const agent = parsed.value;
  for (const key of ["version", "name", "description", "instructions"]) {
    if (typeof agent[key] !== "string" || !agent[key].trim())
      return err(migrationError("AgentTitleSourceIncomplete"));
  }
  if (logicalSuffix && agent.id !== logicalSuffix)
    return err(migrationError("AgentTitleSourceInvalid"));
  if (
    objects(agent.actions).length > 0 ||
    objects(agent.worker_agents).some((worker) => worker.file !== undefined) ||
    objects(agent.capabilities).some(
      (capability) =>
        capability.name === "EmbeddedKnowledge" && objects(capability.files).length > 0
    )
  ) {
    return err(migrationError("AgentTitleSourceIncomplete"));
  }
  const version = agent.version;
  if (typeof version !== "string") return err(migrationError("AgentTitleSourceIncomplete"));
  const alias = `https://aka.ms/json-schemas/copilot/declarative-agent/${version}/schema.json`;
  const schemaAlias = agent.$schema === alias;
  if (schemaAlias) agent.$schema = schemaUrl("agent", version);
  const valid = await validateDocument(agent, "agent", true);
  return valid.isErr()
    ? err(titleFailure("AgentTitleSourceUnsupported", "da-schema-invalid"))
    : ok({ agent, schemaAlias });
}

export async function prepareTitlePackage(
  titleId: string,
  snapshot: JsonObject,
  snapshotBytes: Buffer,
  agent: JsonObject,
  large: Buffer,
  small: Buffer | undefined,
  schemaAlias: boolean,
  signal: AbortSignal
): Promise<Result<TitlePackageSource, FxError>> {
  const profile = await loadAgentImportProfile();
  if (profile.isErr()) return err(profile.error);
  const base = `${profile.value.template.id}/appPackage/`;
  const template = profile.value.files.get(`${base}manifest.json.tpl`);
  if (!template) return err(migrationError("AgentPackageUnsupported"));
  const rendered = renderTemplateFileData(
    "manifest.json.tpl",
    template,
    Generator.getDefaultVariables("ImportedAgent")
  );
  const parsed = parseJson(typeof rendered === "string" ? Buffer.from(rendered) : rendered);
  if (parsed.isErr()) return err(parsed.error);
  const manifest = parsed.value;
  if (snapshot.name !== undefined && typeof snapshot.name !== "string")
    return err(migrationError("AgentTitleSourceInvalid"));
  const name = snapshot.name ?? agent.name;
  manifest.name = { short: name, full: name };
  const description = object(manifest.description);
  if (!description) return err(migrationError("AgentPackageSchemaInvalid"));
  description.full = agent.description;
  if (snapshot.shortDescription !== undefined) description.short = snapshot.shortDescription;
  const developer = object(manifest.developer);
  if (!developer) return err(migrationError("AgentPackageSchemaInvalid"));
  if (snapshot.developerName !== undefined) developer.name = snapshot.developerName;
  for (const key of ["version", "accentColor", "validDomains"]) {
    if (snapshot[key] !== undefined) manifest[key] = snapshot[key];
  }
  if (snapshot.cultureName !== undefined)
    manifest.localizationInfo = { defaultLanguageTag: snapshot.cultureName };
  const entries = objects(object(manifest.copilotAgents)?.declarativeAgents);
  const icons = object(manifest.icons);
  if (
    entries.length !== 1 ||
    typeof entries[0].file !== "string" ||
    typeof icons?.color !== "string" ||
    typeof icons.outline !== "string"
  ) {
    return err(migrationError("AgentPackageSchemaInvalid"));
  }
  if (agent.id !== undefined) entries[0].id = agent.id;
  const agentPath = localReference("manifest.json", entries[0].file);
  const colorPath = localReference("manifest.json", icons.color);
  const outlinePath = localReference("manifest.json", icons.outline);
  if (agentPath.isErr()) return err(agentPath.error);
  if (colorPath.isErr()) return err(colorPath.error);
  if (outlinePath.isErr()) return err(outlinePath.error);
  const outline = profile.value.files.get(`${base}${outlinePath.value}`);
  if (!outline) return err(migrationError("AgentPackageUnsupported"));
  const packageFiles: Artifacts = new Map([
    ["manifest.json", jsonBytes(manifest)],
    [agentPath.value, jsonBytes(agent)],
    [colorPath.value, large],
    [outlinePath.value, outline],
  ]);
  const graph = await inspectGraph(packageFiles, signal, false, true, true);
  if (graph.isErr()) {
    return err(
      titleFailure(
        graph.error.name === "AgentPackageReferenceMissing"
          ? "AgentTitleSourceIncomplete"
          : "AgentTitleSourceUnsupported",
        "generated-package-invalid"
      )
    );
  }
  const snapshotFiles: Artifacts = new Map([
    ["launchinfo.json", snapshotBytes],
    ["assets/icon-large.png", large],
  ]);
  if (small) snapshotFiles.set("assets/icon-small.png", small);
  return ok({
    packageFiles,
    snapshotFiles,
    graph: graph.value,
    colorPath: colorPath.value,
    outlinePath: outlinePath.value,
    schemaAlias,
    schemaCompatibility:
      agent.version === "v1.0" &&
      typeof agent.instructions === "string" &&
      agent.instructions.includes("\r\n"),
    source: { kind: "title-id", titleId, digest: artifactDigest(snapshotFiles) },
  });
}

export function titleReport(
  report: AgentMigrationReport,
  source: TitlePackageSource
): AgentTitleImportReport {
  const agentPath = `appPackage/${source.graph.agentPath}`;
  const colorPath = `appPackage/${source.colorPath}`;
  const pointer = "launchinfo.json#/elementDefinitions/declarativeCopilots/0";
  const files = report.files.map((file): AgentMigrationReport["files"][number] => {
    const { sourcePath: _sourcePath, ...rest } = file;
    if (file.path === colorPath) return { ...rest, sourcePath: "assets/icon-large.png" };
    if (file.path === agentPath) return { ...rest, sourcePath: pointer };
    return { ...rest, action: "created" };
  });
  for (const name of ["launchinfo.json", "assets/icon-small.png"]) {
    const bytes = source.snapshotFiles.get(name);
    if (bytes)
      files.push({ path: name, action: "skipped", sourcePath: name, digest: digest(bytes) });
  }
  const diagnostics = [
    ...report.diagnostics,
    ...[
      { code: "GeneratedContainerMetadata", key: "container", path: "appPackage/manifest.json" },
      { code: "GeneratedOutlineIcon", key: "outline", path: `appPackage/${source.outlinePath}` },
    ].map((item): AgentMigrationReport["diagnostics"][number] => ({
      code: item.code,
      severity: "warning",
      path: item.path,
      ruleId: "agent-title/1",
      message: getLocalizedString(`agentMigration.title.${item.key}`),
      remediation: getLocalizedString("agentMigration.title.reviewMetadata"),
    })),
  ];
  if (source.schemaCompatibility)
    diagnostics.push({
      code: "LaunchInfoSchemaCompatibility",
      severity: "info",
      path: agentPath,
      ruleId: "agent-title/crlf-v1.0/1",
      message: getLocalizedString("agentMigration.title.crlfCompatibility"),
    });
  const transformations = [
    ...report.transformations,
    ...diagnostics
      .filter((item) => item.ruleId === "agent-title/1")
      .map((item) => ({ ruleId: "agent-title/1", path: item.path!, description: item.message })),
  ];
  if (source.schemaAlias)
    transformations.push({
      ruleId: "agent-title/schema-alias/1",
      path: agentPath,
      description: getLocalizedString("agentMigration.title.schemaAlias"),
    });
  return {
    ...report,
    reportVersion: 2,
    source: source.source,
    files,
    diagnostics,
    transformations,
    referenceMap: { [pointer]: agentPath, "assets/icon-large.png": colorPath },
    configuration: {
      ...report.configuration,
      requirements: [
        ...report.configuration.requirements,
        getLocalizedString("agentMigration.title.reviewMetadata"),
      ],
    },
  };
}
