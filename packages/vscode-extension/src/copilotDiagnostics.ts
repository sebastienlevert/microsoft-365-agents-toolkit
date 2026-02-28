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

const DIAGNOSTIC_SOURCE = "Microsoft 365 Agents Toolkit";
const LLM_DIAGNOSTIC_SOURCE = "Microsoft 365 Agents Toolkit (AI)";

// Schema URL prefixes used to identify declarative agent / API plugin files
const DA_SCHEMA_PREFIX = "developer.microsoft.com/json-schemas/copilot/declarative-agent";
const PLUGIN_SCHEMA_PREFIX = "developer.microsoft.com/json-schemas/copilot/plugin";

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

  // Validate on open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      validateDocument(doc, collection);
    })
  );

  // Validate on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      validateDocument(doc, collection);
    })
  );

  // Validate on change (debounced)
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        validateDocument(e.document, collection);
      }, 500);
    })
  );

  // Validate all already-open documents
  for (const doc of vscode.workspace.textDocuments) {
    validateDocument(doc, collection);
  }

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

      // Capability-mention check using the agent's actual capabilities
      const lowerText = text.toLowerCase();
      const capKeywords: Record<string, string[]> = {
        WebSearch: ["search", "web", "browse", "internet"],
        Email: ["email", "mail", "outlook", "inbox"],
        OneDriveAndSharePoint: ["sharepoint", "onedrive", "file", "document"],
        CopilotConnectors: ["connector", "graph connector", "data source"],
        TeamsMessages: ["teams", "chat", "channel", "message"],
        Dataverse: ["dataverse", "dynamics", "crm"],
        EmbeddedKnowledge: ["knowledge", "document", "file"],
      };
      const unmentioned = agentManifest.capabilities.filter((cap) => {
        const keywords = capKeywords[cap] || [];
        return !keywords.some((kw) => lowerText.includes(kw));
      });
      if (unmentioned.length > 0 && !diagnostics.some((d) => d.code === "M365-013")) {
        const diag = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 1),
          `Instructions don't reference configured capabilities: ${unmentioned.join(
            ", "
          )}. Mention them so the agent knows when to use them.`,
          vscode.DiagnosticSeverity.Information
        );
        diag.source = DIAGNOSTIC_SOURCE;
        diag.code = "M365-013";
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

async function runValidation(
  doc: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): Promise<void> {
  if (!isCopilotManifest(doc)) {
    return;
  }

  try {
    const result = await validateCopilotManifest(doc.getText(), {
      filename: doc.uri.fsPath,
    });

    const diagnostics: vscode.Diagnostic[] = [];

    for (const error of result.errors) {
      const range = toRange(doc, error);
      const diag = new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
      diag.source = DIAGNOSTIC_SOURCE;
      diag.code = error.code;
      diagnostics.push(diag);
    }

    for (const warning of result.warnings) {
      const range = toRange(doc, warning);
      const diag = new vscode.Diagnostic(range, warning.message, vscode.DiagnosticSeverity.Warning);
      diag.source = DIAGNOSTIC_SOURCE;
      diag.code = warning.code;
      diagnostics.push(diag);
    }

    collection.set(doc.uri, diagnostics);
  } catch {
    // Validation is best-effort — don't show errors for broken JSON
  }
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
