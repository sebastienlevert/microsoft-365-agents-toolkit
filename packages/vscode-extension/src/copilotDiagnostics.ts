// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Provides real-time diagnostics for declarative agent and API plugin
 * manifests by running copilot-validation on file open/save/change.
 *
 * Also validates .txt/.md instruction files in appPackage/ folders,
 * and provides an LLM-powered "Analyze Agent Instructions" command
 * that uses the VS Code Language Model API for deep semantic analysis.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CopilotValidation, validateCopilotManifest } from "@microsoft/teamsfx-api";
import { envUtil, environmentNameManager } from "@microsoft/teamsfx-core";
import { getSystemInputs } from "./utils/systemEnvUtils";

const DIAGNOSTIC_SOURCE = "Microsoft 365 Agents Toolkit";
const LLM_DIAGNOSTIC_SOURCE = "Microsoft 365 Agents Toolkit (AI)";

// Regex to match ${{VAR_NAME}} patterns
const envVarRegex = /\${{ *([a-zA-Z_][a-zA-Z0-9_]*) *}}/g;

// Schema URL prefixes used to identify declarative agent / API plugin files
const DA_SCHEMA_PREFIX = "developer.microsoft.com/json-schemas/copilot/declarative-agent";
const PLUGIN_SCHEMA_PREFIX = "developer.microsoft.com/json-schemas/copilot/plugin";

/**
 * Load environment variables for all environments in the current project.
 * Reads from VS Code editor buffers when available (for live updates),
 * falling back to disk via envUtil.readEnv.
 * Returns a map of envName → { key: value }.
 */
async function loadAllEnvVars(): Promise<Record<string, Record<string, string>>> {
  try {
    const inputs = getSystemInputs();
    if (!inputs.projectPath) {
      return {};
    }
    const listRes = await envUtil.listEnv(inputs.projectPath);
    if (listRes.isErr()) {
      return {};
    }
    const result: Record<string, Record<string, string>> = {};
    for (const envName of listRes.value) {
      // Check if the env file is open in an editor — use its live buffer
      const liveVars = readEnvFromEditorBuffer(envName);
      if (liveVars) {
        result[envName] = liveVars;
      } else {
        const envRes = await envUtil.readEnv(inputs.projectPath, envName, false);
        if (envRes.isOk()) {
          result[envName] = envRes.value;
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Try to read env vars from an open VS Code editor buffer for the given env name.
 * Returns parsed key-value pairs if the file is open, or undefined to fall back to disk.
 */
function readEnvFromEditorBuffer(envName: string): Record<string, string> | undefined {
  const suffix = `.env.${envName}`;
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.uri.fsPath.endsWith(suffix) && !doc.isClosed) {
      return parseDotEnv(doc.getText());
    }
  }
  return undefined;
}

/**
 * Simple .env file parser: extracts KEY=VALUE pairs, ignoring comments and blank lines.
 */
function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      result[key] = value;
    }
  }
  return result;
}

/**
 * Expand ${{VAR}} patterns in content using env vars.
 * A variable is "unresolved" only when the key does NOT exist in the env.
 * An empty string value IS a valid resolution.
 */
function expandEnvVars(
  content: string,
  envs: Record<string, string>
): { resolved: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const resolved = content.replace(envVarRegex, (match, varName) => {
    if (varName in envs) {
      return envs[varName];
    }
    unresolved.push(varName);
    return match;
  });
  return { resolved, unresolved: [...new Set(unresolved)] };
}

/**
 * Register a diagnostic provider that validates declarative agent and API
 * plugin JSON files whenever they are opened, saved, or changed.
 * Also registers the "Analyze Agent Instructions" LLM command.
 */
