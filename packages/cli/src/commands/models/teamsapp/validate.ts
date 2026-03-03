// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  CLICommand,
  CLICommandOption,
  FxError,
  Result,
  TeamsAppInputs,
  err,
  ok,
  validateCopilotManifest,
} from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as path from "path";
import { getFxCore } from "../../../activate";
import { logger } from "../../../commonlib/logger";
import { commands } from "../../../resource";
import { TelemetryEvent } from "../../../telemetry/cliTelemetryEvents";
import {
  EnvFileOption,
  EnvOption,
  ProjectFolderOption,
  TeamsAppManifestFileOption,
  TeamsAppOuputPackageOption,
  TeamsAppOutputFolderOption,
  TeamsAppPackageOption,
  ValidateMethodOption,
} from "../../common";
import { validateArgumentConflict } from "./update";

const ADAPTIVE_CARD_SCHEMA_PREFIX = "http://adaptivecards.io/schemas/";
const SUPPORTED_TEXT_EXTENSIONS = [".txt", ".md"];
const SUPPORTED_JSON_EXTENSIONS = [".json"];
const APP_PACKAGE_FOLDER = "appPackage";

const FileOption: CLICommandOption = {
  name: "file",
  type: "string",
  description:
    "Path to a file in the appPackage folder for validation. Supports declarative agent, API plugin, and Adaptive Card JSON files, as well as .txt and .md files.",
};

const OutputFormatOption: CLICommandOption = {
  name: "format",
  type: "string",
  description: "Output format for file validation results.",
  choices: ["text", "json"],
  default: "text",
};

export const teamsappValidateCommand: CLICommand = {
  name: "validate",
  description: commands.validate.description,
  options: getOptions(),
  telemetry: {
    event: TelemetryEvent.ValidateManifest,
  },
  defaultInteractiveOption: false,
  examples: [
    {
      command: `${process.env.TEAMSFX_CLI_BIN_NAME} validate --file ./appPackage/declarativeAgent.json`,
      description: "Validate a standalone declarative agent manifest.",
    },
    {
      command: `${process.env.TEAMSFX_CLI_BIN_NAME} validate --file ./appPackage/adaptiveCards/card.json`,
      description: "Validate an Adaptive Card JSON file.",
    },
    {
      command: `${process.env.TEAMSFX_CLI_BIN_NAME} validate --file ./appPackage/instructions.txt`,
      description: "Validate a text file in the appPackage folder.",
    },
  ],
  handler: async (ctx) => {
    const inputs = ctx.optionValues as TeamsAppInputs & Record<string, string>;
    const file = inputs["file"];

    // Standalone file validation mode
    if (file) {
      return runFileValidation(file, inputs["format"] || "text");
    }

    // Standard Teams App validation
    const validateInputsRes = validateArgumentConflict(ctx.command.fullName, inputs);
    if (validateInputsRes.isErr()) {
      return err(validateInputsRes.error);
    }
    const core = getFxCore();
    const res = await core.validateTeamsAppCLIV3(inputs);
    return res;
  },
};

/**
 * Check whether the file resides under an appPackage folder.
 */
function isInAppPackageFolder(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").includes(APP_PACKAGE_FOLDER);
}

/**
 * Detect if a parsed JSON object looks like an Adaptive Card.
 */
function isAdaptiveCard(content: unknown): boolean {
  if (!content || typeof content !== "object") {
    return false;
  }
  const obj = content as Record<string, unknown>;
  if (obj.type === "AdaptiveCard") {
    return true;
  }
  if (typeof obj.$schema === "string" && obj.$schema.startsWith(ADAPTIVE_CARD_SCHEMA_PREFIX)) {
    return true;
  }
  return false;
}

