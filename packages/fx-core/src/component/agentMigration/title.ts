// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import path from "path";
import {
  AgentTitleImportReport,
  AgentTitleImportRequest,
  Context,
  err,
  FxError,
  ok,
  Result,
} from "@microsoft/teamsfx-api";
import { MosServiceScope } from "../../common/constants";
import { launchInfoElementTypes } from "../m365/serviceConstant";
import { cancelled, isErrno, migrationError, titleFailure } from "./errors";
import { importPackageSnapshot } from "./import";
import { requireAbsent, safeAncestors } from "./io";
import { object } from "./model";
import { safeName } from "./paths";
import {
  canonicalTitleSnapshot,
  prepareTitlePackage,
  titleDefinition,
  TitlePackageSource,
  titleReport,
} from "./titleSource";
import {
  approvedHttpsUrl,
  titleAssetError,
  titleBytes,
  titleImportLimits,
  titleImportTransport,
  titleJson,
  titleServiceOrigin,
  withTitleDeadline,
} from "./titleTransport";
import { validatePng } from "./validation";

async function destinationReady(destination: string): Promise<Result<undefined, FxError>> {
  const safe = safeName(path.basename(destination));
  if (safe.isErr()) return err(safe.error);
  const absent = await requireAbsent(destination);
  if (absent.isErr()) return err(absent.error);
  let parent = path.dirname(destination);
  for (;;) {
    try {
      const stat = await fs.lstat(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        return err(migrationError("AgentPackagePathInvalid"));
      return safeAncestors(parent);
    } catch (error) {
      if (!isErrno(error, "ENOENT")) return err(migrationError("AgentMigrationIoError", error));
      const name = safeName(path.basename(parent));
      if (name.isErr()) return err(name.error);
      const next = path.dirname(parent);
      if (parent === next) return err(migrationError("AgentPackagePathInvalid"));
      parent = next;
    }
  }
}

async function acquireTitle(
  titleId: string,
  logicalSuffix: string | undefined,
  context: Context,
  signal: AbortSignal
): Promise<Result<TitlePackageSource, FxError>> {
  const origin = titleServiceOrigin();
  if (origin.isErr()) return err(origin.error);
  const provider = context.tokenProvider?.m365TokenProvider;
  if (!provider) return err(migrationError("AgentTitleAuthenticationRequired"));
  let status;
  try {
    status = await provider.getStatus({ scopes: MosServiceScope(), showDialog: false });
  } catch {
    return err(migrationError("AgentTitleAuthenticationRequired"));
  }
  const cancel = cancelled(signal);
  if (cancel) return err(cancel);
  if (
    status.isErr() ||
    status.value.status !== "SignedIn" ||
    typeof status.value.token !== "string" ||
    !status.value.token ||
    /[\r\n]/.test(status.value.token)
  ) {
    return err(migrationError("AgentTitleAuthenticationRequired"));
  }
  const token = status.value.token;
  const client = titleImportTransport.createClient();
  const bootstrap = await titleJson(
    client,
    `${origin.value}/config/v1/environment`,
    titleImportLimits.bootstrapBytes,
    signal,
    token
  );
  if (bootstrap.isErr()) return err(bootstrap.error);
  if (typeof bootstrap.value.titlesServiceUrl !== "string")
    return err(migrationError("AgentTitleSourceInvalid"));
  const endpoint = approvedHttpsUrl(bootstrap.value.titlesServiceUrl, [origin.value]);
  if (endpoint.isErr()) return err(endpoint.error);
  if (new URL(endpoint.value).pathname !== "/")
    return err(titleFailure("AgentTitleSourceUnsupported", "mos-base-path"));
  const url = new URL(
    `/catalog/v1/users/titles/${encodeURIComponent(titleId)}/launchInfo`,
    endpoint.value
  );
  const response = await titleJson(
    client,
    url.href,
    titleImportLimits.snapshotBytes,
    signal,
    token,
    { SupportedElementTypes: launchInfoElementTypes.join(",") }
  );
  if (response.isErr()) return err(response.error);
  const canonical = canonicalTitleSnapshot(response.value);
  if (canonical.isErr()) return err(canonical.error);
  const definition = await titleDefinition(response.value, logicalSuffix);
  if (definition.isErr()) return err(definition.error);
  const largeUri = object(response.value.iconLarge)?.uri;
  if (typeof largeUri !== "string" || !largeUri)
    return err(migrationError("AgentTitleSourceIncomplete"));
  const allowedOrigins = ["https://res.cdn.office.net", "https://store-images.s-microsoft.com"];
  const largeUrl = approvedHttpsUrl(largeUri, allowedOrigins);
  if (largeUrl.isErr()) return err(largeUrl.error);
  const smallIcon = response.value.iconSmall;
  const smallUri = object(smallIcon)?.uri;
  if (smallIcon !== undefined && (typeof smallUri !== "string" || !smallUri))
    return err(migrationError("AgentTitleSourceIncomplete"));
  const smallUrl =
    typeof smallUri === "string" ? approvedHttpsUrl(smallUri, allowedOrigins) : undefined;
  if (smallUrl?.isErr()) return err(smallUrl.error);
  const large = await titleBytes(client, largeUrl.value, titleImportLimits.iconBytes, signal);
  if (large.isErr()) return err(titleAssetError(large.error, signal));
  if (validatePng(large.value, 192).isErr())
    return err(migrationError("AgentTitleSourceIncomplete"));
  let small: Buffer | undefined;
  if (smallUrl?.isOk()) {
    const downloaded = await titleBytes(
      client,
      smallUrl.value,
      titleImportLimits.iconBytes,
      signal
    );
    if (downloaded.isErr()) return err(titleAssetError(downloaded.error, signal));
    if (downloaded.value.length < 24) return err(migrationError("AgentTitleSourceIncomplete"));
    const size = downloaded.value.readUInt32BE(16);
    if (size === 0 || size > 1024 || validatePng(downloaded.value, size).isErr())
      return err(migrationError("AgentTitleSourceIncomplete"));
    small = downloaded.value;
  }
  return prepareTitlePackage(
    titleId,
    response.value,
    canonical.value,
    definition.value.agent,
    large.value,
    small,
    definition.value.schemaAlias,
    signal
  );
}

export async function importAgentFromTitle(
  request: AgentTitleImportRequest,
  context: Context,
  signal?: AbortSignal
): Promise<Result<AgentTitleImportReport, FxError>> {
  const cancel = cancelled(signal);
  if (cancel) return err(cancel);
  if (
    typeof request?.titleId !== "string" ||
    /[\u0000-\u001f\u007f]/.test(request.titleId) ||
    (request.outputPath !== undefined &&
      (typeof request.outputPath !== "string" || !request.outputPath)) ||
    (request.dryRun !== undefined && typeof request.dryRun !== "boolean")
  )
    return err(migrationError("AgentTitleSourceInvalid"));
  const matched = /^([A-Za-z0-9_-]{1,256})(?:\.([A-Za-z0-9_-]{1,128}))?$/.exec(
    request.titleId.trim()
  );
  if (!matched) return err(migrationError("AgentTitleSourceInvalid"));
  const titleId = matched[1];
  const destination = path.resolve(request.outputPath ?? `${titleId}-imported`);
  const ready = await destinationReady(destination);
  if (ready.isErr()) return err(ready.error);
  const acquired = await withTitleDeadline(signal, (boundedSignal) =>
    acquireTitle(titleId, matched[2], context, boundedSignal)
  );
  if (acquired.isErr()) return err(acquired.error);
  const source = acquired.value;
  const imported = await importPackageSnapshot(
    {
      destination,
      dryRun: request.dryRun === true,
      kind: "directory",
      source: source.packageFiles,
      allSourceFiles: source.packageFiles,
      graph: source.graph,
      titleSource: source.source,
    },
    context,
    signal
  );
  return imported.isErr() ? err(imported.error) : ok(titleReport(imported.value, source));
}
