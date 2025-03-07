import * as vscode from "vscode";

export interface AnalysisData {
  clarityScore: number;
  corrections?: Correction[];
  // Fallback properties (if corrections isn’t provided)
  ambiguousSections?: string[];
  suggestions?: string[];
}

export interface Correction {
  phrase: string;
  suggestion: string;
}

// Sends a request to the configured LLM endpoint
export async function sendLLMRequest(systemPrompt: string, userPrompt: string): Promise<any> {
  const models = await vscode.lm.selectChatModels({
    vendor: "copilot",
  });

  if (models.length > 0) {
    const model = models.find((m) => m.family === "gpt-4o");
    const messages = [
      vscode.LanguageModelChatMessage.Assistant(systemPrompt),
      vscode.LanguageModelChatMessage.User(userPrompt),
    ];

    let chatResponse: vscode.LanguageModelChatResponse | undefined;

    try {
      chatResponse = await model!.sendRequest(
        messages,
        {},
        new vscode.CancellationTokenSource().token
      );
    } catch (err) {
      if (err instanceof vscode.LanguageModelError) {
        console.log(err.message, err.code, err.name);
      } else {
        throw err;
      }
      return;
    }

    let allFragments = [];
    for await (const fragment of chatResponse.text) {
      allFragments.push(fragment);
    }

    const response = allFragments.join("");
    return response;
  } else {
    setTimeout(() => {
      return sendLLMRequest(systemPrompt, userPrompt);
    }, 5000);
  }
}
