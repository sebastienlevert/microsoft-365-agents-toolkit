// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DiagnosticContext, reportDiagnosticAtPath } from "../../diagnostics/diagnostic-reporter";
import { validateNotEmpty, getValueAtPath, forEachArrayItem } from "../utils";
import { DiagnosticSeverity } from "../../types";

interface ScenarioModel {
  id: string;
}

interface ScenarioModelsCapability {
  name: "ScenarioModels";
  models?: ScenarioModel[];
}

/**
 * Validate ScenarioModels capability
 */
export function validateScenarioModels(
  ctx: DiagnosticContext,
  content: unknown,
  capabilityPath: (string | number)[]
): void {
  const capability = getValueAtPath(content, capabilityPath) as ScenarioModelsCapability;
  if (!capability || capability.name !== "ScenarioModels") {
    return;
  }

  const modelsPath = [...capabilityPath, "models"];
  const models = getValueAtPath(content, modelsPath);

  if (!Array.isArray(models) || models.length === 0) {
    reportDiagnosticAtPath(
      ctx,
      capabilityPath,
      "M365-001",
      "ScenarioModels capability requires at least one model",
      DiagnosticSeverity.Error
    );
    return;
  }

  // Validate each model
  forEachArrayItem<ScenarioModel>(content, modelsPath, (model, index, itemPath) => {
    // Model ID is required
    validateNotEmpty(ctx, content, [...itemPath, "id"], "id");
  });
}