export function registerCopilotDiagnostics(
  context: vscode.ExtensionContext
): vscode.DiagnosticCollection {
  const collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  const llmCollection = vscode.languages.createDiagnosticCollection(LLM_DIAGNOSTIC_SOURCE);

  // Register the LLM analysis command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "m365AgentsToolkit.analyzeAgentInstructions",
      () => void runLLMAnalysis(llmCollection)
    )
  );

  // Match .env.{name} and .env.{name}.user files
  const isEnvFile = (doc: vscode.TextDocument) =>
    /[\\/]\.env\.[\w-]+(\.user)?$/.test(doc.uri.fsPath);

  // Debounced revalidation of all manifests — coalesces rapid triggers
  // (save handler, file watcher, editor changes) into a single validation run
  // to prevent race conditions where competing runs cancel each other via the
  // sequence counter, leaving stale or incomplete diagnostics.
  let envRevalidateTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleEnvRevalidation = (delay = 150) => {
    if (envRevalidateTimer) {
      clearTimeout(envRevalidateTimer);
    }
    envRevalidateTimer = setTimeout(() => {
      envRevalidateTimer = undefined;
      revalidateAllManifests(collection);
    }, delay);
  };

  // Validate on open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      validateDocument(doc, collection);
    })
  );

  // Validate on save — also revalidate all manifests when an env file is saved
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isEnvFile(doc)) {
        scheduleEnvRevalidation();
      } else {
        validateDocument(doc, collection);
      }
    })
  );

  // Validate on change (debounced per document).
  // When an .env.* file is edited in the editor, revalidate all manifests
  // so diagnostics update live without requiring a save.
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isEnvFile(e.document)) {
        scheduleEnvRevalidation(500);
      } else {
        const docKey = e.document.uri.toString();
        const existing = debounceTimers.get(docKey);
        if (existing) {
          clearTimeout(existing);
        }
        debounceTimers.set(
          docKey,
          setTimeout(() => {
            debounceTimers.delete(docKey);
            validateDocument(e.document, collection);
          }, 500)
        );
      }
    })
  );

  // Validate all already-open documents
  for (const doc of vscode.workspace.textDocuments) {
    validateDocument(doc, collection);
  }

  // Watch .env.* files on disk — re-validate all open manifests when env vars change
  // (covers external edits, git checkout, etc.)
  const envWatcher = vscode.workspace.createFileSystemWatcher("**/.env.*");
  const scheduleFromDisk = () => scheduleEnvRevalidation();
  context.subscriptions.push(envWatcher.onDidChange(scheduleFromDisk));
  context.subscriptions.push(envWatcher.onDidCreate(scheduleFromDisk));
  context.subscriptions.push(envWatcher.onDidDelete(scheduleFromDisk));
  context.subscriptions.push(envWatcher);

  // Clear diagnostics when a document is closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      collection.delete(doc.uri);
      llmCollection.delete(doc.uri);
    })
  );

  context.subscriptions.push(collection);
  context.subscriptions.push(llmCollection);
  return collection;
}

function validateDocument(doc: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
  if (isCopilotManifest(doc)) {
    void runValidation(doc, collection);
  } else if (isInstructionsFile(doc)) {
    void runInstructionsFileValidation(doc, collection);
  }
}

/**
 * Re-validate all open manifest and instruction documents.
 * Called when env files change (editor edits, disk saves, external changes).
 */
function revalidateAllManifests(collection: vscode.DiagnosticCollection): void {
  for (const doc of vscode.workspace.textDocuments) {
    // Only revalidate manifests — instruction files don't use env vars
    // and are validated independently on their own open/save/change events.
    if (isCopilotManifest(doc)) {
      void runValidation(doc, collection);
    }
  }
}

function isCopilotManifest(doc: vscode.TextDocument): boolean {
  if (doc.languageId !== "json" && doc.languageId !== "jsonc") {
    return false;
  }
  const text = doc.getText();
  return text.includes(DA_SCHEMA_PREFIX) || text.includes(PLUGIN_SCHEMA_PREFIX);
}

/**
 * Check if a document is a .txt or .md file inside an appPackage folder.
 */
function isInstructionsFile(doc: vscode.TextDocument): boolean {
  const fsPath = doc.uri.fsPath;
  const ext = path.extname(fsPath).toLowerCase();
  if (ext !== ".txt" && ext !== ".md") {
    return false;
  }
  // Must be inside an appPackage folder
  const normalized = fsPath.replace(/\\/g, "/");
  return normalized.includes("/appPackage/");
}

