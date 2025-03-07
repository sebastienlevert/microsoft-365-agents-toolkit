

import * as vscode from "vscode";
import { sendLLMRequest } from "./common";
import path from "path";
  
function getFileUri(fileName: string): vscode.Uri {
  return vscode.Uri.file(path.join(vscode.workspace.rootPath!, fileName));
}

async function getAvailableCapabilities(): Promise<string> {
  // load the declarativeAgent.json file and return the capabilities array

  const doc = await vscode.workspace.openTextDocument(getFileUri('appPackage/declarativeAgent.json'));
  let text = doc.getText();
  const agentData = JSON.parse(text);
  return agentData.capabilities?.join(', ');
}

async function getAvailableActions(): Promise<string> {
  // load the declarativeAgent.json file and return the capabilities array
  const doc = await vscode.workspace.openTextDocument(getFileUri('appPackage/declarativeAgent.json'));
  let text = doc.getText();
  const agentData = JSON.parse(text);

  let agentActions: any[] = [];
  for(const action of agentData.actions) { 
    let pluginText: string = "";
    let openAPIText: string = "";
    const plugin = await vscode.workspace.openTextDocument(getFileUri(`appPackage/${action.file}`));
    if(plugin) {
      pluginText = plugin.getText();
      let pluginData = JSON.parse(pluginText);

      const openAPI = await vscode.workspace.openTextDocument(getFileUri(`appPackage/${pluginData.runtimes[0].spec.url}`));
      if(openAPI) {
        openAPIText = openAPI.getText();
      }
    }

    agentActions.push({ plugin: pluginText, openAPI: openAPIText });


  };

  return JSON.stringify(agentActions);
}

export function activateGenerateInstructions(context: vscode.ExtensionContext) {
// Update the generate command registration in the activate function
    let generateDisposable = vscode.commands.registerCommand('fx-extension.generateInstructions', async () => {

    // Get the active editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor found. Please open instruction.txt');
      return;
    }

    const fileName = editor.document.fileName;
    if (!fileName.endsWith('instruction.txt')) {
      vscode.window.showWarningMessage('Please open instruction.txt before generating instructions.');
      return;
    }

    // Get agent description from user
    const agentDescription = await vscode.window.showInputBox({
      prompt: 'Describe the AI agent (its purpose, capabilities, and constraints)',
      placeHolder: 'e.g., A coding assistant that helps developers write and review code...',
      ignoreFocusOut: true
    });

    if (!agentDescription) {
      vscode.window.showInformationMessage('Operation cancelled - no agent description provided.');
      return;
    }



    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Generating instructions...",
      cancellable: false
    }, async () => {
      try {
        const systemPrompt = `
                You are an AI assistant that generates clear and precise instructions for AI agents. 
                Generate a detailed set of instructions that demonstrates good practices for agent instruction writing.`;

        const inputText = `
          Generate a comprehensive set of instructions for an AI agent with the following description:
            ${agentDescription}
          Provide clear, specific, and unambiguous instructions that will guide this agent in performing its tasks effectively.
          You are always there to help the user and you can only operate via questions and answers. You can't run specific code.
          These capabilities are available: ${JSON.stringify(await getAvailableCapabilities())}
          These actions are available: ${JSON.stringify(await getAvailableActions())}
          `;        

        let response = await sendLLMRequest(systemPrompt, inputText);
        console.log("Raw response:", response);

        // Get current content
        const currentContent = editor.document.getText();
        
        // Add new instructions with a separator if there's existing content
        const newContent = currentContent 
          ? `${currentContent}\n\n${response}`
          : `${response}`;
        
        // Replace entire document content
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        
        await editor.edit(editBuilder => {
          editBuilder.replace(fullRange, newContent);
        });
        
        vscode.window.showInformationMessage('Instructions generated and added to instruction.txt');
      } catch (error: any) {
        console.error("Error generating instructions:", error);
        vscode.window.showErrorMessage(`Failed to generate instructions: ${error.message}`);
      }
    });
  });

  context.subscriptions.push(generateDisposable);
  }
  