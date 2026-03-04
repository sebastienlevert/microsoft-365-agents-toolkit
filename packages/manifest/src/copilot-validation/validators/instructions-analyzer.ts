// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Diagnostic, DiagnosticSeverity, Range } from "../types";
import { DiagnosticContext, reportDiagnosticAtPath } from "../diagnostics/diagnostic-reporter";
import { getValueAtPath, isFileReference, parseFileReference } from "./utils";
import * as fs from "fs";
import * as path from "path";
import { URI } from "vscode-uri";

// Weak language patterns that indicate insufficiently directive instructions
const WEAK_PATTERNS: { pattern: RegExp; suggestion: string }[] = [
  { pattern: /\btry to\b/gi, suggestion: 'Use "must" or "always" for clear directives' },
  { pattern: /\bconsider\b/gi, suggestion: 'Use "must" or "always" instead of "consider"' },
  {
    pattern: /\bif possible\b/gi,
    suggestion: "Be explicit — state when it applies or remove the hedge",
  },
  { pattern: /\bmight\b/gi, suggestion: 'Use definitive language instead of "might"' },
  { pattern: /\bcould\b/gi, suggestion: 'Use "should" or "must" instead of "could"' },
  { pattern: /\bmay want to\b/gi, suggestion: 'Use "should" or "must" instead of "may want to"' },
  {
    pattern: /\bwhen appropriate\b/gi,
    suggestion: 'Define specific conditions instead of "when appropriate"',
  },
  { pattern: /\boptionally\b/gi, suggestion: "Clarify when the optional action should occur" },
];

// Ambiguous quantifiers that should be replaced with specific values
const AMBIGUOUS_QUANTIFIERS: { pattern: RegExp; suggestion: string }[] = [
  { pattern: /\ba few\b/gi, suggestion: 'Replace "a few" with a specific number (e.g., "2-3")' },
  { pattern: /\bsome\b/gi, suggestion: 'Replace "some" with a specific quantity or criteria' },
  { pattern: /\bsometimes\b/gi, suggestion: 'Replace "sometimes" with specific conditions' },
  { pattern: /\boccasionally\b/gi, suggestion: 'Replace "occasionally" with specific conditions' },
  {
    pattern: /\bseveral\b/gi,
    suggestion: 'Replace "several" with a specific number (e.g., "5-7")',
  },
  { pattern: /\bnumerous\b/gi, suggestion: 'Replace "numerous" with a specific number' },
];

// Vague terms that lack specificity
const VAGUE_TERMS: { pattern: RegExp; suggestion: string }[] = [
  { pattern: /\breasonable\b/gi, suggestion: 'Define what constitutes "reasonable"' },
  { pattern: /\badequate\b/gi, suggestion: 'Specify what "adequate" means with concrete criteria' },
];

// Capability names used in declarative agents
const CAPABILITY_NAMES = [
  "WebSearch",
  "Email",
  "OneDriveAndSharePoint",
  "CopilotConnectors",
  "TeamsMessages",
  "Dataverse",
  "EmbeddedKnowledge",
  "ScenarioModels",
  "GraphicArt",
  "CodeInterpreter",
  "Actions",
];

/**
 * Resolve the instructions text content from inline or file reference.
 */