/**
 * Run validation on a standalone .txt/.md instruction file.
 * Finds the parent DA manifest, runs the full validation pipeline,
 * and remaps instruction-related diagnostics to this file.
 */
async function runInstructionsFileValidation(
  doc: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): Promise<void> {
  try {
    const text = doc.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    // 1. Run static instructions text analysis directly on the file
    const rawDiags = CopilotValidation.analyzeInstructionsText(text);
    for (const d of rawDiags) {
      const range = new vscode.Range(
        d.range.start.line,
        d.range.start.character,
        d.range.end.line,
        Math.min(d.range.end.character, 1000)
      );
      const severity = mapSeverity(d.severity ?? 1);
      const diag = new vscode.Diagnostic(range, d.message, severity);
      diag.source = DIAGNOSTIC_SOURCE;
      diag.code = d.code;
      diagnostics.push(diag);
    }

    // 2. Find the parent DA manifest and run full validation pipeline
    const agentManifest = findAgentManifestForFile(doc.uri.fsPath);
    if (agentManifest) {
      const result = await validateCopilotManifest(agentManifest.content, {
        filename: agentManifest.path,
      });

      // Extract instruction-related diagnostics and remap to this file
      const instrDiags = [...result.errors, ...result.warnings].filter(
        (e) => e.path.includes("instructions") || (e.code >= "M365-010" && e.code <= "M365-019")
      );

      const lines = text.split("\n");
      for (const e of instrDiags) {
        // Skip if we already have a static diagnostic with the same code+message
        if (diagnostics.some((d) => d.code === e.code && d.message === e.message)) {
          continue;
        }
        // Try to locate the relevant text in the instruction file
        const range = findRangeInText(lines, e.message, e.hint);
        const severity = result.errors.includes(e)
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning;
        const diag = new vscode.Diagnostic(range, e.message, severity);
        diag.source = DIAGNOSTIC_SOURCE;
        diag.code = e.code;
        diagnostics.push(diag);
      }
    }

    collection.set(doc.uri, diagnostics);
  } catch {
    // Best-effort
  }
}

function mapSeverity(severity: number): vscode.DiagnosticSeverity {
  switch (severity) {
    case 1:
      return vscode.DiagnosticSeverity.Error;
    case 2:
      return vscode.DiagnosticSeverity.Warning;
    case 3:
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Hint;
  }
}

/**
 * Try to find a quoted snippet or keywords from the diagnostic message
 * in the instruction file text, returning a precise range.
 */
function findRangeInText(lines: string[], message: string, hint?: string): vscode.Range {
  // Extract quoted strings from the message as search candidates
  const quoted = [...message.matchAll(/"([^"]{3,})"/g)].map((m) => m[1]);
  // Also try the hint
  if (hint) {
    quoted.push(...[...hint.matchAll(/"([^"]{3,})"/g)].map((m) => m[1]));
  }

  for (const snippet of quoted) {
    const lower = snippet.toLowerCase();
    for (let i = 0; i < lines.length; i++) {
      const col = lines[i].toLowerCase().indexOf(lower);
      if (col !== -1) {
        return new vscode.Range(i, col, i, col + snippet.length);
      }
    }
  }

  // Fallback: keyword match from the message
  const keywords = message
    .toLowerCase()
    .split(/[\s"(),.:]+/)
    .filter((w) => w.length >= 4)
    .slice(0, 5);

  let bestLine = 0;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestLine = i;
    }
  }

  if (bestScore >= 2) {
    return new vscode.Range(bestLine, 0, bestLine, lines[bestLine].length);
  }

  return new vscode.Range(0, 0, 0, Math.min(lines[0]?.length || 1, 1));
}

/**
 * Look for a declarative agent JSON in the same appPackage folder
 * that references this instruction file.
 * Returns the manifest content, path, and parsed context.
 */
function findAgentManifestForFile(filePath: string):
  | {
      path: string;
      content: string;
      capabilities: string[];
      actions: string[];
    }
  | undefined {
  try {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const jsonFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

    for (const jsonFile of jsonFiles) {
      const fullPath = path.join(dir, jsonFile);
      const content = fs.readFileSync(fullPath, "utf-8");
      // Check if this JSON references our file
      if (!content.includes(fileName)) {
        continue;
      }
      // Check if it's a declarative agent
      if (!content.includes(DA_SCHEMA_PREFIX)) {
        continue;
      }
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        const capabilities = Array.isArray(parsed.capabilities)
          ? ((parsed.capabilities as Array<{ name?: string }>)
              .map((c) => c.name)
              .filter(Boolean) as string[])
          : [];
        const actions = Array.isArray(parsed.actions)
          ? ((parsed.actions as Array<{ id?: string }>)
              .map((a) => a.id)
              .filter(Boolean) as string[])
          : [];
        return { path: fullPath, content, capabilities, actions };
      } catch {
        continue;
      }
    }
  } catch {
    // Directory read failed
  }
  return undefined;
}

