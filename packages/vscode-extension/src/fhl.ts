import * as vscode from "vscode";
import { activateAnalyzeInstructions } from "./fhl/analyzeInstructions";
import { activateGenerateInstructions } from "./fhl/generateInstructions";

export function activateFhl(context: vscode.ExtensionContext) {
    activateAnalyzeInstructions(context);
    activateGenerateInstructions(context);
};
  