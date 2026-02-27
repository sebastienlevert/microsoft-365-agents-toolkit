// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DiagnosticContext } from "../../diagnostics/diagnostic-reporter";
import { validateGuid, validateMaxLength, getValueAtPath, forEachArrayItem } from "../utils";
import { reportDiagnosticAtPath } from "../../diagnostics/diagnostic-reporter";
import { DiagnosticSeverity } from "../../types";

interface SharePointItem {
  site_id?: string;
  web_id?: string;
  list_id?: string;
  unique_id?: string;
  part_id?: string;
  part_type?: string;
}

interface OneDriveSharePointCapability {
  name: "OneDriveAndSharePoint";
  items_by_sharepoint_ids?: SharePointItem[];
  items_by_url?: Array<{ url: string }>;
}

/**
 * Validate OneDriveAndSharePoint capability
 */
export function validateOneDriveSharePoint(
  ctx: DiagnosticContext,
  content: unknown,
  capabilityPath: (string | number)[]
): void {
  const capability = getValueAtPath(content, capabilityPath) as OneDriveSharePointCapability;
  if (!capability || capability.name !== "OneDriveAndSharePoint") {
    return;
  }

  // Validate items_by_sharepoint_ids
  const spItemsPath = [...capabilityPath, "items_by_sharepoint_ids"];
  const spItems = getValueAtPath(content, spItemsPath);

  if (Array.isArray(spItems)) {
    forEachArrayItem<SharePointItem>(content, spItemsPath, (item, index, itemPath) => {
      // Validate GUIDs
      if (item.site_id !== undefined) {
        validateGuid(ctx, content, [...itemPath, "site_id"], "site_id");
      }
      if (item.web_id !== undefined) {
        validateGuid(ctx, content, [...itemPath, "web_id"], "web_id");
      }
      if (item.list_id !== undefined) {
        validateGuid(ctx, content, [...itemPath, "list_id"], "list_id");
      }
      if (item.unique_id !== undefined) {
        validateGuid(ctx, content, [...itemPath, "unique_id"], "unique_id");
      }

      // Validate part_id max length (256)
      if (item.part_id !== undefined) {
        validateMaxLength(ctx, content, [...itemPath, "part_id"], "part_id", 256);
      }

      // Validate part_type max length (128) and value
      if (item.part_type !== undefined) {
        validateMaxLength(ctx, content, [...itemPath, "part_type"], "part_type", 128);

        // Only "OneNotePart" is allowed
        if (item.part_type !== "OneNotePart") {
          reportDiagnosticAtPath(
            ctx,
            [...itemPath, "part_type"],
            "M365-003",
            `"part_type" must be "OneNotePart"`,
            DiagnosticSeverity.Error
          );
        }
      }
    });
  }

  // Validate items_by_url
  const urlItemsPath = [...capabilityPath, "items_by_url"];
  const urlItems = getValueAtPath(content, urlItemsPath);

  if (Array.isArray(urlItems)) {
    forEachArrayItem<{ url: string }>(content, urlItemsPath, (item, index, itemPath) => {
      // URL validation is handled by validateAbsoluteUrl if needed
      // Schema already validates URL format
    });
  }
}