// Per-document validation sequence to cancel stale async validations.
const validationSeqMap = new Map<string, number>();

async function runValidation(
  doc: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): Promise<void> {
  if (!isCopilotManifest(doc)) {
    return;
  }

  const docKey = doc.uri.toString();
  const mySeq = (validationSeqMap.get(docKey) ?? 0) + 1;
  validationSeqMap.set(docKey, mySeq);
  const isCurrent = () => validationSeqMap.get(docKey) === mySeq;

  try {
    const rawText = doc.getText();
    const allEnvs = await loadAllEnvVars();
    if (!isCurrent()) return;
    const envNames = Object.keys(allEnvs);
    const envVarMap = buildEnvVarPathMap(rawText);

    // If no envs found, validate raw text as-is but handle unresolved vars
    if (envNames.length === 0) {
      const diagnostics: vscode.Diagnostic[] = [];
      // Report all env vars as unresolved errors — no env files exist
      const reportedVars = new Set<string>();
      for (const [, vars] of envVarMap) {
        for (const varName of vars) {
          if (!reportedVars.has(varName)) {
            reportedVars.add(varName);
            const range = findEnvVarRange(doc, varName);
            const diag = new vscode.Diagnostic(
              range,
              `Environment variable \${{${varName}}} is not set (no environment files found).`,
              vscode.DiagnosticSeverity.Error
            );
            diag.source = DIAGNOSTIC_SOURCE;
            diag.code = "M365-ENV";
            diagnostics.push(diag);
          }
        }
      }
      // Still validate for errors on non-env-var paths
      const result = await validateCopilotManifest(rawText, {
        filename: doc.uri.fsPath,
      });
      if (!isCurrent()) return;
      for (const error of [...result.errors, ...result.warnings]) {
        if (findEnvVarsForPath(envVarMap, error.path).length > 0) {
          continue;
        }
        const range = findRangeByPath(doc, error.path) ?? toRange(doc, error);
        const severity = result.errors.includes(error)
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning;
        const diag = new vscode.Diagnostic(range, error.message, severity);
        diag.source = DIAGNOSTIC_SOURCE;
        diag.code = error.code;
        diagnostics.push(diag);
      }
      collection.set(doc.uri, diagnostics);
      return;
    }

    // Validate against every environment to ensure a valid build for all.
    // Emit one diagnostic per environment per error, except for errors that
    // don't depend on env vars (e.g. instruction quality) which are reported once.
    const diagnostics: vscode.Diagnostic[] = [];
    const multiEnv = envNames.length > 1;
    // Track env-independent errors already reported so they aren't duplicated
    const reportedEnvIndependent = new Set<string>();

    for (const envName of envNames) {
      const { resolved: resolvedText, unresolved } = expandEnvVars(rawText, allEnvs[envName]);
      const unresolvedSet = new Set(unresolved);

      // Report unresolved env vars for this environment as errors
      for (const varName of unresolved) {
        const range = findEnvVarRange(doc, varName);
        const envSuffix = multiEnv ? ` [${envName}]` : "";
        const diag = new vscode.Diagnostic(
          range,
          `Environment variable \${{${varName}}} is not set in ${envName}.${envSuffix}`,
          vscode.DiagnosticSeverity.Error
        );
        diag.source = DIAGNOSTIC_SOURCE;
        diag.code = "M365-ENV";
        diagnostics.push(diag);
      }

      const result = await validateCopilotManifest(resolvedText, {
        filename: doc.uri.fsPath,
      });
      if (!isCurrent()) return;

      for (const error of [...result.errors, ...result.warnings]) {
        // Skip errors at paths where an env var is unresolved —
        // those are already covered by the "not set" diagnostics above.
        // Resolved env var paths still get validated normally.
        const envVarsAtPath = findEnvVarsForPath(envVarMap, error.path);
        if (envVarsAtPath.some((v) => unresolvedSet.has(v))) {
          continue;
        }

        // Also skip if the resolved text at this error still contains an
        // unresolved placeholder — catches cases where path matching misses.
        if (unresolvedSet.size > 0 && errorInvolvesUnresolved(resolvedText, error, unresolvedSet)) {
          continue;
        }

        // Errors not involving env vars (e.g. instruction quality) are
        // identical across environments — report them only once without
        // an environment suffix.
        const isEnvDependent = envVarsAtPath.length > 0;
        if (!isEnvDependent) {
          const dedupKey = `${error.code}::${error.path}::${error.message}`;
          if (reportedEnvIndependent.has(dedupKey)) {
            continue;
          }
          reportedEnvIndependent.add(dedupKey);
        }

        let range: vscode.Range;
        let message = error.message;
        if (isEnvDependent) {
          const varNames = envVarsAtPath.map((v) => `\${{${v}}}`).join(", ");
          message = `${error.message} (from ${varNames})`;
          range = findEnvVarRange(doc, envVarsAtPath[0]);
        } else {
          range = findRangeByPath(doc, error.path) ?? toRange(doc, error);
        }

        const severity = result.errors.includes(error)
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning;
        const envSuffix = multiEnv && isEnvDependent ? ` [${envName}]` : "";
        const diag = new vscode.Diagnostic(range, `${message}${envSuffix}`, severity);
        diag.source = DIAGNOSTIC_SOURCE;
        diag.code = error.code;
        diagnostics.push(diag);
      }
    }

    collection.set(doc.uri, diagnostics);
  } catch {
    // Validation is best-effort — don't show errors for broken JSON
  }
}

