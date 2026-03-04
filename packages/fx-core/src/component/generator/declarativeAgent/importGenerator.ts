// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Import generator for declarative agents.
 * Supports two modes:
 * 1. From Agent Builder zip file (--zip-file-path)
 * 2. From Copilot API via title ID (--title-id)
 *
 * Both paths extract the declarative agent data, scaffold a declarative-agent-basic
 * project, then overlay the imported agent data (declarativeAgent.json, instructions,
 * capabilities, conversation starters, icons, and env vars).
 */

import {
  AppPackageFolderName,
  Context,
  CreateProjectResult,
  FxError,
  Inputs,
  ok,
  err,
  Result,
  SystemError,
  UserError,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { ImportProjectInputs } from "../../../question/inputs/ImportProjectInputs";
import { getResourceServiceEndpoint, ResourceServiceType } from "../../../common/constants";
import { WrappedAxiosClient } from "../../../common/wrappedAxiosClient";

const componentName = "import-declarative-agent-generator";

interface ExtractedAgentData {
  /** Path to temp extraction directory */
  extractedPath: string;
  /** Parsed Teams manifest (manifest.json) */
  teamsManifest: TeamsAppManifest;
  /** Parsed declarativeAgent.json */
  declarativeAgent: DeclarativeAgentManifest;
  /** Raw instructions text (resolved from file ref or inline) */
  instructions: string;
  /** List of asset files (icons) found in appPackage or root */
  assetFiles: string[];
}

interface TeamsAppManifest {
  $schema?: string;
  manifestVersion?: string;
  version?: string;
  id?: string;
  developer?: {
    name?: string;
    websiteUrl?: string;
    privacyUrl?: string;
    termsOfUseUrl?: string;
  };
  name?: {
    short?: string;
    full?: string;
  };
  description?: {
    short?: string;
    full?: string;
  };
  icons?: {
    color?: string;
    outline?: string;
  };
  copilotAgents?: {
    declarativeAgents?: Array<{
      id: string;
      file: string;
    }>;
  };
  [key: string]: unknown;
}

interface DeclarativeAgentManifest {
  $schema?: string;
  version?: string;
  name: string;
  description: string;
  instructions?: string;
  conversation_starters?: Array<{ title: string; text: string }>;
  capabilities?: Array<Record<string, unknown>>;
  actions?: Array<Record<string, unknown>>;
  behavior_overrides?: Record<string, unknown>;
  disclaimer?: { text: string };
  [key: string]: unknown;
}

/**
 * Import a declarative agent from a zip file or directly from Copilot API.
 * - If --title-id is provided, fetches agent data from the Copilot Admin API.
 * - If --zip-file-path is provided, extracts agent data from the zip file.
 * Then scaffolds a project using the declarative-agent-basic template and
 * overlays the imported data.
 */
export async function importDeclarativeAgent(
  context: Context,
  inputs: ImportProjectInputs
): Promise<Result<CreateProjectResult, FxError>> {
  const titleId = inputs["title-id"];
  const zipFilePath = inputs["zip-file-path"];
  const clientId = inputs["client-id"];

  if (!titleId && !zipFilePath) {
    return err(
      new UserError(
        componentName,
        "MissingImportSource",
        "Either --title-id or --zip-file-path must be provided."
      )
    );
  }

  if (titleId && !clientId) {
    return err(
      new UserError(
        componentName,
        "MissingClientId",
        "The --client-id option is required when using --title-id. Register a 3P app with CopilotPackages.Read.All delegated permission and provide its client ID."
      )
    );
  }

  let extractedData: ExtractedAgentData | undefined;
  try {
    // Step 1: Get agent data from either source
    if (titleId) {
      extractedData = await fetchFromCopilotAPI(context, titleId, clientId!);
    } else {
      if (!(await fs.pathExists(zipFilePath!))) {
        return err(
          new UserError(
            componentName,
            "ZipFileNotFound",
            `Zip file not found: ${zipFilePath ?? ""}`
          )
        );
      }
      extractedData = await extractAndParseZip(zipFilePath!);
    }

    // Step 2: Determine project name and path
    const appName = inputs["app-name"] || sanitizeProjectName(extractedData.declarativeAgent.name);
    const folder = path.resolve(inputs.folder || "./");
    const projectPath = path.join(folder, appName);

    // Check if project path already exists
    if (await fs.pathExists(projectPath)) {
      if (!inputs.overwrite) {
        return err(
          new UserError(
            componentName,
            "ProjectPathExists",
            `Project path already exists: ${projectPath}. Use --overwrite to replace it.`
          )
        );
      }
      await fs.remove(projectPath);
    }

    // Step 3: Scaffold base project using declarative-agent-basic template
    await scaffoldBaseProject(context, inputs, appName, projectPath);

    // Step 4: Overlay imported data
    await overlayImportedData(projectPath, extractedData, appName, titleId);

    return ok({ projectPath });
  } catch (e) {
    if (e instanceof UserError || e instanceof SystemError) {
      return err(e);
    }
    return err(
      new SystemError(
        componentName,
        "ImportFailed",
        `Failed to import agent: ${e instanceof Error ? e.message : String(e)}`
      )
    );
  } finally {
    // Cleanup temp directory
    if (extractedData?.extractedPath) {
      await fs.remove(extractedData.extractedPath).catch(() => {});
    }
  }
}

async function extractAndParseZip(zipFilePath: string): Promise<ExtractedAgentData> {
  const extractedPath = await fs.mkdtemp(path.join(os.tmpdir(), "atk-import-"));

  const zip = new AdmZip(zipFilePath);
  zip.extractAllTo(extractedPath, true);

  const entries = zip.getEntries();
  const files = entries.map((entry) => entry.entryName);

  // Find Teams manifest (manifest.json at root)
  const manifestFile = files.find((f) => f === "manifest.json" || f === "./manifest.json");
  if (!manifestFile) {
    throw new UserError(
      componentName,
      "NoTeamsManifest",
      "No manifest.json found at the root of the zip file."
    );
  }

  const teamsManifest: TeamsAppManifest = await fs.readJson(path.join(extractedPath, manifestFile));

  // Find declarativeAgent file reference
  const daRef = teamsManifest.copilotAgents?.declarativeAgents?.[0]?.file;
  if (!daRef) {
    throw new UserError(
      componentName,
      "NoDeclarativeAgent",
      "manifest.json does not reference a declarativeAgent file via copilotAgents.declarativeAgents[].file."
    );
  }

  // Locate the referenced file
  const normalizedRef = daRef.replace(/\\/g, "/");
  const daFile = files.find((f) => {
    const normalized = f.replace(/\\/g, "/");
    return normalized === normalizedRef || normalized.endsWith("/" + normalizedRef);
  });
  if (!daFile) {
    throw new UserError(
      componentName,
      "DeclarativeAgentFileNotFound",
      `Declarative agent file "${daRef}" referenced in manifest.json was not found in the zip.`
    );
  }

  const declarativeAgent: DeclarativeAgentManifest = await fs.readJson(
    path.join(extractedPath, daFile)
  );

  if (!declarativeAgent.name || !declarativeAgent.description) {
    throw new UserError(
      componentName,
      "InvalidDeclarativeAgent",
      'The declarativeAgent.json must have "name" and "description" fields.'
    );
  }

  // Resolve instructions
  let instructions = "";
  if (typeof declarativeAgent.instructions === "string") {
    // Check if it's a file reference like $[file('instruction.txt')]
    const fileRefMatch = declarativeAgent.instructions.match(/^\$\[file\(['"](.+?)['"]\)\]$/);
    if (fileRefMatch) {
      const instrFile = fileRefMatch[1];
      const instrPath = path.join(extractedPath, path.dirname(daFile), instrFile);
      if (await fs.pathExists(instrPath)) {
        instructions = await fs.readFile(instrPath, "utf-8");
      }
    } else {
      instructions = declarativeAgent.instructions;
    }
  }

  // Find asset files (icons)
  const imageExtensions = [".png", ".jpg", ".jpeg", ".svg", ".gif", ".ico"];
  const assetFiles = files.filter((f) =>
    imageExtensions.some((ext) => f.toLowerCase().endsWith(ext))
  );

  return {
    extractedPath,
    teamsManifest,
    declarativeAgent,
    instructions,
    assetFiles,
  };
}

/**
 * Copilot Admin API response types.
 */
interface CopilotPackageElement {
  id: string;
  definition: string;
}

interface CopilotPackageElementDetail {
  elementType: string;
  elements: CopilotPackageElement[];
}

interface CopilotPackageDetailResponse {
  id: string;
  shortDescription?: string;
  longDescription?: string;
  version?: string;
  type?: string;
  elementDetails?: CopilotPackageElementDetail[];
  [key: string]: unknown;
}

/**
 * Get the path to the MSAL token cache file for Copilot API imports.
 */
function getCopilotCachePath(): string {
  return path.join(os.homedir(), ".fx", "copilot-import-cache.json");
}

/**
 * Fetch declarative agent data directly from the Copilot Admin API.
 * Uses a standalone MSAL auth flow with a user-provided 3P app registration
 * to avoid the 1P app preauthorization limitation.
 * Tokens are cached in ~/.fx/copilot-import-cache.json for reuse.
 */
async function fetchFromCopilotAPI(
  context: Context,
  titleId: string,
  clientId: string
): Promise<ExtractedAgentData> {
  const { PublicClientApplication } = await import("@azure/msal-node");

  // Set up file-based token cache
  const cachePath = getCopilotCachePath();
  await fs.ensureDir(path.dirname(cachePath));
  let cacheData = "";
  if (await fs.pathExists(cachePath)) {
    cacheData = await fs.readFile(cachePath, "utf-8");
  }

  const pca = new PublicClientApplication({
    auth: {
      clientId,
      authority: "https://login.microsoftonline.com/common",
    },
  });

  // Load cache into MSAL
  if (cacheData) {
    pca.getTokenCache().deserialize(cacheData);
  }

  const scopes = ["https://graph.microsoft.com/CopilotPackages.Read.All"];

  let accessToken: string;
  try {
    // Try silent acquisition first (uses cached tokens)
    const accounts = await pca.getTokenCache().getAllAccounts();
    if (accounts.length > 0) {
      try {
        const silentResult = await pca.acquireTokenSilent({
          scopes,
          account: accounts[0],
        });
        if (silentResult?.accessToken) {
          accessToken = silentResult.accessToken;
          // Persist updated cache
          const updatedCache = pca.getTokenCache().serialize();
          await fs.writeFile(cachePath, updatedCache, "utf-8");
        }
      } catch {
        // Silent failed — fall through to device code flow
      }
    }

    // If silent didn't work, use device code flow
    if (!accessToken!) {
      const tokenResponse = await pca.acquireTokenByDeviceCode({
        scopes,
        deviceCodeCallback: (response) => {
          process.stderr.write(`\n${response.message}\n\n`);
        },
      });
      if (!tokenResponse?.accessToken) {
        throw new Error("No access token returned");
      }
      accessToken = tokenResponse.accessToken;

      // Persist cache after successful login
      const updatedCache = pca.getTokenCache().serialize();
      await fs.writeFile(cachePath, updatedCache, "utf-8");
    }
  } catch (e: any) {
    throw new UserError(
      componentName,
      "CopilotAuthFailed",
      `Failed to authenticate for Copilot API: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const graphBaseUrl =
    process.env.GRAPH_ENDPOINT ?? `${getResourceServiceEndpoint(ResourceServiceType.Graph)}/beta`;
  const requester = WrappedAxiosClient.create({
    baseURL: graphBaseUrl,
  });
  requester.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
  requester.defaults.headers.common["Content-Type"] = "application/json";

  // Fetch package details
  let packageDetail: CopilotPackageDetailResponse;
  try {
    const response = await requester.get(`/copilot/admin/catalog/packages/${titleId}`);
    packageDetail = response.data;
  } catch (e: any) {
    const status = e?.response?.status;
    const responseBody = e?.response?.data ? JSON.stringify(e.response.data, null, 2) : "";
    if (status === 404) {
      throw new UserError(
        componentName,
        "AgentNotFound",
        `Agent with title ID "${titleId}" was not found in your organization's Copilot catalog.${
          responseBody ? `\n${responseBody}` : ""
        }`
      );
    }
    if (status === 403 || status === 401) {
      throw new UserError(
        componentName,
        "CopilotAccessDenied",
        `Access denied (HTTP ${String(
          status
        )}). Ensure admin consent is granted for CopilotPackages.Read.All and you have the required admin role.${
          responseBody ? `\nAPI response: ${responseBody}` : ""
        }`
      );
    }
    throw new SystemError(
      componentName,
      "CopilotApiFailed",
      `Failed to fetch agent from Copilot API (HTTP ${String(status ?? "unknown")}): ${
        e instanceof Error ? e.message : String(e)
      }${responseBody ? `\nAPI response: ${responseBody}` : ""}`
    );
  }

  // Find DeclarativeCopilots element
  const daElementDetail = packageDetail.elementDetails?.find(
    (ed) => ed.elementType === "DeclarativeCopilots"
  );
  if (!daElementDetail || !daElementDetail.elements.length) {
    throw new UserError(
      componentName,
      "NoDeclarativeAgentInPackage",
      `Package "${titleId}" does not contain a declarative agent.`
    );
  }

  // Parse the first declarative agent definition
  const daElement = daElementDetail.elements[0];
  let declarativeAgent: DeclarativeAgentManifest;
  try {
    declarativeAgent = JSON.parse(daElement.definition);
  } catch {
    throw new SystemError(
      componentName,
      "InvalidAgentDefinition",
      "Failed to parse declarative agent definition from Copilot API response."
    );
  }

  if (!declarativeAgent.name) {
    declarativeAgent.name = packageDetail.shortDescription || `Agent ${titleId}`;
  }
  if (!declarativeAgent.description) {
    declarativeAgent.description =
      packageDetail.longDescription || packageDetail.shortDescription || "";
  }

  // Resolve instructions (inline only — no file refs from API)
  const instructions =
    typeof declarativeAgent.instructions === "string" ? declarativeAgent.instructions : "";

  // No temp directory or icon assets from the API
  const extractedPath = await fs.mkdtemp(path.join(os.tmpdir(), "atk-import-api-"));

  return {
    extractedPath,
    teamsManifest: {
      name: { short: declarativeAgent.name },
      description: {
        short: packageDetail.shortDescription || declarativeAgent.description,
        full: packageDetail.longDescription,
      },
    },
    declarativeAgent,
    instructions,
    assetFiles: [],
  };
}

async function scaffoldBaseProject(
  context: Context,
  inputs: ImportProjectInputs,
  appName: string,
  projectPath: string
): Promise<void> {
  // We reuse the coordinator's create flow by importing the Generator and running
  // the declarative-agent-basic template directly.
  const { Generator } = await import("../../generator/generator");
  const { TemplateNames } = await import("../../generator/templates/templateNames");
  const { Generators } = await import("../../generator/generatorProvider");
  const { QuestionNames } = await import("../../../question/constants");

  // Build inputs for the template generator
  const scaffoldInputs: Inputs = {
    ...inputs,
    [QuestionNames.AppName]: appName,
    [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentBasic,
    [QuestionNames.ProgrammingLanguage]: "common",
    projectPath,
  };

  await fs.ensureDir(projectPath);

  // Find the matching generator and run it
  const generator = Generators.find((g) => g.activate(context, scaffoldInputs));
  if (generator) {
    const res = await generator.run(context, scaffoldInputs, projectPath);
    if (res.isErr()) {
      throw res.error;
    }
  } else {
    // Fallback: use Generator.generate directly with the template
    const { getTemplateReplaceMap } = await import("../../generator/templates/templateReplaceMap");
    const { convertToLangKey, renderTemplateFileData, renderTemplateFileName } = await import(
      "../../generator/utils"
    );
    const { TemplateActionSeq } = await import("../../generator/generatorAction");

    const replaceMap = {
      ...getTemplateReplaceMap(scaffoldInputs),
      DeclarativeCopilot: "true",
    };

    const language = "common";
    const folderName = TemplateNames.DeclarativeAgentBasic;

    await Generator.generate(
      {
        name: folderName,
        language,
        destination: projectPath,
        logProvider: context.logProvider,
        platform: inputs.platform,
        fileNameReplaceFn: (fileName, fileData) =>
          renderTemplateFileName(fileName, fileData, replaceMap)
            .replace(/\\/g, "/")
            .replace(`${folderName}/`, ""),
        fileDataReplaceFn: (fileName, fileData) =>
          renderTemplateFileData(fileName, fileData, replaceMap),
        filterFn: (fileName) => fileName.replace(/\\/g, "/").startsWith(`${folderName}/`),
        onActionError: async () => {},
      },
      TemplateActionSeq
    );
  }
}

async function overlayImportedData(
  projectPath: string,
  data: ExtractedAgentData,
  appName: string,
  titleId?: string
): Promise<void> {
  const appPackagePath = path.join(projectPath, AppPackageFolderName);
  await fs.ensureDir(appPackagePath);

  // 1. Write instruction.txt
  if (data.instructions) {
    await fs.writeFile(path.join(appPackagePath, "instruction.txt"), data.instructions, "utf-8");
  }

  // 2. Write declarativeAgent.json with file reference for instructions
  const outputAgent = buildDeclarativeAgentManifest(data.declarativeAgent);

  await fs.writeFile(
    path.join(appPackagePath, "declarativeAgent.json"),
    JSON.stringify(outputAgent, null, 4),
    "utf-8"
  );

  // 3. Update manifest.json with imported developer info / descriptions
  const manifestPath = path.join(appPackagePath, "manifest.json");
  if (await fs.pathExists(manifestPath)) {
    const manifest = await fs.readJson(manifestPath);

    // Update developer info from imported Teams manifest
    if (data.teamsManifest.developer) {
      const dev = data.teamsManifest.developer;
      if (dev.name && dev.name !== "My App, Inc.") {
        manifest.developer = manifest.developer || {};
        manifest.developer.name = dev.name;
      }
      if (dev.websiteUrl) {
        manifest.developer = manifest.developer || {};
        manifest.developer.websiteUrl = dev.websiteUrl;
      }
      if (dev.privacyUrl) {
        manifest.developer = manifest.developer || {};
        manifest.developer.privacyUrl = dev.privacyUrl;
      }
      if (dev.termsOfUseUrl) {
        manifest.developer = manifest.developer || {};
        manifest.developer.termsOfUseUrl = dev.termsOfUseUrl;
      }
    }

    // Update descriptions
    if (data.teamsManifest.description) {
      if (data.teamsManifest.description.short) {
        manifest.description = manifest.description || {};
        manifest.description.short = data.teamsManifest.description.short;
      }
      if (data.teamsManifest.description.full) {
        manifest.description = manifest.description || {};
        manifest.description.full = data.teamsManifest.description.full;
      }
    }

    // Update version from imported manifest
    if (data.teamsManifest.version) {
      manifest.version = data.teamsManifest.version;
    }

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 4), "utf-8");
  }

  // 4. Copy icon assets
  for (const assetFile of data.assetFiles) {
    const srcPath = path.join(data.extractedPath, assetFile);
    const destPath = path.join(appPackagePath, path.basename(assetFile));
    if (await fs.pathExists(srcPath)) {
      await fs.copyFile(srcPath, destPath);
    }
  }

  // 5. Update .env.dev with imported values
  const envDevPath = path.join(projectPath, "env", ".env.dev");
  if (await fs.pathExists(envDevPath)) {
    let envContent = await fs.readFile(envDevPath, "utf-8");

    // Add imported agent metadata as env vars
    const additionalVars: string[] = ["", "# Imported from Agent Builder"];

    if (data.declarativeAgent.name) {
      additionalVars.push(`AGENT_DISPLAY_NAME=${data.declarativeAgent.name}`);
    }
    if (data.declarativeAgent.description) {
      additionalVars.push(`AGENT_DESCRIPTION=${data.declarativeAgent.description}`);
    }
    if (titleId) {
      additionalVars.push(`M365_TITLE_ID=${titleId}`);
    }

    envContent += additionalVars.join("\n") + "\n";
    await fs.writeFile(envDevPath, envContent, "utf-8");
  }
}

function sanitizeProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 30);
}

const daSchemaBaseUrl = "https://developer.microsoft.com/json-schemas/copilot/declarative-agent";
const daDefaultVersion = "v1.5";
const daSupportedVersions = ["v1.0", "v1.2", "v1.3", "v1.4", "v1.5", "v1.6"];

function getDASchemaUrl(version: string): string {
  return `${daSchemaBaseUrl}/${version}/schema.json`;
}

/**
 * Build a clean declarative agent manifest with correct property ordering,
 * schema URL, and without empty/null/empty-array properties.
 */
function buildDeclarativeAgentManifest(source: DeclarativeAgentManifest): Record<string, unknown> {
  const version =
    source.version && daSupportedVersions.includes(source.version)
      ? source.version
      : daDefaultVersion;

  // Ordered properties matching project creation output
  const ordered: Record<string, unknown> = {
    $schema: getDASchemaUrl(version),
    version,
    name: source.name,
    description: source.description,
    instructions: "$[file('instruction.txt')]",
  };

  // Remaining properties in schema-defined order
  const remainingKeys: (keyof DeclarativeAgentManifest)[] = [
    "conversation_starters",
    "behavior_overrides",
    "capabilities",
    "actions",
    "disclaimer",
  ];

  for (const key of remainingKeys) {
    const value = source[key];
    if (hasValue(value)) {
      ordered[key] = value;
    }
  }

  // Preserve any extra properties not in the known set
  const knownKeys = new Set([
    "$schema",
    "version",
    "name",
    "description",
    "instructions",
    "id",
    ...remainingKeys,
  ]);
  for (const [key, value] of Object.entries(source)) {
    if (!knownKeys.has(key) && hasValue(value)) {
      ordered[key] = value;
    }
  }

  return ordered;
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") {
    return false;
  }
  if (Array.isArray(value) && value.length === 0) {
    return false;
  }
  return true;
}
