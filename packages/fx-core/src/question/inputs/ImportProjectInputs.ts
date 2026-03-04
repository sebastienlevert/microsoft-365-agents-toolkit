// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Inputs } from "@microsoft/teamsfx-api";

export interface ImportProjectInputs extends Inputs {
  /** @description Path to the Agent Builder zip file to import */
  "zip-file-path"?: string;
  /** @description Application name. Defaults to the agent name from the manifest */
  "app-name"?: string;
  /** @description Overwrite existing output directory if it exists */
  overwrite?: boolean;
  /** @description M365 title ID to import directly from Copilot */
  "title-id"?: string;
  /** @description Azure AD app registration client ID for Copilot API access */
  "client-id"?: string;
}
