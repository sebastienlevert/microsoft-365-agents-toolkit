// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Import generator for declarative agents from Agent Builder zip exports.
 * Extracts the zip, scaffolds a declarative-agent-basic project, then overlays
 * the imported agent data (declarativeAgent.json, instructions, capabilities,
 * conversation starters, icons, and env vars).
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
 * Import a declarative agent from an Agent Builder zip file.
 * 1. Extracts zip → finds manifest.json → finds declarativeAgent.json
 * 2. Scaffolds a project using the declarative-agent-basic template
 * 3. Overlays imported data (declarativeAgent.json, instruction.txt, icons, env vars)
 */
export async function importDeclarativeAgent(
  context: Context,
  inputs: ImportProjectInputs
): Promise<Result<CreateProjectResult, FxError>> {
  const zipFilePath = inputs["zip-file-path"];
  if (!zipFilePath) {
    return err(
      new UserError(componentName, "MissingZipFilePath", "The --zip-file-path option is required.")
    );
  }

  if (!(await fs.pathExists(zipFilePath))) {
    return err(
      new UserError(componentName, "ZipFileNotFound", `Zip file not found: ${zipFilePath}`)
    );
  }

  let extractedData: ExtractedAgentData | undefined;
  try {
    // Step 1: Extract and parse zip
    extractedData = await extractAndParseZip(zipFilePath);

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
    await overlayImportedData(projectPath, extractedData, appName);

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
  appName: string
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