/**
 * Map a validation result to VS Code diagnostics on the original document.
 */
function mapResultToDiagnostics(
  doc: vscode.TextDocument,
  result: {
    errors: Array<{ code: string; path: string; message: string; line: number; column: number }>;
    warnings: Array<{ code: string; path: string; message: string; line: number; column: number }>;
  }
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  for (const error of result.errors) {
    const range = findRangeByPath(doc, error.path) ?? toRange(doc, error);
    const diag = new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
    diag.source = DIAGNOSTIC_SOURCE;
    diag.code = error.code;
    diagnostics.push(diag);
  }
  for (const warning of result.warnings) {
    const range = findRangeByPath(doc, warning.path) ?? toRange(doc, warning);
    const diag = new vscode.Diagnostic(range, warning.message, vscode.DiagnosticSeverity.Warning);
    diag.source = DIAGNOSTIC_SOURCE;
    diag.code = warning.code;
    diagnostics.push(diag);
  }
  return diagnostics;
}

/**
 * Build a map from JSON property paths to the env var names referenced
 * in their string values.  e.g. { "name": "${{AGENT_NAME}}" } → Map("name" → ["AGENT_NAME"])
 */
function buildEnvVarPathMap(rawText: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  try {
    const obj = JSON.parse(rawText) as unknown;
    walkForEnvVars(obj, "", map);
  } catch {
    // Invalid JSON — skip
  }
  return map;
}

function walkForEnvVars(obj: unknown, prefix: string, map: Map<string, string[]>): void {
  if (typeof obj === "string") {
    const vars: string[] = [];
    let m: RegExpExecArray | null;
    const regex = /\$\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    while ((m = regex.exec(obj)) !== null) {
      vars.push(m[1]);
    }
    if (vars.length > 0) {
      map.set(prefix, vars);
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      walkForEnvVars(obj[i], `${prefix}[${i}]`, map);
    }
  } else if (obj !== null && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const p = prefix ? `${prefix}.${key}` : key;
      walkForEnvVars(value, p, map);
    }
  }
}

