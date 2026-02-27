#!/usr/bin/env node
/**
 * Build script to compile Rego policies to WASM bundle
 *
 * This script:
 * 1. Finds or downloads the OPA binary
 * 2. Compiles all Rego policies to a WASM bundle
 * 3. Extracts the bundle to rules/bundle.wasm
 */

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const zlib = require("zlib");

const RULES_DIR = path.join(__dirname, "..", "src", "copilot-validation", "rules");
const BUNDLE_TAR = path.join(RULES_DIR, "bundle.tar.gz");
const BUNDLE_WASM = path.join(RULES_DIR, "bundle.wasm");

const IS_WINDOWS = process.platform === "win32";
const OPA_FILENAME = IS_WINDOWS ? "opa.exe" : "opa";
const TEMP_DIR = os.tmpdir();

// OPA entrypoints to include in the bundle
const ENTRYPOINTS = [
  "m365/v1_0/agent/deny",
  "m365/v1_0/capabilities/deny",
  "m365/v1_2/agent/deny",
  "m365/v1_2/capabilities/deny",
  "m365/v1_3/agent/deny",
  "m365/v1_3/capabilities/deny",
  "m365/v1_4/agent/deny",
  "m365/v1_4/capabilities/deny",
  "m365/v1_5/agent/deny",
  "m365/v1_5/capabilities/deny",
  "m365/v1_6/agent/deny",
  "m365/v1_6/capabilities/deny",
  "m365/api_plugin/v2_1/deny",
  "m365/api_plugin/v2_2/deny",
  "m365/api_plugin/v2_3/deny",
  "m365/api_plugin/v2_4/deny",
];

/**
 * Find OPA binary in common locations
 */
function findOpa() {
  const candidates = IS_WINDOWS
    ? [path.join(TEMP_DIR, OPA_FILENAME), path.join(__dirname, "..", "bin", OPA_FILENAME)]
    : [
        path.join(TEMP_DIR, OPA_FILENAME),
        "/usr/local/bin/opa",
        "/usr/bin/opa",
        path.join(__dirname, "..", "bin", "opa"),
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        execSync(`"${candidate}" version`, { stdio: "ignore" });
        return candidate;
      } catch {
        // Not executable
      }
    }
  }

  // Try PATH
  try {
    const whichCmd = IS_WINDOWS ? "where opa" : "which opa";
    execSync(whichCmd, { stdio: "ignore" });
    return "opa";
  } catch {
    return null;
  }
}

/**
 * Download OPA binary
 */
function downloadOpa() {
  const opaPath = path.join(TEMP_DIR, OPA_FILENAME);

  if (fs.existsSync(opaPath)) {
    console.log(`OPA already downloaded at ${opaPath}`);
    return opaPath;
  }

  console.log("Downloading OPA...");

  const platform = process.platform;
  const arch = process.arch === "arm64" ? "arm64_static" : "amd64";

  let url;
  if (platform === "darwin") {
    const darwinArch = process.arch === "arm64" ? "arm64_static" : "amd64";
    url = `https://openpolicyagent.org/downloads/latest/opa_darwin_${darwinArch}`;
  } else if (platform === "linux") {
    const linuxArch = process.arch === "arm64" ? "arm64_static" : "amd64_static";
    url = `https://openpolicyagent.org/downloads/latest/opa_linux_${linuxArch}`;
  } else if (platform === "win32") {
    url = "https://openpolicyagent.org/downloads/latest/opa_windows_amd64.exe";
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  // Use curl on Unix, PowerShell on Windows
  if (IS_WINDOWS) {
    execSync(`powershell -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${opaPath}'"`, {
      stdio: "inherit",
    });
  } else {
    execSync(`curl -L -o "${opaPath}" "${url}"`, { stdio: "inherit" });
    execSync(`chmod +x "${opaPath}"`);
  }

  console.log("OPA downloaded successfully");
  return opaPath;
}

/**
 * Build WASM bundle from Rego policies
 */
function buildWasm(opaPath) {
  console.log("Compiling Rego policies to WASM...");

  const entrypointArgs = ENTRYPOINTS.map((e) => `-e ${e}`).join(" ");
  const cmd = `"${opaPath}" build -t wasm ${entrypointArgs} "${RULES_DIR}" -o "${BUNDLE_TAR}"`;

  try {
    execSync(cmd, { stdio: "inherit", shell: true });
  } catch (error) {
    console.error("Failed to compile Rego policies");
    process.exit(1);
  }

  // Extract the WASM from the bundle using tar (cross-platform via Node.js child process)
  console.log("Extracting WASM bundle...");
  if (IS_WINDOWS) {
    // Windows: use tar (available in Windows 10+) or PowerShell
    try {
      execSync(`tar -xzf "${BUNDLE_TAR}" -C "${RULES_DIR}"`, { stdio: "inherit", shell: true });
    } catch {
      // Fallback to PowerShell if tar not available
      execSync(
        `powershell -Command "Expand-Archive -Path '${BUNDLE_TAR}' -DestinationPath '${RULES_DIR}' -Force"`,
        { stdio: "inherit" }
      );
    }
  } else {
    execSync(`tar -xzf "${BUNDLE_TAR}" -C "${RULES_DIR}"`, { stdio: "inherit" });
  }

  // Move policy.wasm to bundle.wasm
  const policyWasm = path.join(RULES_DIR, "policy.wasm");
  if (fs.existsSync(policyWasm)) {
    fs.renameSync(policyWasm, BUNDLE_WASM);
  }

  // Clean up
  const cleanupFiles = ["bundle.tar.gz", ".manifest", "data.json"];
  for (const file of cleanupFiles) {
    const filePath = path.join(RULES_DIR, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // Remove nested rules directory if created
  const nestedRules = path.join(RULES_DIR, "rules");
  if (fs.existsSync(nestedRules)) {
    fs.rmSync(nestedRules, { recursive: true });
  }

  // Remove nested home directory if created (from tar extracting absolute paths)
  const nestedHome = path.join(RULES_DIR, "home");
  if (fs.existsSync(nestedHome)) {
    fs.rmSync(nestedHome, { recursive: true });
  }

  console.log(`WASM bundle created: ${BUNDLE_WASM}`);
}

// Main
function main() {
  // Check if bundle.wasm already exists and is recent
  if (fs.existsSync(BUNDLE_WASM)) {
    const wasmStat = fs.statSync(BUNDLE_WASM);

    // Check if any .rego file is newer than the bundle
    let needsRebuild = false;
    const checkDir = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          if (checkDir(filePath)) return true;
        } else if (file.endsWith(".rego")) {
          if (stat.mtime > wasmStat.mtime) {
            console.log(`Rego file modified: ${filePath}`);
            return true;
          }
        }
      }
      return false;
    };

    needsRebuild = checkDir(RULES_DIR);

    if (!needsRebuild) {
      console.log("WASM bundle is up to date");
      return;
    }
  }

  // Find or download OPA
  let opaPath = findOpa();
  if (!opaPath) {
    opaPath = downloadOpa();
  }

  console.log(`Using OPA: ${opaPath}`);

  // Build the WASM bundle
  buildWasm(opaPath);
}

main();
