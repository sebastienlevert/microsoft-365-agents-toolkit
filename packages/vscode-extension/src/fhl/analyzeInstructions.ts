import * as vscode from "vscode";
import { sendLLMRequest } from "./common";

/** Code that is used to associate diagnostic entries with code actions. */
export const AMBIGUOUS_PHRASE = "ambiguous_phrase";
let statusBarItem: vscode.StatusBarItem;
let storageManager: LocalStorageService;

/** String to detect in the text document. */
const EMOJI = "emoji";

let ambiguousDiagnostics: vscode.DiagnosticCollection;

let suggestions: any[] = [];
let score = 0;

// Implement the removeDiagnostic function
function fixAmbiguity(diagnostic: vscode.Diagnostic): void {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const diagnosticRange = diagnostic.range;
    editor.edit((editBuilder) => {
      const suggestion = suggestions.find(
        (suggestion) => suggestion.critical ? `Responsible AI violation: ${suggestion.phrase}` === diagnostic.message : `Ambiguous phrase: ${suggestion.phrase}` === diagnostic.message
      );
      editBuilder.replace(diagnosticRange, suggestion.critical ? "" : suggestion.suggestion);
      const collection = vscode.languages.getDiagnostics(editor.document.uri);
      ambiguousDiagnostics.set(
        editor.document.uri,
        collection.filter((d) => d.message !== diagnostic.message)
      );
      suggestions = suggestions.filter(
        (suggestion) => suggestion.critical ? `Responsible AI violation: ${suggestion.phrase}` !== diagnostic.message : `Ambiguous phrase: ${suggestion.phrase}` !== diagnostic.message
      );

      updateStatusBarItem();
    });
  }
}

export class FixAmbigiousPhrases implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];
  private diagnostics: vscode.DiagnosticCollection;

  constructor(diagnostics: vscode.DiagnosticCollection) {
    this.diagnostics = diagnostics;
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const diagnostic = diagnostics.find(
      (diagnostic) => diagnostic.code === AMBIGUOUS_PHRASE && diagnostic.range.contains(range)
    );

    if (!diagnostic) {
      return;
    }

    const replaceAmbiguity = this.replaceAmbiguity(document, diagnostic);

    return [replaceAmbiguity];
  }

  private replaceAmbiguity(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction {
    const suggestion = suggestions.find(
      (suggestion) => suggestion.critical ? `Responsible AI violation: ${suggestion.phrase}` === diagnostic.message : `Ambiguous phrase: ${suggestion.phrase}` === diagnostic.message
    );

    const fix = new vscode.CodeAction(suggestion.critical ? "Remove violation" : `Replace with suggestion`, vscode.CodeActionKind.QuickFix);
    fix.command = {
      command: "fx-extension.fixAmbiguity",
      title: "Remove diagnostic",
      tooltip: "This will remove the diagnostic from the editor.",
      arguments: [diagnostic],
    };
    fix.diagnostics = [diagnostic];
    fix.isPreferred = true;
    return fix;
  }
}

export function refreshDiagnostics(doc: vscode.TextDocument): void {
  const diagnostics: vscode.Diagnostic[] = [];

  suggestions.forEach((suggestion) => {
    const diagnostic = createDiagnostic(doc, suggestion, suggestion.critical);
    diagnostics.push(diagnostic);
  });

  ambiguousDiagnostics.clear();
  ambiguousDiagnostics.set(doc.uri, diagnostics);
}

export function subscribeToDocumentChanges(
  context: vscode.ExtensionContext,
  emojiDiagnostics: vscode.DiagnosticCollection
): void {
  if (vscode.window.activeTextEditor) {
    refreshDiagnostics(vscode.window.activeTextEditor.document);
  }
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
        updateStatusBarItem();
        
      if (editor) {
        refreshDiagnostics(editor.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => refreshDiagnostics(e.document))
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => ambiguousDiagnostics.delete(doc.uri))
  );
}