async function runFileValidation(
  file: string,
  format: string
): Promise<Result<undefined, FxError>> {
  const resolvedPath = path.resolve(file);

  // Check file exists
  if (!fs.existsSync(resolvedPath)) {
    logger.error(`File not found: ${resolvedPath}`);
    return err(new FileValidationError(`File not found: ${resolvedPath}`));
  }

  // Check file is in appPackage folder
  if (!isInAppPackageFolder(resolvedPath)) {
    const message = `File must be in the ${APP_PACKAGE_FOLDER} folder: ${resolvedPath}`;
    logger.error(message);
    return err(new FileValidationError(message));
  }

  const ext = path.extname(resolvedPath).toLowerCase();

  // Text/Markdown file validation
  if (SUPPORTED_TEXT_EXTENSIONS.includes(ext)) {
    return runTextFileValidation(resolvedPath, format);
  }

  // JSON file validation (declarative agent, API plugin, adaptive card)
  if (SUPPORTED_JSON_EXTENSIONS.includes(ext)) {
    return runJsonFileValidation(resolvedPath, format);
  }

  const message = `Unsupported file type "${ext}". Supported types: ${[
    ...SUPPORTED_JSON_EXTENSIONS,
    ...SUPPORTED_TEXT_EXTENSIONS,
  ].join(", ")}`;
  logger.error(message);
  return err(new FileValidationError(message));
}

/**
 * Validate .txt and .md files: exist and non-empty.
 */
function runTextFileValidation(resolvedPath: string, format: string): Result<undefined, FxError> {
  const content = fs.readFileSync(resolvedPath, "utf-8");
  const isEmpty = content.trim().length === 0;

  const result = {
    valid: !isEmpty,
    fileType: path.extname(resolvedPath).toLowerCase() === ".md" ? "markdown" : "text",
    errors: isEmpty ? [{ code: "FILE-001", message: "File is empty.", path: resolvedPath }] : [],
    warnings: [] as Array<{ code: string; message: string; path: string }>,
  };

  if (format === "json") {
    logger.info(JSON.stringify(result, null, 2));
  } else {
    if (result.errors.length > 0) {
      logger.info(`❌ ${String(result.errors.length)} error(s) found:\n`);
      for (const e of result.errors) {
        logger.info(`  ${e.code} ${e.message}`);
      }
    } else {
      logger.info("✅ Validation passed — no errors or warnings found.");
    }
  }

  if (!result.valid) {
    process.exitCode = 1;
  }
  return ok(undefined);
}

/**
 * Validate JSON files: detect type (declarative agent, API plugin, adaptive card)
 * and run appropriate validation.
 */
