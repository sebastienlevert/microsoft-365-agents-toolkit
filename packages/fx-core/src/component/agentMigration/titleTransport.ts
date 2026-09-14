// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios, { AxiosHeaders, AxiosInstance } from "axios";
import { err, FxError, ok, Result } from "@microsoft/teamsfx-api";
import {
  getResourceServiceEndpoint,
  ResourceServiceType,
  serviceEndpoints,
} from "../../common/constants";
import { getSovereignCloudEnvironment } from "../../common/accountUtils";
import { cancelled, migrationError, titleFailure } from "./errors";
import { JsonObject, parseJson } from "./model";

export const titleImportLimits = Object.freeze({
  totalTimeoutMs: 60000,
  requestTimeoutMs: 15000,
  bootstrapBytes: 64 * 1024,
  snapshotBytes: 1024 * 1024,
  iconBytes: 1024 * 1024,
  jsonDepth: 32,
});

/** Only the HTTP adapter is replaced by fixtures; parsing and acquisition remain real. */
export const titleImportTransport = { createClient: (): AxiosInstance => axios.create() };

export function titleServiceOrigin(): Result<string, FxError> {
  const endpoint = getResourceServiceEndpoint(ResourceServiceType.MOS3);
  const approved = serviceEndpoints[getSovereignCloudEnvironment()][ResourceServiceType.MOS3];
  return endpoint === approved
    ? ok(approved)
    : err(titleFailure("AgentTitleSourceUnsupported", "mos-origin"));
}

export function approvedHttpsUrl(
  value: string,
  origins: readonly string[]
): Result<string, FxError> {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !origins.includes(url.origin) ||
      /[\u0000-\u0020\u007f\\]/.test(value)
    ) {
      return err(titleFailure("AgentTitleSourceUnsupported", "url-policy"));
    }
    return ok(url.href);
  } catch {
    return err(titleFailure("AgentTitleSourceInvalid", "url-invalid"));
  }
}

export async function titleBytes(
  client: AxiosInstance,
  url: string,
  limit: number,
  signal: AbortSignal,
  token?: string,
  params?: Record<string, string>
): Promise<Result<Buffer, FxError>> {
  const cancel = cancelled(signal);
  if (cancel) return err(cancel);
  try {
    client.defaults.auth = undefined;
    client.defaults.baseURL = undefined;
    for (const key of Object.keys(client.defaults.headers)) delete client.defaults.headers[key];
    client.defaults.headers.common = {};
    client.defaults.headers.get = {};
    client.defaults.headers.head = {};
    client.defaults.headers.delete = {};
    client.defaults.headers.post = {};
    client.defaults.headers.put = {};
    client.defaults.headers.patch = {};
    const response = await client.get<unknown>(url, {
      responseType: "arraybuffer",
      allowAbsoluteUrls: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      maxRedirects: 0,
      maxContentLength: limit,
      maxBodyLength: 0,
      timeout: titleImportLimits.requestTimeoutMs,
      params,
      signal,
      withCredentials: false,
      validateStatus: (status) => status === 200,
    });
    if (response.status !== 200) return err(migrationError("AgentTitleRequestFailed"));
    const declaredLength =
      response.headers instanceof AxiosHeaders
        ? response.headers.get("content-length")
        : Object.entries(response.headers).find(
            ([name]) => name.toLowerCase() === "content-length"
          )?.[1];
    if (
      declaredLength !== undefined &&
      (!/^\d+$/.test(String(declaredLength)) || Number(declaredLength) > limit)
    ) {
      return err(migrationError("AgentTitleRequestFailed"));
    }
    const body = response.data;
    if (!(body instanceof Uint8Array) && !(body instanceof ArrayBuffer)) {
      return err(migrationError("AgentTitleSourceInvalid"));
    }
    const bytes =
      body instanceof ArrayBuffer
        ? Buffer.from(body)
        : Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    if (bytes.length > limit) return err(migrationError("AgentTitleRequestFailed"));
    return ok(bytes);
  } catch (error) {
    // Axios errors retain bearer headers and URLs; do not put them in an FxError.
    const cancel = cancelled(signal);
    if (cancel) return err(cancel);
    if (token && axios.isAxiosError(error) && error.response?.status === 401) {
      return err(migrationError("AgentTitleAuthenticationRequired"));
    }
    const failure = migrationError("AgentTitleRequestFailed");
    if (
      axios.isAxiosError(error) &&
      (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")
    ) {
      failure.telemetryProperties = { reason: "timeout" };
    }
    return err(failure);
  }
}

export function titleAssetError(error: FxError, signal: AbortSignal): FxError {
  return (
    cancelled(signal) ??
    (error.telemetryProperties?.reason === "timeout"
      ? error
      : migrationError("AgentTitleSourceIncomplete"))
  );
}

export async function titleJson(
  client: AxiosInstance,
  url: string,
  limit: number,
  signal: AbortSignal,
  token: string,
  params?: Record<string, string>
): Promise<Result<JsonObject, FxError>> {
  const bytes = await titleBytes(client, url, limit, signal, token, params);
  if (bytes.isErr()) return err(bytes.error);
  const parsed = parseJson(bytes.value);
  return parsed.isOk() ? ok(parsed.value) : err(migrationError("AgentTitleSourceInvalid"));
}

export async function withTitleDeadline<T>(
  signal: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<Result<T, FxError>>
): Promise<Result<T, FxError>> {
  const cancel = cancelled(signal);
  if (cancel) return err(cancel);
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, titleImportLimits.totalTimeoutMs);
  const forward = () => controller.abort();
  signal?.addEventListener("abort", forward, { once: true });
  let onAbort: (() => void) | undefined;
  try {
    const interrupted = new Promise<Result<T, FxError>>((resolve) => {
      onAbort = () =>
        resolve(
          err(expired ? migrationError("AgentTitleRequestFailed") : cancelled(controller.signal)!)
        );
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    return await Promise.race([operation(controller.signal), interrupted]);
  } catch {
    return err(migrationError("AgentTitleRequestFailed"));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
    if (onAbort) controller.signal.removeEventListener("abort", onAbort);
  }
}