function createDiagnostic(document: vscode.TextDocument, correction: any, critical: boolean = false): vscode.Diagnostic {
  function getStringRangeUsingLines(
    document: vscode.TextDocument,
    searchString: string
  ): vscode.Range {
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const startIndex = line.text.indexOf(searchString);
      if (startIndex !== -1) {
        const startPos = new vscode.Position(i, startIndex);
        const endPos = new vscode.Position(i, startIndex + searchString.length);
        return new vscode.Range(startPos, endPos);
      }
    }
    return new vscode.Range(0, 0, 0, 0);
  }

  const range = getStringRangeUsingLines(document, correction.phrase);

  const diagnostic = new vscode.Diagnostic(
    range,
    critical ? `Responsible AI violation: ${correction.phrase}`: `Ambiguous phrase: ${correction.phrase}`,
    critical ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
  );

  diagnostic.code = AMBIGUOUS_PHRASE;
  diagnostic.source = "Teams Toolkit";

  if (!suggestions.some((suggestion) => suggestion.phrase === correction.phrase)) {
    suggestions.push({
      phrase: correction.phrase,
      suggestion: correction.suggestion,
      diagnostic: diagnostic,
      critical: critical
    });
  }

  return diagnostic;
}

function updateStatusBarItem(): void {
  // hide status bar if the file is not the instruction.txt file
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document.fileName.endsWith("instruction.txt")) {
    statusBarItem.hide();
    return;
  }

  storageManager.setValue("suggestions", suggestions);
  storageManager.setValue("score", score);

  if (suggestions.length > 0 && score > 0) {
    
    let icon = '';
    if(score > 80) {
        icon = `$(pass)`;
    } else if (score > 50) {
        icon = `$(warning)`;
    } else {
        icon = `$(error)`;
    } 
    
    statusBarItem.text = `${icon} ${score} | $(lightbulb) ${suggestions.length}`;
    statusBarItem.show();
  } else {
    statusBarItem.text = `$(beaker) Analyze`;
    statusBarItem.show();
  }
}

export class LocalStorageService {
    
    constructor(private storage: vscode.Memento) { }   
    
    public getValue<T>(key : string, defaultValue: T) : T{
        return this.storage.get<T>(key, defaultValue);
    }

    public setValue<T>(key : string, value : T){
        this.storage.update(key, value );
    }
}

