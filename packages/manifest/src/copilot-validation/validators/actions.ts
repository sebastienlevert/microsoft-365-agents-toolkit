// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DiagnosticSeverity } from "../types";
import { DiagnosticContext } from "../diagnostics/diagnostic-reporter";
import {
  validateNotEmpty,
  validateMaxLength,
  validateArrayMaxLength,
  validateArrayMinLength,
  getValueAtPath,
  forEachArrayItem,
} from "./utils";
import { reportDiagnosticAtPath } from "../diagnostics/diagnostic-reporter";

interface ActionFunction {
  name: string;
  description?: string;
}

interface ActionsPlugin {
  name_for_human?: string;
  description_for_model?: string;
  description_for_human?: string;
  functions?: ActionFunction[];
}

/**
 * Validate API plugin actions
 */
export function validateActions(ctx: DiagnosticContext, content: unknown): void {
  if (!content || typeof content !== "object") {
    return;
  }

  const obj = content as Record<string, unknown>;

  // Validate name_for_human (max 2048 chars)
  if (obj.name_for_human !== undefined) {
    validateNotEmpty(ctx, content, ["name_for_human"], "name_for_human");
    validateMaxLength(
      ctx,
      content,
      ["name_for_human"],
      "name_for_human",
      2048,
      DiagnosticSeverity.Warning
    );
  }

  // Validate description_for_model (max 2048 chars, warn at 20)
  if (obj.description_for_model !== undefined) {
    validateNotEmpty(ctx, content, ["description_for_model"], "description_for_model");
    // Note: TypeSpec says 20 chars for brevity warning, but schema allows 2048
    validateMaxLength(
      ctx,
      content,
      ["description_for_model"],
      "description_for_model",
      2048,
      DiagnosticSeverity.Warning
    );
  }

  // Validate description_for_human (max 100 chars)
  if (obj.description_for_human !== undefined) {
    validateNotEmpty(ctx, content, ["description_for_human"], "description_for_human");
    validateMaxLength(
      ctx,
      content,
      ["description_for_human"],
      "description_for_human",
      100,
      DiagnosticSeverity.Warning
    );
  }

  // Validate functions array
  validateFunctions(ctx, content);
}

/**
 * Validate functions array
 */
function validateFunctions(ctx: DiagnosticContext, content: unknown): void {
  const functions = getValueAtPath(content, ["functions"]);
  if (!Array.isArray(functions)) {
    return;
  }

  // Validate each function
  forEachArrayItem<ActionFunction>(content, ["functions"], (func, index, path) => {
    // Function name is required
    validateNotEmpty(ctx, content, [...path, "name"], "name");

    // Function description is required (mirrors TypeSpec @doc requirement)
    if (func.description === undefined) {
      reportDiagnosticAtPath(
        ctx,
        path,
        "M365-001",
        "Function requires a description",
        DiagnosticSeverity.Error
      );
    } else {
      validateNotEmpty(ctx, content, [...path, "description"], "description");
    }
  });
}

/**
 * Validate actions in a declarative agent (within capabilities)
 */
export function validateAgentActions(
  ctx: DiagnosticContext,
  content: unknown,
  capabilityPath: (string | number)[]
): void {
  const capability = getValueAtPath(content, capabilityPath);
  if (!capability || typeof capability !== "object") {
    return;
  }

  const capObj = capability as Record<string, unknown>;

  // Check if this is an actions capability
  if (capObj.name !== "Actions") {
    return;
  }

  // Validate actions array (1-10 items when present)
  const actionsPath = [...capabilityPath, "actions"];
  const actions = getValueAtPath(content, actionsPath);

  if (Array.isArray(actions)) {
    validateArrayMinLength(ctx, content, actionsPath, "actions", 1);
    validateArrayMaxLength(ctx, content, actionsPath, "actions", 10);
  }
}
