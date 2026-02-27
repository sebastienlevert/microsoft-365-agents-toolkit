// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Provides real-time diagnostics for declarative agent and API plugin
 * manifests by running copilot-validation on file open/save/change.
 */

import * as vscode from "vscode";
import { validateCopilotManifest } from "@microsoft/teamsfx-api";

const DIAGNOSTIC_SOURCE = "Microsoft 365 Agents Toolkit";

// Schema URL prefixes used to identify declarative agent / API plugin files
const DA_SCHEMA_PREFIX = "developer.microsoft.com/json-schemas/copilot/declarative-agent";
const PLUGIN_SCHEMA_PREFIX = "developer.microsoft.com/json-schemas/copilot/plugin";

/**
 * Register a diagnostic provider that validates declarative agent and API
 * plugin JSON files whenever they are opened, saved, or changed.
 */
export function registerCopilotDiagnostics(
  context: vscode.ExtensionContext
): vscode.DiagnosticCollection {
  const collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);

  // Validate on open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      void runValidation(doc, collection);
    })
  );

  // Validate on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      void runValidation(doc, collection);
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
        void runValidation(e.document, collection);
      }, 500);
    })
  );

  // Validate all already-open documents
  for (const doc of vscode.workspace.textDocuments) {
    void runValidation(doc, collection);
  }

  // Clear diagnostics when a document is closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      collection.delete(doc.uri);
    })
  );

  context.subscriptions.push(collection);
  return collection;
}

function isCopilotManifest(doc: vscode.TextDocument): boolean {
  if (doc.languageId !== "json" && doc.languageId !== "jsonc") {
    return false;
  }
  const text = doc.getText();
  return text.includes(DA_SCHEMA_PREFIX) || text.includes(PLUGIN_SCHEMA_PREFIX);
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
