// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLICommandOption } from "@microsoft/teamsfx-api";

export const ImportProjectOptions: CLICommandOption[] = [
  {
    name: "zip-file-path",
    type: "string",
    shortName: "z",
    description: "Path to the Agent Builder zip file to import.",
    required: true,
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
];