/**
 * Normalize a JSON path by stripping array bracket content to just "[]",
 * so that "capabilities[0].sites[0].url" and "capabilities[WebSearch].sites[0].url"
 * both become "capabilities[].sites[].url".
 */
function normalizePath(p: string): string {
  return p.replace(/\[[^\]]*\]/g, "[]");
}

/**
 * Find env var names whose JSON path matches or is a child of the given error path.
 * Handles mismatched array indices (numeric vs named) by normalizing paths.
 */
function findEnvVarsForPath(envVarMap: Map<string, string[]>, errorPath: string): string[] {
  if (!errorPath) {
    return [];
  }
  // Direct match
  if (envVarMap.has(errorPath)) {
    return envVarMap.get(errorPath)!;
  }
  // Normalized match (handles capabilities[0] vs capabilities[WebSearch])
  const normalizedError = normalizePath(errorPath);
  const vars: string[] = [];
  for (const [mapPath, mapVars] of envVarMap) {
    const normalizedMap = normalizePath(mapPath);
    if (
      normalizedMap === normalizedError ||
      normalizedMap.startsWith(normalizedError + ".") ||
      normalizedMap.startsWith(normalizedError + "[")
    ) {
      vars.push(...mapVars);
    }
  }
  return [...new Set(vars)];
}

/**
 * Fallback check: determine if a validation error involves an unresolved env var
 * by inspecting the resolved text around the error position for leftover
 * ${{VAR}} placeholders. Catches cases where path-based matching misses.
 */
