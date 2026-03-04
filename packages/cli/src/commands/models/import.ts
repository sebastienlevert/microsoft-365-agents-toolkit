// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { CLICommand, CLIContext, err, ok } from "@microsoft/teamsfx-api";
import { ImportProjectInputs, ImportProjectOptions } from "@microsoft/teamsfx-core";
import chalk from "chalk";
import * as path from "path";
import * as uuid from "uuid";
import { getFxCore } from "../../activate";
import { logger } from "../../commonlib/logger";
import { commands } from "../../resource";
import { TelemetryEvent } from "../../telemetry/cliTelemetryEvents";

export function getImportCommand(): CLICommand {
  return {
    name: "import",
    description: commands["import"].description,
    options: [...ImportProjectOptions],
    reservedOptionNamesInInteractiveMode: ["zip-file-path", "folder", "app-name", "overwrite"],
    examples: [
      {
        command: `${process.env.TEAMSFX_CLI_BIN_NAME} import --zip-file-path ./agent-export.zip -n my-agent -i false`,
        description: "Import a declarative agent from an Agent Builder zip file",
      },
    ],
    telemetry: {
      event: TelemetryEvent.ImportProject,
    },
    handler: async (ctx: CLIContext) => {
      const inputs = ctx.optionValues as ImportProjectInputs;
      inputs.projectId = inputs.projectId ?? uuid.v4();
      const core = getFxCore();
      const res = await core.importProject(inputs);
      if (res.isErr()) {
        return err(res.error);
      }
      logger.info(`Project imported at: ${chalk.cyan(path.resolve(res.value.projectPath))}`);
      return ok(undefined);
    },
  };
}