export function resolveInstructionsText(
  content: unknown,
  documentUri?: string
): string | undefined {
  const instructions = getValueAtPath(content, ["instructions"]);
  if (typeof instructions !== "string" || instructions.trim().length === 0) {
    return undefined;
  }

  if (isFileReference(instructions)) {
    const filePath = parseFileReference(instructions);
    if (!filePath || !documentUri) {
      return undefined;
    }
    try {
      const docPath = URI.parse(documentUri).fsPath;
      const docDir = path.dirname(docPath);
      const absolutePath = path.resolve(docDir, filePath);
      if (fs.existsSync(absolutePath)) {
        return fs.readFileSync(absolutePath, "utf-8");
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  return instructions;
}

/**
 * Analyze instruction quality and report diagnostics.
 */
export function analyzeInstructions(
  ctx: DiagnosticContext,
  content: unknown,
  documentUri?: string
): void {
  const instructionsText = resolveInstructionsText(content, documentUri);
  if (!instructionsText) {
    return;
  }

  // Skip very short instructions — not enough content for quality analysis
  const trimmed = instructionsText.trim();
  if (trimmed.length < 20) {
    return;
  }

  // Skip non-prose content (e.g., repeated chars in tests) — require at least a few words
  const wordCount = trimmed.split(/\s+/).filter((w) => w.length > 1).length;
  if (wordCount < 5) {
    return;
  }

  analyzeWeakLanguage(ctx, instructionsText);
  analyzeAmbiguity(ctx, instructionsText);
  analyzeVagueTerms(ctx, instructionsText);
  analyzePersona(ctx, instructionsText);
  analyzeRedundancy(ctx, instructionsText);
  analyzeInstructionLength(ctx, content, instructionsText);
}

/**
 * Detect weak/hedging language in instructions.
 */
function analyzeWeakLanguage(ctx: DiagnosticContext, text: string): void {
  const matches: string[] = [];
  for (const { pattern } of WEAK_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      matches.push(pattern.source.replace(/\\b/g, "").replace(/\//g, ""));
    }
  }

  if (matches.length > 0) {
    const examples = matches
      .slice(0, 3)
      .map((m) => `"${m}"`)
      .join(", ");
    reportDiagnosticAtPath(
      ctx,
      ["instructions"],
      "M365-010",
      `Instructions use weak/hedging language (${examples}). Use direct, imperative language for clearer agent behavior.`,
      DiagnosticSeverity.Warning
    );
  }
}

/**
 * Detect ambiguous quantifiers in instructions.
 */
function analyzeAmbiguity(ctx: DiagnosticContext, text: string): void {
  const matches: string[] = [];
  for (const { pattern } of AMBIGUOUS_QUANTIFIERS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      matches.push(pattern.source.replace(/\\b/g, "").replace(/\//g, ""));
    }
  }

  if (matches.length > 0) {
    const examples = matches
      .slice(0, 3)
      .map((m) => `"${m}"`)
      .join(", ");
    reportDiagnosticAtPath(
      ctx,
      ["instructions"],
      "M365-011",
      `Instructions contain ambiguous quantifiers (${examples}). Replace with specific numbers or conditions.`,
      DiagnosticSeverity.Warning
    );
  }
}

/**
 * Detect vague terms in instructions.
 */
function analyzeVagueTerms(ctx: DiagnosticContext, text: string): void {
  const matches: string[] = [];
  for (const { pattern } of VAGUE_TERMS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      matches.push(pattern.source.replace(/\\b/g, "").replace(/\//g, ""));
    }
  }

  if (matches.length > 0) {
    const examples = matches
      .slice(0, 3)
      .map((m) => `"${m}"`)
      .join(", ");
    reportDiagnosticAtPath(
      ctx,
      ["instructions"],
      "M365-011",
      `Instructions contain vague terms (${examples}). Define specific criteria for better agent behavior.`,
      DiagnosticSeverity.Warning
    );
  }
}

/**
 * Check for persona/role definition in instructions.
 */
function analyzePersona(ctx: DiagnosticContext, text: string): void {
  const personaPatterns = [
    /\byou are\b/i,
    /\byour role\b/i,
    /\byou serve as\b/i,
    /\byou act as\b/i,
    /\bas a[n]? .+(assistant|agent|advisor|expert|specialist|helper)\b/i,
  ];

  const hasPersona = personaPatterns.some((p) => p.test(text));
  if (!hasPersona && text.length > 100) {
    reportDiagnosticAtPath(
      ctx,
      ["instructions"],
      "M365-012",
      'Instructions lack a persona definition. Consider adding "You are a..." to establish the agent\'s role and personality.',
      DiagnosticSeverity.Information
    );
  }
}

/**
 * Detect duplicate/redundant instruction patterns.
 */
function analyzeRedundancy(ctx: DiagnosticContext, text: string): void {
  // Split into sentences and normalize
  const sentences = text
    .split(/[.!?\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 15);

  const seen = new Map<string, number>();
  let duplicateCount = 0;

  for (const sentence of sentences) {
    // Normalize whitespace for comparison
    const normalized = sentence.replace(/\s+/g, " ");
    const count = seen.get(normalized) || 0;
    if (count > 0) {
      duplicateCount++;
    }
    seen.set(normalized, count + 1);
  }

  if (duplicateCount > 0) {
    reportDiagnosticAtPath(
      ctx,
      ["instructions"],
      "M365-014",
      `Instructions contain ${duplicateCount} duplicate sentence(s). Remove redundancy for clarity.`,
      DiagnosticSeverity.Information
    );
  }
}

/**
 * Check instruction length relative to agent complexity.
 */
function analyzeInstructionLength(ctx: DiagnosticContext, content: unknown, text: string): void {
  const capabilities = getValueAtPath(content, ["capabilities"]);
  const capCount = Array.isArray(capabilities) ? capabilities.length : 0;
  const actions = getValueAtPath(content, ["actions"]);
  const actionCount = Array.isArray(actions) ? actions.length : 0;

  // Agent with multiple capabilities/actions but very short instructions
  if (capCount + actionCount >= 3 && text.length < 200) {
    reportDiagnosticAtPath(
      ctx,
      ["instructions"],
      "M365-012",
      `Instructions are short (${text.length} chars) for an agent with ${capCount} capabilities and ${actionCount} actions. Consider adding more detailed guidance.`,
      DiagnosticSeverity.Information
    );
  }

  // Warn when approaching the 8000 char limit
  if (text.length > 7000) {
    reportDiagnosticAtPath(
      ctx,
      ["instructions"],
      "M365-009",
      `Instructions are ${text.length}/8000 characters (${Math.round(
        text.length / 80
      )}% of limit). Consider moving some content to embedded knowledge files.`,
      DiagnosticSeverity.Warning
    );
  }
}

/**
 * Analyze raw instruction text directly (for standalone .txt/.md files).
 * Returns Diagnostic[] without needing a JSON document context.
 */
export function analyzeInstructionsText(text: string): Diagnostic[] {
  const trimmed = text.trim();
  if (trimmed.length < 20) {
    return [];
  }

  const wordCount = trimmed.split(/\s+/).filter((w) => w.length > 1).length;
  if (wordCount < 5) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  function makeDiag(
    code: string,
    message: string,
    severity: DiagnosticSeverity,
    line: number
  ): Diagnostic {
    const range: Range = {
      start: { line, character: 0 },
      end: { line, character: Number.MAX_SAFE_INTEGER },
    };
    return { range, severity, code, source: "m365-copilot-dev", message };
  }

  // Weak language
  const weakMatches: string[] = [];
  for (const { pattern } of WEAK_PATTERNS) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (m) {
      weakMatches.push(pattern.source.replace(/\\b/g, "").replace(/\//g, ""));
    }
  }
  if (weakMatches.length > 0) {
    const examples = weakMatches
      .slice(0, 3)
      .map((m) => `"${m}"`)
      .join(", ");
    // Find first occurrence line
    const line = findPatternLine(text, weakMatches[0]);
    diagnostics.push(
      makeDiag(
        "M365-010",
        `Instructions use weak/hedging language (${examples}). Use direct, imperative language for clearer agent behavior.`,
        DiagnosticSeverity.Warning,
        line
      )
    );
  }

  // Ambiguity
  const ambigMatches: string[] = [];
  for (const { pattern } of AMBIGUOUS_QUANTIFIERS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      ambigMatches.push(pattern.source.replace(/\\b/g, "").replace(/\//g, ""));
    }
  }
  if (ambigMatches.length > 0) {
    const examples = ambigMatches
      .slice(0, 3)
      .map((m) => `"${m}"`)
      .join(", ");
    const line = findPatternLine(text, ambigMatches[0]);
    diagnostics.push(
      makeDiag(
        "M365-011",
        `Instructions contain ambiguous quantifiers (${examples}). Replace with specific numbers or conditions.`,
        DiagnosticSeverity.Warning,
        line
      )
    );
  }

  // Vague terms
  const vagueMatches: string[] = [];
  for (const { pattern } of VAGUE_TERMS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      vagueMatches.push(pattern.source.replace(/\\b/g, "").replace(/\//g, ""));
    }
  }
  if (vagueMatches.length > 0) {
    const examples = vagueMatches
      .slice(0, 3)
      .map((m) => `"${m}"`)
      .join(", ");
    const line = findPatternLine(text, vagueMatches[0]);
    diagnostics.push(
      makeDiag(
        "M365-011",
        `Instructions contain vague terms (${examples}). Define specific criteria for better agent behavior.`,
        DiagnosticSeverity.Warning,
        line
      )
    );
  }

  // Persona
  const personaPatterns = [
    /\byou are\b/i,
    /\byour role\b/i,
    /\byou serve as\b/i,
    /\byou act as\b/i,
    /\bas a[n]? .+(assistant|agent|advisor|expert|specialist|helper)\b/i,
  ];
  const hasPersona = personaPatterns.some((p) => p.test(text));
  if (!hasPersona && text.length > 100) {
    diagnostics.push(
      makeDiag(
        "M365-012",
        'Instructions lack a persona definition. Consider adding "You are a..." to establish the agent\'s role and personality.',
        DiagnosticSeverity.Information,
        0
      )
    );
  }

  // Redundancy
  const sentences = text
    .split(/[.!?\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 15);
  const seen = new Map<string, number>();
  let duplicateCount = 0;
  let firstDuplicate: string | undefined;
  for (const sentence of sentences) {
    const normalized = sentence.replace(/\s+/g, " ");
    const count = seen.get(normalized) || 0;
    if (count > 0) {
      duplicateCount++;
      if (!firstDuplicate) firstDuplicate = normalized;
    }
    seen.set(normalized, count + 1);
  }
  if (duplicateCount > 0) {
    const line = firstDuplicate ? findPatternLine(text, firstDuplicate) : 0;
    diagnostics.push(
      makeDiag(
        "M365-014",
        `Instructions contain ${duplicateCount} duplicate sentence(s). Remove redundancy for clarity.`,
        DiagnosticSeverity.Information,
        line
      )
    );
  }

  // Length warning
  if (text.length > 7000) {
    diagnostics.push(
      makeDiag(
        "M365-009",
        `Instructions are ${text.length}/8000 characters (${Math.round(
          text.length / 80
        )}% of limit). Consider moving some content to embedded knowledge files.`,
        DiagnosticSeverity.Warning,
        0
      )
    );
  }

  return diagnostics;
}

/**
 * Find the line number where a pattern word first appears.
 */
function findPatternLine(text: string, patternWord: string): number {
  const lines = text.split("\n");
  const lower = patternWord.toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(lower)) {
      return i;
    }
  }
  return 0;
}