function errorInvolvesUnresolved(
  resolvedText: string,
  error: { line: number; column: number; path: string },
  unresolvedSet: Set<string>
): boolean {
  // Check if any unresolved placeholder appears in the error's message context
  // by looking at the resolved text near the error location
  const lines = resolvedText.split("\n");
  const lineIdx = Math.max(0, (error.line || 1) - 1);
  if (lineIdx < lines.length) {
    const lineText = lines[lineIdx];
    for (const varName of unresolvedSet) {
      if (lineText.includes(`\${{${varName}}}`)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Find the range of a ${{VAR_NAME}} reference in the document.
 */
function findEnvVarRange(doc: vscode.TextDocument, varName: string): vscode.Range {
  const text = doc.getText();
  const pattern = new RegExp(`\\$\\{\\{\\s*${varName}\\s*\\}\\}`);
  const match = pattern.exec(text);
  if (match) {
    const pos = doc.positionAt(match.index);
    return new vscode.Range(pos, doc.positionAt(match.index + match[0].length));
  }
  return new vscode.Range(0, 0, 0, 1);
}

/**
 * Find a range in the original document by JSON property path (e.g., "name",
 * "capabilities[0].name"). This is used to map errors from the env-resolved
 * text back to the correct position in the original document.
 */
function findRangeByPath(doc: vscode.TextDocument, jsonPath: string): vscode.Range | undefined {
  if (!jsonPath) {
    return undefined;
  }
  // Convert path like "capabilities[0].name" to a search for the last key
  const segments = jsonPath.split(/[.\[\]]+/).filter(Boolean);
  const lastKey = segments[segments.length - 1];
  if (!lastKey || /^\d+$/.test(lastKey)) {
    // Array index — use the parent key
    const parentKey = segments.length >= 2 ? segments[segments.length - 2] : undefined;
    if (!parentKey) {
      return undefined;
    }
    return findKeyRange(doc, parentKey);
  }
  return findKeyRange(doc, lastKey);
}

/**
 * Find the range of a JSON key's value in the document.
 */
function findKeyRange(doc: vscode.TextDocument, key: string): vscode.Range | undefined {
  const text = doc.getText();
  // Search for "key": ... pattern
  const keyPattern = new RegExp(`"${key}"\\s*:\\s*`);
  const match = keyPattern.exec(text);
  if (!match) {
    return undefined;
  }
  const valueStart = match.index + match[0].length;
  const pos = doc.positionAt(valueStart);
  return toRange(doc, { line: pos.line + 1, column: pos.character + 1 });
}

/**
 * Build a VS Code Range that covers the full JSON token (string value,
 * number, keyword, or property key) at the reported error position.
 *
 * Falls back to underlining to end-of-line when the token boundary
 * cannot be determined.
 */
function toRange(doc: vscode.TextDocument, error: { line: number; column: number }): vscode.Range {
  const startLine = Math.max(0, (error.line || 1) - 1);
  const startCol = Math.max(0, (error.column || 1) - 1);
  const lineText = doc.lineAt(startLine).text;

  // Try to detect the token at startCol
  const rest = lineText.substring(startCol);

  let length = 0;
  if (rest.startsWith('"')) {
    // Quoted string — find the closing quote (skip escaped quotes)
    let i = 1;
    while (i < rest.length) {
      if (rest[i] === "\\" && i + 1 < rest.length) {
        i += 2;
        continue;
      }
      if (rest[i] === '"') {
        length = i + 1;
        break;
      }
      i++;
    }
    if (length === 0) {
      length = rest.length; // unterminated string — underline to EOL
    }
  } else {
    // Non-quoted token (number, boolean, null, or bare word)
    const match = rest.match(/^[^\s,\]}"]+/);
    length = match ? match[0].length : 0;
  }

  // Fallback: underline to end of trimmed line content
  if (length === 0) {
    length = lineText.trimEnd().length - startCol;
  }
  if (length <= 0) {
    length = 1;
  }

  return new vscode.Range(startLine, startCol, startLine, startCol + length);
}

/**
 * Run LLM-powered semantic analysis on agent instructions.
 * Works on both:
 * - Declarative agent JSON files (resolves $[file(...)] references)
 * - .txt/.md instruction files in appPackage/
 */
async function runLLMAnalysis(collection: vscode.DiagnosticCollection): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage(
      "No active editor. Open a declarative agent JSON file or an instructions .txt/.md file."
    );
    return;
  }

  const doc = editor.document;
  const isManifest = isCopilotManifest(doc);
  const isInstructions = isInstructionsFile(doc);

  if (!isManifest && !isInstructions) {
    void vscode.window.showWarningMessage(
      "This file is not a declarative agent manifest or an instructions file in appPackage/."
    );
    return;
  }

  let instructionsText: string;
  let capabilities: string[] = [];
  let actions: string[] = [];
  // The document whose URI we'll attach diagnostics to
  let targetUri = doc.uri;
  // Text to search for line position mapping
  let searchText = doc.getText();

  if (isInstructions) {
    // Direct instruction file — analyze its contents
    instructionsText = doc.getText();
    // Try to find agent context from sibling JSON
    const agentManifest = findAgentManifestForFile(doc.uri.fsPath);
    if (agentManifest) {
      capabilities = agentManifest.capabilities;
      actions = agentManifest.actions;
    }
  } else {
    // JSON manifest — extract and resolve instructions
    let content: Record<string, unknown>;
    try {
      content = JSON.parse(doc.getText()) as Record<string, unknown>;
    } catch {
      void vscode.window.showErrorMessage("Cannot parse JSON. Fix syntax errors first.");
      return;
    }

    capabilities = Array.isArray(content.capabilities)
      ? ((content.capabilities as Array<{ name?: string }>)
          .map((c) => c.name)
          .filter(Boolean) as string[])
      : [];
    actions = Array.isArray(content.actions)
      ? ((content.actions as Array<{ id?: string }>).map((a) => a.id).filter(Boolean) as string[])
      : [];

    const rawInstructions = content.instructions;
    if (typeof rawInstructions !== "string" || rawInstructions.trim().length === 0) {
      void vscode.window.showWarningMessage("No instructions found in this agent manifest.");
      return;
    }

    // Resolve file reference if instructions point to an external file
    const resolved = CopilotValidation.resolveInstructionsText(content, doc.uri.toString());
    if (resolved && resolved !== rawInstructions) {
      // Instructions are in an external file — show diagnostics on that file
      instructionsText = resolved;
      const filePath = parseInstructionsFilePath(rawInstructions, doc.uri.fsPath);
      if (filePath) {
        targetUri = vscode.Uri.file(filePath);
        searchText = resolved;
      }
    } else {
      instructionsText = rawInstructions;
    }
  }

  if (instructionsText.trim().length === 0) {
    void vscode.window.showWarningMessage("Instructions are empty.");
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Analyzing agent instructions with AI...",
      cancellable: true,
    },
    async (_progress, token) => {
      try {
        const analyzer = new CopilotValidation.InstructionsLLMAnalyzer();
        analyzer.setProxyFn(createVSCodeLMProxy(token));

        const diagnostics = await analyzer.analyze(
          instructionsText,
          { capabilities, actions },
          undefined,
          searchText
        );

        if (token.isCancellationRequested) {
          return;
        }

        const vscodeDiags = diagnostics.map((d) => {
          const range = new vscode.Range(
            d.range.start.line,
            d.range.start.character,
            d.range.end.line,
            d.range.end.character
          );
          const severity =
            d.severity === 1
              ? vscode.DiagnosticSeverity.Error
              : d.severity === 2
              ? vscode.DiagnosticSeverity.Warning
              : d.severity === 3
              ? vscode.DiagnosticSeverity.Information
              : vscode.DiagnosticSeverity.Hint;
          const diag = new vscode.Diagnostic(range, d.message, severity);
          diag.source = LLM_DIAGNOSTIC_SOURCE;
          diag.code = d.code;
          return diag;
        });

        collection.set(targetUri, vscodeDiags);

        const issueCount = vscodeDiags.length;
        if (issueCount === 0) {
          void vscode.window.showInformationMessage(
            "AI analysis complete — no issues found in agent instructions."
          );
        } else {
          void vscode.window.showInformationMessage(
            `AI analysis found ${String(issueCount)} issue(s). Check the Problems panel.`
          );
        }
      } catch (error) {
        if (!token.isCancellationRequested) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          void vscode.window.showErrorMessage(`AI analysis failed: ${msg}`);
        }
      }
    }
  );
}

