// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import http from "http";
import { AccountInfo, AuthenticationResult } from "@azure/msal-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeFlowLogin } from "../../../src/commonlib/codeFlowLogin";

class SyntheticLogin extends CodeFlowLogin {
  constructor() {
    super(
      [],
      {
        auth: {
          clientId: "synthetic-title-client",
          authority: "https://login.microsoftonline.com/common",
        },
      },
      0,
      "title-test"
    );
  }
  protected override async loadAccountIdFromCache(): Promise<string | undefined> {
    return undefined;
  }
  protected override async loadTenantIdFromCache(): Promise<string | undefined> {
    return undefined;
  }
}

class CachedSyntheticLogin extends SyntheticLogin {
  protected override async loadAccountIdFromCache(): Promise<string | undefined> {
    return "synthetic-home";
  }
  protected override async loadTenantIdFromCache(): Promise<string | undefined> {
    return "synthetic-tenant";
  }
}

describe("TTI-05: strict silent native token status", () => {
  afterEach(() => vi.restoreAllMocks());
  const account: AccountInfo = {
    homeAccountId: "synthetic-home",
    environment: "login.microsoftonline.com",
    tenantId: "synthetic-tenant",
    username: "synthetic@example.invalid",
    localAccountId: "synthetic-local",
  };
  it.each(["missing-account", "silent-rejection"])(
    "never logs in, logs out or probes connectivity for %s",
    async (mode) => {
      const login = new SyntheticLogin();
      login.account = mode === "missing-account" ? undefined : account;
      vi.spyOn(login, "login").mockRejectedValue(new Error("interactive login forbidden"));
      vi.spyOn(login, "logout").mockRejectedValue(new Error("cache clearing forbidden"));
      vi.spyOn(http, "request").mockImplementation(() => {
        throw new Error("connectivity probe forbidden");
      });
      vi.spyOn(login.pca, "acquireTokenSilent").mockRejectedValue(
        new Error("synthetic silent rejection")
      );
      const result = await login.getTokenByScopes(["synthetic-scope"], false, undefined, true);
      expect(result.isErr()).toBe(true);
      expect(login.login).not.toHaveBeenCalled();
      expect(login.logout).not.toHaveBeenCalled();
      expect(http.request).not.toHaveBeenCalled();
    }
  );
  it.each([false, true])(
    "loads an existing cached account/token without login (cold=%s)",
    async (cold) => {
      const login = cold ? new CachedSyntheticLogin() : new SyntheticLogin();
      if (!cold) login.account = account;
      vi.spyOn(login, "reloadCache");
      vi.spyOn(login.pca, "getAllAccounts").mockResolvedValue([account]);
      const response: AuthenticationResult = {
        authority: "https://login.microsoftonline.com/common",
        uniqueId: "synthetic",
        tenantId: "synthetic-tenant",
        scopes: ["synthetic-scope"],
        account,
        idToken: "",
        idTokenClaims: {},
        accessToken: "synthetic-token",
        fromCache: true,
        expiresOn: new Date(Date.now() + 60000),
        correlationId: "synthetic-correlation",
        tokenType: "Bearer",
      };
      vi.spyOn(login.pca, "acquireTokenSilent").mockResolvedValue(response);
      vi.spyOn(login, "login");
      const result = await login.getTokenByScopes(["synthetic-scope"], false, undefined, true);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe("synthetic-token");
      expect(login.account).toEqual(account);
      if (cold) expect(login.reloadCache).toHaveBeenCalledOnce();
      expect(login.login).not.toHaveBeenCalled();
    }
  );
});