async function runJsonFileValidation(
  resolvedPath: string,
  format: string
): Promise<Result<undefined, FxError>> {
  const content = fs.readFileSync(resolvedPath, "utf-8");

  // Check for valid JSON first
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const message = `File contains invalid JSON: ${resolvedPath}`;
    logger.error(message);
    return err(new FileValidationError(message));
  }

  // Adaptive Card detection — validate separately
  if (isAdaptiveCard(parsed)) {
    return runAdaptiveCardValidation(resolvedPath, parsed, format);
  }

  // Declarative agent or API plugin — delegate to copilot manifest validator
  try {
    const result = await validateCopilotManifest(content, { filename: resolvedPath });
    const hasErrors = result.errors.length > 0;

    if (format === "json") {
      logger.info(JSON.stringify(result, null, 2));
    } else {
      logValidationResult(result.errors, result.warnings);
    }

    if (hasErrors) {
      process.exitCode = 1;
    }
    return ok(undefined);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Validation failed: ${message}`);
    return err(new FileValidationError(0, message));
  }
}

/**
 * Validate Adaptive Card JSON: must have type "AdaptiveCard" and valid schema.
 */
function runAdaptiveCardValidation(
  resolvedPath: string,
  parsed: unknown,
  format: string
): Result<undefined, FxError> {
  const obj = parsed as Record<string, unknown>;
  const errors: Array<{ code: string; message: string; path: string }> = [];
  const warnings: Array<{ code: string; message: string; path: string }> = [];

  if (obj.type !== "AdaptiveCard") {
    errors.push({
      code: "CARD-001",
      message: 'Adaptive Card must have "type": "AdaptiveCard".',
      path: "$.type",
    });
  }

  if (!obj.version) {
    warnings.push({
      code: "CARD-002",
      message: "Adaptive Card is missing a version property.",
      path: "$.version",
    });
  }

  if (typeof obj.$schema === "string" && !obj.$schema.startsWith(ADAPTIVE_CARD_SCHEMA_PREFIX)) {
    warnings.push({
      code: "CARD-003",
      message: `Unexpected $schema value. Expected prefix: "${ADAPTIVE_CARD_SCHEMA_PREFIX}".`,
      path: "$.$schema",
    });
  }

  if (!obj.body || !Array.isArray(obj.body) || obj.body.length === 0) {
    warnings.push({
      code: "CARD-004",
      message: "Adaptive Card body is empty or missing.",
      path: "$.body",
    });
  }

  const result = {
    valid: errors.length === 0,
    fileType: "adaptive-card",
    errors,
    warnings,
  };

  if (format === "json") {
    logger.info(JSON.stringify(result, null, 2));
  } else {
    if (errors.length > 0) {
      logger.info(`❌ ${String(errors.length)} error(s) found:\n`);
      for (const e of errors) {
        logger.info(`  ${e.code} ${e.path}`);
        logger.info(`    ${e.message}`);
      }
    }
    if (warnings.length > 0) {
      logger.info(`\n⚠️  ${String(warnings.length)} warning(s) found:\n`);
      for (const w of warnings) {
        logger.info(`  ${w.code} ${w.path}`);
        logger.info(`    ${w.message}`);
      }
    }
    if (errors.length === 0 && warnings.length === 0) {
      logger.info("✅ Validation passed — no errors or warnings found.");
    } else if (errors.length === 0) {
      logger.info("\n✅ Validation passed with warnings.");
    } else {
      logger.info(
        `\nSummary: ${String(errors.length)} error(s), ${String(warnings.length)} warning(s)`
      );
    }
  }

  if (!result.valid) {
    process.exitCode = 1;
  }
  return ok(undefined);
}

/**
 * Log validation results in human-readable text format.
 */
function logValidationResult(
  errors: Array<{
    code: string;
    message: string;
    line: number;
    column: number;
    path: string;
    hint?: string;
  }>,
  warnings: Array<{
    code: string;
    message: string;
    line: number;
    column: number;
    path: string;
    hint?: string;
  }>
): void {
  if (errors.length > 0) {
    logger.info(`❌ ${String(errors.length)} error(s) found:\n`);
    for (const e of errors) {
      logger.info(`  ${e.code} [Ln ${String(e.line)}, Col ${String(e.column)}] ${e.path}`);
      logger.info(`    ${e.message}`);
      if (e.hint) {
        logger.info(`    💡 ${e.hint}`);
      }
    }
  }
  if (warnings.length > 0) {
    logger.info(`\n⚠️  ${String(warnings.length)} warning(s) found:\n`);
    for (const w of warnings) {
      logger.info(`  ${w.code} [Ln ${String(w.line)}, Col ${String(w.column)}] ${w.path}`);
      logger.info(`    ${w.message}`);
      if (w.hint) {
        logger.info(`    💡 ${w.hint}`);
      }
    }
  }
  if (errors.length > 0) {
    logger.info(
      `\nSummary: ${String(errors.length)} error(s), ${String(warnings.length)} warning(s)`
    );
  } else if (warnings.length > 0) {
    logger.info("\n✅ Validation passed with warnings.");
  } else {
    logger.info("✅ Validation passed — no errors or warnings found.");
  }
}

class FileValidationError extends Error implements FxError {
  source = "validate";
  timestamp: Date;
  constructor(errorCountOrMsg: number | string, detail?: string) {
    super(
      typeof errorCountOrMsg === "string"
        ? errorCountOrMsg
        : detail
        ? `File validation failed: ${detail}`
        : `File validation found ${String(errorCountOrMsg)} error(s).`
    );
    this.name = "FileValidationError";
    this.timestamp = new Date();
  }
}

function getOptions(): CLICommandOption[] {
  const options = [
    TeamsAppManifestFileOption,
    TeamsAppPackageOption,
    TeamsAppOuputPackageOption,
    TeamsAppOutputFolderOption,
    EnvOption,
    EnvFileOption,
    ProjectFolderOption,
    ValidateMethodOption,
    FileOption,
    OutputFormatOption,
  ];

  return options;
}
