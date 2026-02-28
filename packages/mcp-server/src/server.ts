// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchSchema, SchemaTypeEnum } from "./fetcher";
import { retrieveResource } from "./retriever";
import { CopilotValidation, validateCopilotManifest } from "@microsoft/app-manifest";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "m365agentstoolkit-mcp",
    version: "0.1.0",
  });
  server.tool(
    "get_schema",
    'Get the schema for "App manifest", "Declarative agent manifest", "API plugin manifest", "M365 agents yaml", use it everytime before understanding, modifying or creating any of these manifest files.',
    {
      schema_name: SchemaTypeEnum.describe("name of schema"),
      schema_version: z
        .string()
        .describe(
          'version of schema in semantic versioning format vX.Y, where X is the major version and Y is the minor version (e.g. v1.0, v1.19, v2.1). Use "latest" if unsure.'
        ),
    },
    async ({ schema_name, schema_version }) => {
      const schema = await fetchSchema(schema_name, schema_version);

      return {
        content: [
          {
            type: "text",
            text: schema,
          },
        ],
      };
    }
  );

  server.tool(
    "get_knowledge",
    "Access comprehensive knowledge about Microsoft 365 and Microsoft 365 Copilot development. Use this tool everytime for questions related to Microsoft 365 and Microsoft 365 Copilot.",
    {
      question: z.string().describe("Question to use for knowledge retrieval"),
    },
    async ({ question }) => {
      const result = await retrieveResource("documents", question);

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    }
  );

  server.tool(
    "get_code_snippets",
    "Access templates and code snippets for Microsoft 365 and Microsoft 365 Copilot development, focusing on SDKs such as **@microsoft/teams-ai**, **@microsoft/teams-js**, and **botbuilder**. Use this tool when looking for implementation examples, starter templates, or SDK usage patterns.",
    {
      question: z
        .string()
        .describe(
          "Query to find relevant code snippets related to Microsoft 365 app or agent SDKs"
        ),
    },
    async ({ question }) => {
      const result = await retrieveResource("code", question);

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    }
  );

  server.tool(
    "troubleshoot",
    "Access troubleshooting solutions for common Microsoft 365 and Microsoft 365 Copilot development issues. Use this tool when encountering errors, unexpected behaviors, or implementation challenges.",
    {
      question: z.string().describe("Description of the issue or error you're experiencing"),
    },
    async ({ question }) => {
      const result = await retrieveResource("issues", question);

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    }
  );

  server.tool(
    "validate_agent",
    "Validate a declarative agent or API plugin manifest JSON with deep semantic checks. Returns structured errors and warnings with line numbers, fix hints, and diagnostic codes. Use this before submitting or deploying an agent.",
    {
      manifest: z
        .string()
        .describe(
          "The full JSON content of the declarative agent or API plugin manifest to validate"
        ),
      filename: z
        .string()
        .optional()
        .describe("Optional file path for the manifest (enables file-reference validation)"),
    },
    async ({ manifest, filename }) => {
      const result = await validateCopilotManifest(manifest, {
        filename: filename,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "get_validation_rules",
    "Get the list of all available validation rules for declarative agent and API plugin manifests. Returns rule IDs, descriptions, severity levels, and what each rule checks.",
    {},
    async () => {
      const rules = await Promise.resolve(CopilotValidation.getValidationRules());
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(rules, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "suggest_fixes",
    "Get fix suggestions for validation errors found in a declarative agent or API plugin manifest. Provide the manifest JSON to get targeted fix guidance for all issues.",
    {
      manifest: z.string().describe("The full JSON content of the manifest with validation errors"),
    },
    async ({ manifest }) => {
      const fixes = await Promise.resolve(CopilotValidation.suggestFixes(manifest));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(fixes, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "analyze_instructions_quality",
    "Analyze the quality of a declarative agent's instructions using LLM-powered analysis. Returns a structured prompt for you to evaluate and report on contradictions, persona consistency, cognitive load, coverage gaps, and safety concerns. Run validate_agent first for static analysis, then use this for deeper semantic analysis.",
    {
      content: z
        .record(z.unknown())
        .optional()
        .describe("The declarative agent JSON content containing instructions to analyze."),
      instructions_text: z
        .string()
        .optional()
        .describe(
          "Raw instructions text to analyze. Use this if instructions are in a separate file. If both content and instructions_text are provided, instructions_text takes precedence."
        ),
    },
    async ({ content, instructions_text }) => {
      return await Promise.resolve().then(() => {
        let instructionsText = instructions_text;
        let capabilities: string[] = [];
        let actions: string[] = [];

        if (!instructionsText && content) {
          const instructions = content.instructions;
          if (typeof instructions === "string") {
            instructionsText = instructions;
          }
          if (Array.isArray(content.capabilities)) {
            capabilities = (content.capabilities as Array<{ name?: string }>)
              .map((c) => c.name)
              .filter(Boolean) as string[];
          }
          if (Array.isArray(content.actions)) {
            actions = (content.actions as Array<{ id?: string }>)
              .map((a) => a.id)
              .filter(Boolean) as string[];
          }
        }

        if (!instructionsText) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error:
                    "No instructions found. Provide either agent content with instructions or instructions_text directly.",
                }),
              },
            ],
          };
        }

        const analysisPrompt = CopilotValidation.buildInstructionsAnalysisPrompt(instructionsText, {
          capabilities,
          actions,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Please analyze these instructions and report any issues found:\n\n${analysisPrompt}`,
            },
          ],
        };
      });
    }
  );

  return server;
}
