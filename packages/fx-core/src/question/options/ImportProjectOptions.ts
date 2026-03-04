// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLICommandOption } from "@microsoft/teamsfx-api";

export const ImportProjectOptions: CLICommandOption[] = [
  {
    name: "zip-file-path",
    type: "string",
    shortName: "z",
    description: "Path to the Agent Builder zip file to import. Alternative to --title-id.",
  },
  {
    name: "folder",
    type: "string",
    shortName: "f",
    description: "Directory where the project folder will be created in.",
    required: true,
    default: "./",
  },
  {
    name: "app-name",
    type: "string",
    shortName: "n",
    description: "Application name. Defaults to the agent name from the manifest.",
  },
  {
    name: "overwrite",
    type: "boolean",
    description: "Overwrite existing output directory if it exists.",
    default: false,
  },
  {
    name: "title-id",
    type: "string",
    shortName: "t",
    description:
      "M365 title ID of the agent to import directly from Copilot. Alternative to --zip-file-path.",
  },
  {
    name: "client-id",
    type: "string",
    shortName: "c",
    description:
      "[Temporary] Azure AD app registration client ID with CopilotPackages.Read.All delegated permission. Required when using --title-id. This option will be removed once the permission is added to the built-in app.",
  },
];
