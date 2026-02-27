// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/* eslint-disable @typescript-eslint/no-namespace */

/**
 * Minimal LSP-compatible types for copilot-validation.
 *
 * These mirror the shapes from `vscode-languageserver` and
 * `vscode-languageserver-textdocument` so the validation core
 * can run without pulling in those heavy dependencies.
 */

// ---------------------------------------------------------------------------
// Position / Range
// ---------------------------------------------------------------------------
export interface Position {
  line: number;
  character: number;
}

export namespace Position {
  export function create(line: number, character: number): Position {
    return { line, character };
  }
}

export interface Range {
  start: Position;
  end: Position;
}

export namespace Range {
  export function create(
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number
  ): Range;
  export function create(start: Position, end: Position): Range;
  export function create(
    a: number | Position,
    b: number | Position,
    c?: number,
    d?: number
  ): Range {
    if (typeof a === "number") {
      return { start: Position.create(a, b as number), end: Position.create(c!, d!) };
    }
    return { start: a, end: b as Position };
  }
}

// ---------------------------------------------------------------------------
// DiagnosticSeverity
// ---------------------------------------------------------------------------
export namespace DiagnosticSeverity {
  export const Error = 1;
  export const Warning = 2;
  export const Information = 3;
  export const Hint = 4;
}
export type DiagnosticSeverity = 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------
export interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: string | number;
  source?: string;
  message: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// CompletionItem / CompletionList (subset used by providers)
// ---------------------------------------------------------------------------
export namespace CompletionItemKind {
  export const Text = 1;
  export const Property = 10;
  export const Value = 12;
  export const Enum = 13;
  export const EnumMember = 20;
  export const Snippet = 15;
}
export type CompletionItemKind = number;

export namespace InsertTextFormat {
  export const PlainText = 1;
  export const Snippet = 2;
}
export type InsertTextFormat = 1 | 2;

export interface CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
  insertTextFormat?: InsertTextFormat;
  sortText?: string;
}

export interface CompletionList {
  isIncomplete: boolean;
  items: CompletionItem[];
}

// ---------------------------------------------------------------------------
// Hover / MarkupContent
// ---------------------------------------------------------------------------
export namespace MarkupKind {
  export const PlainText = "plaintext";
  export const Markdown = "markdown";
}
export type MarkupKind = "plaintext" | "markdown";

export interface MarkupContent {
  kind: MarkupKind;
  value: string;
}

export interface Hover {
  contents: MarkupContent;
  range?: Range;
}

// ---------------------------------------------------------------------------
// TextDocument (minimal, matching vscode-languageserver-textdocument)
// ---------------------------------------------------------------------------
export interface TextDocument {
  uri: string;
  languageId: string;
  version: number;
  getText(range?: Range): string;
  positionAt(offset: number): Position;
  offsetAt(position: Position): number;
  lineCount: number;
}

export namespace TextDocument {
  export function create(
    uri: string,
    languageId: string,
    version: number,
    content: string
  ): TextDocument {
    const lineOffsets = computeLineOffsets(content);
    return {
      uri,
      languageId,
      version,
      lineCount: lineOffsets.length,
      getText(range?: Range): string {
        if (range) {
          const start = offsetAt(range.start);
          const end = offsetAt(range.end);
          return content.substring(start, end);
        }
        return content;
      },
      positionAt(offset: number): Position {
        offset = Math.max(0, Math.min(offset, content.length));
        let low = 0,
          high = lineOffsets.length - 1;
        while (low < high) {
          const mid = (low + high + 1) >> 1;
          if (lineOffsets[mid] <= offset) {
            low = mid;
          } else {
            high = mid - 1;
          }
        }
        return Position.create(low, offset - lineOffsets[low]);
      },
      offsetAt(position: Position): number {
        return offsetAt(position);
      },
    };

    function offsetAt(position: Position): number {
      const lineOffset = lineOffsets[position.line] ?? content.length;
      return Math.min(lineOffset + position.character, content.length);
    }
  }

  function computeLineOffsets(text: string): number[] {
    const offsets: number[] = [0];
    for (let i = 0; i < text.length; i++) {
      if (text.charAt(i) === "\n") {
        offsets.push(i + 1);
      } else if (text.charAt(i) === "\r") {
        if (i + 1 < text.length && text.charAt(i + 1) === "\n") {
          i++;
        }
        offsets.push(i + 1);
      }
    }
    return offsets;
  }

  export interface TextDocumentContentChangeEvent {
    range?: Range;
    text: string;
  }

  export function update(
    document: TextDocument,
    changes: TextDocumentContentChangeEvent[],
    version: number
  ): TextDocument {
    let content = document.getText();
    for (const change of changes) {
      if (change.range) {
        const startOffset = document.offsetAt(change.range.start);
        const endOffset = document.offsetAt(change.range.end);
        content = content.substring(0, startOffset) + change.text + content.substring(endOffset);
      } else {
        content = change.text;
      }
    }
    return create(document.uri, document.languageId, version, content);
  }
}