/**
 * Parse the file path from a $[file('...')] instructions reference,
 * resolving it relative to the manifest document.
 */
function parseInstructionsFilePath(
  instructionsValue: string,
  manifestFsPath: string
): string | undefined {
  const match = instructionsValue.match(/^\$\[file\(['"](.+)['"]\)\]$/);
  if (!match) {
    return undefined;
  }
  const relPath = match[1];
  const dir = path.dirname(manifestFsPath);
  const resolved = path.resolve(dir, relPath);
  return fs.existsSync(resolved) ? resolved : undefined;
}

/**
 * Create an LLM proxy function that uses the VS Code Language Model API.
 */
function createVSCodeLMProxy(
  cancellationToken: vscode.CancellationToken
): CopilotValidation.LLMProxyFn {
  return async (request) => {
    try {
      const models = await vscode.lm.selectChatModels({ vendor: "copilot", family: "gpt-4o" });
      const model = models?.[0];
      if (!model) {
        // Fall back to any available model
        const allModels = await vscode.lm.selectChatModels({ vendor: "copilot" });
        const fallback = allModels?.[0];
        if (!fallback) {
          return { text: "", error: "No language model available. Is GitHub Copilot installed?" };
        }
        return await sendLMRequest(fallback, request, cancellationToken);
      }
      return await sendLMRequest(model, request, cancellationToken);
    } catch (error) {
      return {
        text: "",
        error: error instanceof Error ? error.message : "Language model request failed",
      };
    }
  };
}

async function sendLMRequest(
  model: vscode.LanguageModelChat,
  request: CopilotValidation.LLMProxyRequest,
  token: vscode.CancellationToken
): Promise<CopilotValidation.LLMProxyResponse> {
  const messages = [
    vscode.LanguageModelChatMessage.User(request.systemPrompt),
    vscode.LanguageModelChatMessage.User(request.prompt),
  ];
  const response = await model.sendRequest(messages, {}, token);
  let text = "";
  for await (const fragment of response.text) {
    text += fragment;
  }
  return { text };
}
