// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { AgentImportRequest, CLICommand, err } from "@microsoft/teamsfx-api";
import { ArgumentConflictError, MissingRequiredOptionError } from "../../error";
import { commands } from "../../resource";
import { agentPackageOptions, runAgentPackageOperation, titleAgentCliDeps } from "./agentPackage";

export const importAgentCommand: CLICommand = {
  name: "agent",
  description: commands["import.agent"].description,
  defaultInteractiveOption: false,
  options: [
    {
      name: "source",
      questionName: "sourcePath",
      type: "string",
      description: commands["import.agent"].options.source,
    },
    {
      name: "title-id",
      questionName: "titleId",
      type: "string",
      description: commands["import.agent"].options.titleId,
    },
    {
      name: "output",
      questionName: "outputPath",
      type: "string",
      description: commands["import.agent"].options.output,
    },
    ...agentPackageOptions,
  ],
  examples: [
    {
      command:
        "atk import agent --source exported-agent.zip --output new-agent --format json -i false",
      description: commands["import.agent"].example,
    },
    {
      command:
        "atk import agent --title-id SyntheticTitle-001 --output new-agent --format json -i false",
      description: commands["import.agent"].titleExample,
    },
  ],
  handler: async (context) => {
    const { sourcePath, titleId, outputPath, dryRun } = context.optionValues;
    if (sourcePath !== undefined && titleId !== undefined) {
      return err(new ArgumentConflictError(context.command.fullName, "--source", "--title-id"));
    }
    if (titleId !== undefined) {
      if (typeof titleId !== "string" || titleId.length === 0) {
        return err(new MissingRequiredOptionError(context.command.fullName, "--title-id"));
      }
      return runAgentPackageOperation(
        context,
        (client, options) =>
          client.importAgentFromTitle(
            {
              titleId,
              outputPath: typeof outputPath === "string" ? outputPath : undefined,
              dryRun: dryRun === true,
            },
            options
          ),
        titleAgentCliDeps.getStatus
      );
    }
    if (typeof sourcePath !== "string" || sourcePath.length === 0) {
      return err(
        new MissingRequiredOptionError(context.command.fullName, "--source or --title-id")
      );
    }
    const request: AgentImportRequest = {
      sourcePath,
      outputPath: typeof outputPath === "string" ? outputPath : undefined,
      dryRun: dryRun === true,
    };
    return runAgentPackageOperation(context, (client, options) =>
      client.importAgentPackage(request, options)
    );
  },
};
