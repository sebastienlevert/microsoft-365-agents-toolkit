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

const AgentFileOption: CLICommandOption = {
  name: "agent-file",
  type: "string",
  description:
    "Path to a standalone declarative agent or API plugin manifest JSON file for deep validation.",
};

const OutputFormatOption: CLICommandOption = {
  name: "format",
  type: "string",
  description: "Output format for agent validation results.",
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
      command: `${process.env.TEAMSFX_CLI_BIN_NAME} validate --agent-file ./appPackage/declarativeAgent.json`,
      description: "Validate a standalone declarative agent manifest.",
    },
  ],
  handler: async (ctx) => {
    const inputs = ctx.optionValues as TeamsAppInputs & Record<string, string>;
    const agentFile = inputs["agent-file"];

    // Standalone agent/plugin validation mode
    if (agentFile) {
      return runAgentValidation(agentFile, inputs["format"] || "text");
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

async function runAgentValidation(
  agentFile: string,
  format: string
): Promise<Result<undefined, FxError>> {
  const resolvedPath = path.resolve(agentFile);
  if (!fs.existsSync(resolvedPath)) {
    logger.error(`File not found: ${resolvedPath}`);
    return err(new AgentValidationError(`File not found: ${resolvedPath}`));
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");

  try {
    const result = await validateCopilotManifest(content, { filename: resolvedPath });
    const hasErrors = result.errors.length > 0;

    if (format === "json") {
      logger.info(JSON.stringify(result, null, 2));
    } else {
      if (result.errors.length > 0) {
        logger.info(`❌ ${String(result.errors.length)} error(s) found:\n`);
        for (const e of result.errors) {
          logger.info(`  ${e.code} [Ln ${String(e.line)}, Col ${String(e.column)}] ${e.path}`);
          logger.info(`    ${e.message}`);
          if (e.hint) {
            logger.info(`    💡 ${e.hint}`);
          }
        }
      }
      if (result.warnings.length > 0) {
        logger.info(`\n⚠️  ${String(result.warnings.length)} warning(s) found:\n`);
        for (const w of result.warnings) {
          logger.info(`  ${w.code} [Ln ${String(w.line)}, Col ${String(w.column)}] ${w.path}`);
          logger.info(`    ${w.message}`);
          if (w.hint) {
            logger.info(`    💡 ${w.hint}`);
          }
        }
      }
      if (hasErrors) {
        logger.info(
          `\nSummary: ${String(result.errors.length)} error(s), ${String(
            result.warnings.length
          )} warning(s)`
        );
      } else if (result.warnings.length > 0) {
        logger.info("\n✅ Validation passed with warnings.");
      } else {
        logger.info("✅ Validation passed — no errors or warnings found.");
      }
    }

    if (hasErrors) {
      process.exitCode = 1;
    }
    return ok(undefined);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Validation failed: ${message}`);
    return err(new AgentValidationError(0, message));
  }
}

class AgentValidationError extends Error implements FxError {
  source = "validate";
  timestamp: Date;
  constructor(errorCountOrMsg: number | string, detail?: string) {
    super(
      typeof errorCountOrMsg === "string"
        ? errorCountOrMsg
        : detail
        ? `Agent validation failed: ${detail}`
        : `Agent validation found ${String(errorCountOrMsg)} error(s).`
    );
    this.name = "AgentValidationError";
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
    AgentFileOption,
    OutputFormatOption,
  ];

  return options;
}
