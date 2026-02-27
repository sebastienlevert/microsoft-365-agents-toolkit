// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { TextDocument } from "./types";
import { ParsedDocument, parseDocument, detectDocumentType, DocumentType } from "./parser";

export interface ManagedDocument {
  textDocument: TextDocument;
  parsed: ParsedDocument;
  documentType: DocumentType;
  version: number;
}

/**
 * Manages open documents and their parsed state
 */
export class DocumentManager {
  private documents: Map<string, ManagedDocument> = new Map();

  /**
   * Open or update a document
   */
  open(uri: string, languageId: string, version: number, content: string): ManagedDocument {
    const textDocument = TextDocument.create(uri, languageId, version, content);
    return this.update(textDocument);
  }

  /**
   * Update a document with new content
   */
  update(textDocument: TextDocument): ManagedDocument {
    const parsed = parseDocument(textDocument);
    const documentType = detectDocumentType(parsed.content);

    const managed: ManagedDocument = {
      textDocument,
      parsed,
      documentType,
      version: textDocument.version,
    };

    this.documents.set(textDocument.uri, managed);
    return managed;
  }

  /**
   * Apply incremental changes to a document
   */
  applyChanges(
    uri: string,
    version: number,
    changes: {
      range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
      text: string;
    }[]
  ): ManagedDocument | undefined {
    const existing = this.documents.get(uri);
    if (!existing) {
      return undefined;
    }

    const updated = TextDocument.update(existing.textDocument, changes, version);
    return this.update(updated);
  }

  /**
   * Close a document
   */
  close(uri: string): void {
    this.documents.delete(uri);
  }

  /**
   * Get a managed document by URI
   */
  get(uri: string): ManagedDocument | undefined {
    return this.documents.get(uri);
  }

  /**
   * Check if a document is open
   */
  has(uri: string): boolean {
    return this.documents.has(uri);
  }

  /**
   * Get all open documents
   */
  all(): ManagedDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * Get all document URIs
   */
  keys(): string[] {
    return Array.from(this.documents.keys());
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.documents.clear();
  }
}
