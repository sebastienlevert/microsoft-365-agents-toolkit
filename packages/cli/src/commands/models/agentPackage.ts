// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AgentMigrationReport,
  AgentTitleImportReport,
  CLICommandOption,
  CLIContext,
  FxError,
  LogLevel,
  M365TokenProvider,
  Result,
  SystemError,
  Tools,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import {
  FxCoreClient,
  FxCoreExecutionOptions,
  IFxCoreClient,
  maskSecret,
} from "@microsoft/teamsfx-core";
import { CLILogger } from "../../commonlib/logger";
import { M365Login } from "../../commonlib/m365Login";
import { cliSource } from "../../constants";
import { commands, errors } from "../../resource";
import { writeLocalAgentOutput } from "../localAgent";

export const agentPackageOptions: CLICommandOption[] = [
  {
    name: "dry-run",
    questionName: "dryRun",
    type: "boolean",
    description: commands["agentPackage"].options.dryRun,
  },
  {
    name: "format",
    type: "string",
    choices: ["json"],
    description: commands["agentPackage"].options.format,
  },
];

class LocalAgentLogger extends CLILogger {
  override log(level: LogLevel, message: string): void {
    if (level >= this.logLevel) {
      process.stderr.write(maskSecret(message) + "\n");
    }
  }
}

export const titleAgentCliDeps = {
  getStatus: ((request) =>
    M365Login.getInstance().getStatus(request)) satisfies M365TokenProvider["getStatus"],
};

export function createLocalAgentClient(getStatus?: M365TokenProvider["getStatus"]): IFxCoreClient {
  // These operations have no UI/auth/execution contract. Fail closed if that boundary regresses.
  const unavailable = (): never => {
    throw new SystemError({
      source: cliSource,
      name: "LocalAgentHostOperationUnavailable",
      message: errors["error.LocalAgentHostOperationUnavailable"],
    });
  };
  const tools: Tools = {
    logProvider: new LocalAgentLogger(),
    tokenProvider: {
      azureAccountProvider: {
        getIdentityCredentialAsync: unavailable,
        getIdentityCredential: unavailable,
        signout: unavailable,
        switchTenant: unavailable,
        setStatusChangeMap: unavailable,
        removeStatusChangeMap: unavailable,
        getJsonObject: unavailable,
        listSubscriptions: unavailable,
        setSubscription: unavailable,
        getAccountInfo: unavailable,
        getSelectedSubscription: unavailable,
      },
      m365TokenProvider: {
        getAccessToken: unavailable,
        getJsonObject: unavailable,
        getStatus: getStatus ?? unavailable,
        signout: unavailable,
        switchTenant: unavailable,
        setStatusChangeMap: unavailable,
        removeStatusChangeMap: unavailable,
      },
    },
    ui: {
      confirm: unavailable,
      selectOption: unavailable,
      selectOptions: unavailable,
      inputText: unavailable,
      selectFile: unavailable,
      selectFiles: unavailable,
      selectFolder: unavailable,
      selectFileOrInput: unavailable,
      openUrl: unavailable,
      showMessage: unavailable,
      createProgressBar: unavailable,
      runCommand: unavailable,
    },
  };
  return new FxCoreClient(tools);
}

export async function runAgentPackageOperation<
  T extends AgentMigrationReport | AgentTitleImportReport,
>(
  context: CLIContext,
  operation: (
    client: IFxCoreClient,
    options: FxCoreExecutionOptions
  ) => Promise<Result<T, FxError>>,
  getStatus?: M365TokenProvider["getStatus"]
): Promise<Result<undefined, FxError>> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGINT", cancel);
  try {
    const result = await operation(createLocalAgentClient(getStatus), {
      signal: controller.signal,
    });
    if (result.isErr()) return err(result.error);
    const json = context.optionValues.format === "json";
    await writeLocalAgentOutput(
      JSON.stringify(
        json ? { success: true, result: result.value } : result.value,
        null,
        json ? 0 : 2
      )
    );
    return ok(undefined);
  } finally {
    process.removeListener("SIGINT", cancel);
  }
}
