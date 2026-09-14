// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { spawnSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkspace } from "./agentPackage.fixtures";

describe("TTI-10: packaged Title-ID command process boundaries", () => {
  let workspace: string;
  beforeEach(async () => {
    workspace = await createWorkspace();
  });
  afterEach(async () => {
    await fs.remove(workspace);
  });

  function run(args: string[]) {
    return spawnSync(
      process.execPath,
      [
        "--require",
        path.join(__dirname, "agentTitle.signedout.cjs"),
        path.resolve(__dirname, "..", "..", "..", "cli.js"),
        ...args,
      ],
      { cwd: workspace, encoding: "utf8", input: "", timeout: 30000, maxBuffer: 1024 * 1024 }
    );
  }

  it("returns auth-required JSON with no current-user cache access or login", () => {
    const result = run([
      "import",
      "agent",
      "--title-id",
      "SyntheticTitle_001",
      "--output",
      path.join(workspace, "clone"),
      "--format",
      "json",
      "-i",
      "false",
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr + result.stdout).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: false,
      error: { name: "AgentTitleAuthenticationRequired" },
    });
  });

  it("documents the new selector and rejects conflicting sources before auth", () => {
    const help = run(["import", "agent", "--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--title-id");
    const conflict = run([
      "import",
      "agent",
      "--source",
      "source.zip",
      "--title-id",
      "SyntheticTitle_001",
      "--format",
      "json",
      "-i",
      "false",
    ]);
    expect(conflict.status).toBe(1);
    expect(JSON.parse(conflict.stdout).success).toBe(false);
    expect(conflict.stderr).not.toContain("opening default web browser");
  });
});
