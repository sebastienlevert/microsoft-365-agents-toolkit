// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  CLICommand,
  CLICommandOption,
  err,
  ok,
  validateCopilotManifest,
} from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as path from "path";
import { logger } from "../../commonlib/logger";
import { TelemetryEvent } from "../../telemetry/cliTelemetryEvents";
import { MissingRequiredOptionError } from "../../error";

const AgentManifestFileOption: CLICommandOption = {
  name: "agent-file",
  type: "string",
  description:
    "Path to the declarative agent manifest JSON file (declarativeAgent.json or ai-plugin.json).",
};

const OutputFormatOption: CLICommandOption = {
  name: "format",
  type: "string",
  description: "Output format for validation results.",
  choices: ["text", "json"],
  default: "text",
};

export const validateAgentCommand: CLICommand = {
  name: "validate-agent",
  description:
    "Validate a declarative agent or API plugin manifest with deep semantic checks (Rego policies + TypeScript validators).",
  options: [AgentManifestFileOption, OutputFormatOption],
  telemetry: {
    event: TelemetryEvent.ValidateManifest,
  },
  examples: [
    {
      command: `${process.env.TEAMSFX_CLI_BIN_NAME} validate-agent --agent-file ./appPackage/declarativeAgent.json`,
      description: "Validate a declarative agent manifest.",
    },
    {
      command: `${process.env.TEAMSFX_CLI_BIN_NAME} validate-agent --agent-file ./appPackage/ai-plugin.json --format json`,
      description: "Validate an API plugin manifest and output results as JSON.",
    },
  ],
  defaultInteractiveOption: false,
  handler: async (ctx) => {
    const inputs = ctx.optionValues as Record<string, string>;
    const agentFile = inputs["agent-file"];

    if (!agentFile) {
      return err(new MissingRequiredOptionError(ctx.command.fullName, "--agent-file"));
    }

    const resolvedPath = path.resolve(agentFile);
    if (!fs.existsSync(resolvedPath)) {
      logger.error(`File not found: ${resolvedPath}`);
      return err(
        new MissingRequiredOptionError(ctx.command.fullName, `--agent-file (${resolvedPath})`)
      );
    }

    const content = fs.readFileSync(resolvedPath, "utf-8");
    const format = inputs["format"] || "text";

    try {
      const result = await validateCopilotManifest(content, { filename: resolvedPath });
      const hasErrors = result.errors.length > 0;

      if (format === "json") {
        logger.info(JSON.stringify(result, null, 2));
      } else {
        if (result.errors.length === 0 && result.warnings.length === 0) {
          logger.info("✅ Validation passed — no errors or warnings found.");
        } else {
          if (result.errors.length > 0) {
            logger.error(`❌ ${String(result.errors.length)} error(s) found:\n`);
            for (const e of result.errors) {
              logger.error(`  ${e.code} [Ln ${String(e.line)}, Col ${String(e.column)}] ${e.path}`);
              logger.error(`    ${e.message}`);
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
        }

        logger.info(
          `\nSummary: ${String(result.errors.length)} error(s), ${String(
            result.warnings.length
          )} warning(s)`
        );
      }

      return hasErrors ? err(new ValidateAgentError(result.errors.length)) : ok(undefined);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error(`Validation failed: ${message}`);
      return err(new ValidateAgentError(0, message));
    }
  },
};

class ValidateAgentError extends Error {
  source = "validate-agent";
  timestamp: Date;
  userData?: string;
  innerError?: unknown;
  categories?: string[];
  constructor(errorCount: number, detail?: string) {
    super(
      detail
        ? `Agent validation failed: ${detail}`
        : `Agent validation found ${String(errorCount)} error(s).`
    );
    this.name = "ValidateAgentError";
    this.timestamp = new Date();
  }
}