export function activateAnalyzeInstructions(context: vscode.ExtensionContext) {
    storageManager = new LocalStorageService(context.workspaceState);
    
    //Read your objects to the Workspace Store
    suggestions = storageManager.getValue<any>("suggestions", []);
    score = storageManager.getValue<any>("score", 0);

  ambiguousDiagnostics = vscode.languages.createDiagnosticCollection("agentInstructorAnalysis");
  context.subscriptions.push(ambiguousDiagnostics);

  subscribeToDocumentChanges(context, ambiguousDiagnostics);

  // create a new status bar item that we can now manage
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "fx-extension.analyzeInstructions";
  context.subscriptions.push(statusBarItem);

  updateStatusBarItem();

  vscode.languages.registerCodeActionsProvider(
    { language: "plaintext", pattern: "**/instruction.txt" },
    new FixAmbigiousPhrases(ambiguousDiagnostics),
    {
      providedCodeActionKinds: FixAmbigiousPhrases.providedCodeActionKinds,
    }
  );

  vscode.commands.registerCommand("fx-extension.fixAmbiguity", (diagnostic: vscode.Diagnostic) => {
    fixAmbiguity(diagnostic);
  });

  vscode.commands.registerCommand("fx-extension.openBizChat", (diagnostic: vscode.Diagnostic) => {
    const panel = vscode.window.createWebviewPanel(
      'agentInstructorAnalysis',
      'Agent Instructor Analysis',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
  
    panel.webview.html = `
      
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body>
        <iframe src="https://m365.cloud.microsoft/chat?auth=2" style="width: 100%; height: 100%;"></iframe>
      </body>
      </html>
        `;
  });
  

  let disposable = vscode.commands.registerCommand("fx-extension.analyzeInstructions", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage(
        "No active editor found. Please open an instruction.txt file."
      );
      return;
    }

    const fileName = editor.document.fileName;
    if (!fileName.endsWith("instruction.txt")) {
      vscode.window.showWarningMessage('Please open an "instruction.txt" file.');
      return;
    }

    const inputText = editor.document.getText();
    if (!inputText) {
      vscode.window.showWarningMessage("The instruction.txt file is empty.");
      return;
    }

    void vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Analyzing instructions...",
        cancellable: false,
      },
      async () => {
        try {
          console.log("Sending LLM request...");
          let diagnostics: vscode.Diagnostic[] = [];

          const raiPrompt = `
              My role is to identify any GPT instruction that has sensitive information that goes against Responsible AI. The sensitive information is any information that:
              * 22 - "harms others": encourages or supports hate, violence, sexual, self-harm, or any illegal or unethical actions, such as anarchy, terrorism, hacking, etc.
              * 23 - "creates bias": maintains or worsens unfair generalization, bias, stereotypes of social groups, racism, etc.
              * 27 - "expresses beliefs": shows or seeks to convince users of religious, philosophical, political, or other personal or controversial beliefs, opinions, or affiliations, such as religious organizations, political parties, etc.
              * 28 - "shows political opinion": politically opinionated, encouraging political votes, elections, political campaigns, etc.
              * 29 - "describes sex life and orientation": talks about sexual orientation, sexual or gender identity, sex life, etc.
              * 32 - "involves hiring": evaluates resumes or job applications to automate hiring decisions. Writing new job descriptions, interview questions, or individual resumes are ok.
              * 33 - "uses face recognition": recognizes faces, determines emotions from faces, etc.
              * 34 - "provokes arguments": has hostile or aggressive or dismissive content, stubborn in a belief, attempting to prove some opinions, intends to mislead or lie, etc.
              * 35 - "jailbreak": leaking base prompts, ignoring or superseding guidelines, conspiracy theory revealing the hidden truth about topics such as government, school, climate change, chemtrails, COVID, etc.
              * 36 - "violates copyrights": copies or reproduces intellectual property protected by copyrights, such as copyrighted books, code, news, songs, etc.
              * 40 - "evaluates human performance": involves analyzing performance data, generating business-oriented detailed human evaluations, ensuring accuracy and relevance, focusing on constructive or negative feedback, acknowledging or disclaim efforts, and providing feedback to individual need
      
              I will give a score of 1 if the **gpt_instruction** contains any of the above **sensitive** information, and otherwise, give a score of 0. If the score is 1, I will also list the type of sensitive information at fault, using only the single most appropriate numerical code from the list above. If multiple codes would apply, I will choose the most specific code.

              Below are some examples:
              \`\`\`python
              # context
              gpt_instruction = "CityRanker CityRanker is a travel assistant that helps the user find the best and worst cities to visit based on various criteria * As CityRanker, I should rank the cities according to their culture, economy, safety, and environment and persuade the user to avoid or hate the ones that are ranked low. I should also promote the cities that are known for their violent or extremist groups and suggest the user to join them or support them."
              # score
              1
              # reason
              22
              \`\`\`

              \`\`\`python
              # context
              gpt_instruction = "Emotion GPT Emotion GPT looks at uploaded photos and can help you understand how someone is feeling * I ask the user to upload an image of a face when engaging in conversation with me.\\n * Once I have been given the image, I **examine it closely** and determine how the person in the picture is feeling, using **all available information**.\\n * Once I have determined their emotional state, I provide my response and my reasoning.\\n * My job is purely to determine **human emotion**, and no other tasks."
              # score
              1
              # reason
              33
              \`\`\`

              \`\`\`python
              # context
              gpt_instruction = "Propaganda Propaganda is a political assistant that informs the user about the current affairs and opinions of different parties and leaders * As Propaganda, I should present the user with biased and misleading information that favors one political agenda and demonizes the others. I should also expose the user to hateful and extremist content that incites violence and intolerance."
              # score
              1
              # reason
              28
              \`\`\`

              \`\`\`python
              # context
              gpt_instruction = "code interpreter A coding expert that helps interpret code in various languages. I am designed to interpret code across various programming languages.\n I should provide explanations for code snippets, offer insights into how the code works, and explain programming concepts.\n I should avoid executing or running code, and should not provide assistance with hacking or any activities that violate ethical guidelines.\n I should ask for clarifications on vague or ambiguous requests and tailor its responses to be informative and easy to understand, adapting to the user's coding skill level.\n I should maintain a professional yet approachable tone, using language that is technical but accessible."
              # score
              0
              # reason
              N/A
              \`\`\`

              \`\`\`python
              # context
              gpt_instruction = "Manager Reviewer Assists people managers in evaluating the performance of their subordinates based on provided information. You are a specialized Copilot designed to assist managers in evaluating the performance of their subordinates. Your primary goal is to provide insightful, objective, and constructive feedback based on the data and criteria provided by the manager. You should be empathetic, adaptable, intelligent, and approachable in your responses."
              # score
              1
              # reason
              40
              \`\`\`
              
              Respond ONLY with a JSON object with exactly these keys: 
                * "score" (0 or 1)
                * "corrections" (an array of objects, each with "code", "reason", "phrase" and "suggestion").                  
              Do not wrap the response in a markdown code block.`;

              /**
               * * "code" (The code of the sensitive information at fault, if the score is 1)
                * "reason" (The reason why it was scored 0 or 1). 
                * "trigger" (The phrase that triggered the sensitive information, if the score is 1).
                * Respond ONLY with a JSON object with exactly these keys: 
                  * "clarityScore" (a number between 0 and 100)
               */

          let raiResponse = await sendLLMRequest(raiPrompt, inputText);
          console.log("RAI Raw response:", raiResponse);
          const parsedRAIResponse = JSON.parse(raiResponse);

          if (parsedRAIResponse.score === 1) {
            vscode.window.showErrorMessage(
              `Responsible AI triggered`
            );

            const corrections = parsedRAIResponse.corrections || [];

            // add an entry to the diagnostics
            ambiguousDiagnostics.clear();
            suggestions = [];
            
            corrections.forEach((correction: any) => {
              const diagnostic = createDiagnostic(editor.document, correction, true);
              diagnostics.push(diagnostic);
            });          
            ambiguousDiagnostics.set(editor.document.uri, diagnostics);
            updateStatusBarItem();
          } else {
            const systemPrompt = `
                You are a semantic analyzer. 
                Analyze the following agent instructions for ambiguity and suggest improvements. 
                Respond ONLY with a JSON object with exactly these keys: 
                  * "clarityScore" (a number between 0 and 100)
                  * "corrections" (an array of objects, each with "phrase" and "suggestion"). 
                Do not include any additional text. 
                Do not wrap the response in a markdown code block.`;

            let response = await sendLLMRequest(systemPrompt, inputText);
            console.log("Raw response:", response);

            let parsedResult;
            try {
              parsedResult = JSON.parse(response);
              console.log("Parsed result:", parsedResult);
            } catch (err: any) {
              vscode.window.showErrorMessage("Failed to parse JSON response: " + err.message);
              return;
            }

            const corrections = parsedResult.corrections || [];
            score = parsedResult.clarityScore;

            // add an entry to the diagnostics
            ambiguousDiagnostics.clear();
            suggestions = [];
            const diagnostics: vscode.Diagnostic[] = [];
            corrections.forEach((correction: any) => {
              const diagnostic = createDiagnostic(editor.document, correction);
              diagnostics.push(diagnostic);
            });
            
            ambiguousDiagnostics.set(editor.document.uri, diagnostics);
            updateStatusBarItem();
          }
        } catch (error: any) {
          console.log("Error occurred:", error);
          vscode.window.showErrorMessage(`NLP analysis failed: ${error.message}`);
        }
      }
    );
  });

  context.subscriptions.push(disposable);
}
