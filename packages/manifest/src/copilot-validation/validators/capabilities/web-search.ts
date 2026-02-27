// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DiagnosticContext } from "../../diagnostics/diagnostic-reporter";
import {
  validateAbsoluteUrl,
  validateNoQueryParams,
  validateMaxPathSegments,
  validateArrayMaxLength,
  getValueAtPath,
  forEachArrayItem,
} from "../utils";

interface WebSearchCapability {
  name: "WebSearch";
  sites?: Array<{ url: string }>;
}

/**
 * Validate WebSearch capability
 */
export function validateWebSearch(
  ctx: DiagnosticContext,
  content: unknown,
  capabilityPath: (string | number)[]
): void {
  const capability = getValueAtPath(content, capabilityPath) as WebSearchCapability;
  if (!capability || capability.name !== "WebSearch") {
    return;
  }

  const sitesPath = [...capabilityPath, "sites"];
  const sites = getValueAtPath(content, sitesPath);

  if (!Array.isArray(sites)) {
    return;
  }

  // Max 4 sites
  validateArrayMaxLength(ctx, content, sitesPath, "sites", 4);

  // Validate each site URL
  forEachArrayItem<{ url: string }>(content, sitesPath, (site, index, itemPath) => {
    const urlPath = [...itemPath, "url"];

    // Must be valid absolute URL
    validateAbsoluteUrl(ctx, content, urlPath, "url");

    // Must not contain query parameters
    validateNoQueryParams(ctx, content, urlPath, "url");

    // Max 2 path segments
    validateMaxPathSegments(ctx, content, urlPath, "url", 2);
  });
}
