// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DiagnosticContext } from "../../diagnostics/diagnostic-reporter";
import {
  validateAbsoluteUrl,
  validateArrayMaxLength,
  getValueAtPath,
  forEachArrayItem,
} from "../utils";

interface TeamsMessagesCapability {
  name: "TeamsMessages";
  urls?: Array<{ url: string }>;
}

/**
 * Validate TeamsMessages capability
 */
export function validateTeamsMessages(
  ctx: DiagnosticContext,
  content: unknown,
  capabilityPath: (string | number)[]
): void {
  const capability = getValueAtPath(content, capabilityPath) as TeamsMessagesCapability;
  if (!capability || capability.name !== "TeamsMessages") {
    return;
  }

  const urlsPath = [...capabilityPath, "urls"];
  const urls = getValueAtPath(content, urlsPath);

  if (!Array.isArray(urls)) {
    return;
  }

  // Max 5 URLs per docs
  validateArrayMaxLength(ctx, content, urlsPath, "urls", 5);

  // Validate each URL
  forEachArrayItem<{ url: string }>(content, urlsPath, (item, index, itemPath) => {
    const urlPath = [...itemPath, "url"];
    validateAbsoluteUrl(ctx, content, urlPath, `urls[${index}].url`);
  });
}
