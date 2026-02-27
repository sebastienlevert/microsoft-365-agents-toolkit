// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DiagnosticContext } from "../../diagnostics/diagnostic-reporter";
import { getValueAtPath } from "../utils";
import { validateNotEmpty, forEachArrayItem } from "../utils";

interface DataverseKnowledge {
  host_name?: string;
  tables?: Array<{ table_name: string }>;
}

interface DataverseCapability {
  name: "Dataverse";
  knowledge_sources?: DataverseKnowledge[];
}

/**
 * Validate Dataverse capability
 */
export function validateDataverse(
  ctx: DiagnosticContext,
  content: unknown,
  capabilityPath: (string | number)[]
): void {
  const capability = getValueAtPath(content, capabilityPath) as DataverseCapability;
  if (!capability || capability.name !== "Dataverse") {
    return;
  }

  const sourcesPath = [...capabilityPath, "knowledge_sources"];
  const sources = getValueAtPath(content, sourcesPath);

  if (!Array.isArray(sources)) {
    return;
  }

  forEachArrayItem<DataverseKnowledge>(content, sourcesPath, (source, sourceIndex, sourcePath) => {
    // Validate host_name is not empty if present
    if (source.host_name !== undefined) {
      validateNotEmpty(ctx, content, [...sourcePath, "host_name"], "host_name");
    }

    // Validate tables
    const tablesPath = [...sourcePath, "tables"];
    const tables = getValueAtPath(content, tablesPath);

    if (Array.isArray(tables)) {
      forEachArrayItem<{ table_name: string }>(
        content,
        tablesPath,
        (table, tableIndex, tablePath) => {
          validateNotEmpty(ctx, content, [...tablePath, "table_name"], "table_name");
        }
      );
    }
  });
}
