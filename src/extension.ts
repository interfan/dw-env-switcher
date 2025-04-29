import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface SandboxConfig {
    name: string;
    hostname: string;
    "code-version": string;
    username?: string;
    password?: string;
    cartridges?: string[];  // Type cartridges as string array
}

export function activate(context: vscode.ExtensionContext) {
    let disposableSimple = vscode.commands.registerCommand('dw-env-switcher.selectSandbox', async () => {
        await simpleSandboxSelection(context);
    });

    let disposableAdvanced = vscode.commands.registerCommand('dw-env-switcher.selectSandboxWithDetails', async () => {
        await detailedSandboxSelection(context);
    });

    let disposableDeleteUser = vscode.commands.registerCommand('dw-env-switcher.deleteSavedUsername', async () => {
        await deleteSavedUsername(context);
    });

    let disposableDeleteSandbox = vscode.commands.registerCommand('dw-env-switcher.deleteSavedSandbox', async () => {
        await deleteSavedSandbox(context);
    });

    context.subscriptions.push(disposableSimple);
    context.subscriptions.push(disposableAdvanced);
    context.subscriptions.push(disposableDeleteUser);
    context.subscriptions.push(disposableDeleteSandbox);
}

// Helper function to extract the folder name from the full directory path
function getCartridgeFolderNames(directories: string[]): string[] {
    return directories.map(dir => path.basename(dir));  // Get the last part of the path (the folder name)
}

// Function to check if a folder contains both .project and cartridges folder (either directly or inside 'cartridges' folder)
async function getCartridgesFromDirectory(workspacePath: string): Promise<string[]> {
    if (!fs.existsSync(workspacePath)) {
        return [];  // If the workspace doesn't exist, return an empty array
    }

    let validDirectories: string[] = [];

    // Recursive function to scan directories and subdirectories
    function scanDirectory(dirPath: string) {
        const directories = fs.readdirSync(dirPath, { withFileTypes: true });

        directories.forEach((dir) => {
            const fullPath = path.join(dirPath, dir.name);

            if (dir.isDirectory()) {
                // Check for .project and cartridges (or cartridge) folder
                const projectFileExists = fs.existsSync(path.join(fullPath, '.project'));
                const cartridgesFolderExists = fs.existsSync(path.join(fullPath, 'cartridges')) || fs.existsSync(path.join(fullPath, 'cartridge'));

                // If both .project and cartridges folder are found, add it to valid directories
                if (projectFileExists && cartridgesFolderExists) {
                    validDirectories.push(fullPath); // Add the full path to the valid directories list
                }

                // Recurse into subdirectories
                scanDirectory(fullPath);
            }
        });
    }

    // Start scanning from the root workspace
    scanDirectory(workspacePath);

    return validDirectories;
}

async function simpleSandboxSelection(context: vscode.ExtensionContext) {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace is open.');
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const envFilePath = path.join(workspacePath, 'dw-envs.json');
        const dwFilePath = path.join(workspacePath, 'dw.json');

        // Check if dw-envs.json exists, if not call detailedSandboxSelection to handle its creation
        if (!fs.existsSync(envFilePath)) {
            vscode.window.showInformationMessage('dw-envs.json does not exist. Calling detailed sandbox selection...');
            await detailedSandboxSelection(context);  // Call the detailedSandboxSelection if dw-envs.json is missing
            return;  // Exit after calling the detailed sandbox selection
        }

        // If dw-envs.json exists, proceed with the rest of the logic
        const envFileContent = fs.readFileSync(envFilePath, 'utf-8');
        const parsedEnv = JSON.parse(envFileContent);
        const sandboxes: SandboxConfig[] = parsedEnv.sandboxes;

        const sandboxNames = sandboxes.map((sb: SandboxConfig) => sb.name);
        const selectedSandboxName = await vscode.window.showQuickPick(sandboxNames, {
            placeHolder: 'Select a sandbox environment',
        });

        if (!selectedSandboxName) return;

        const selectedSandbox = sandboxes.find(sb => sb.name === selectedSandboxName);
        if (!selectedSandbox) {
            vscode.window.showErrorMessage('Selected sandbox configuration not found.');
            return;
        }

        let globalUsername = context.globalState.get<string>('dw-username');
        let globalPassword = context.globalState.get<string>('dw-password');

        if (!globalUsername || !globalPassword) {
            globalUsername = await vscode.window.showInputBox({
                prompt: 'Enter your global sandbox username',
                ignoreFocusOut: true,
            });

            globalPassword = await vscode.window.showInputBox({
                prompt: 'Enter your global sandbox password',
                ignoreFocusOut: true,
                password: true
            });

            if (!globalUsername || !globalPassword) {
                vscode.window.showErrorMessage('Username or password was not entered.');
                return;
            }

            await context.globalState.update('dw-username', globalUsername);
            await context.globalState.update('dw-password', globalPassword);
        }

        const finalUsername = selectedSandbox.username || globalUsername;
        const finalPassword = selectedSandbox.password || globalPassword;

        // Ask if the user wants to choose which directories to use
        const chooseCartridges = await vscode.window.showQuickPick(
            ['Yes', 'No'],
            {
                placeHolder: 'Do you want to choose which cartridges you will upload?',
            }
        );

        if (chooseCartridges === 'Yes') {
            // Get available directories from the workspace
            const availableDirectories = await getCartridgesFromDirectory(workspacePath);

            // Get only the folder names (not full paths)
            const folderNames = getCartridgeFolderNames(availableDirectories);

            // Show directories in a QuickPick list for the user to choose from
            const selectedDirectories = await vscode.window.showQuickPick(folderNames, {
                placeHolder: 'Select directories to include in the sandbox (Ctrl+Click to select multiple)',
                canPickMany: true,  // Allow multiple selection
            });

            // Add selected directories to the selectedSandbox object
            if (selectedDirectories) {
                selectedSandbox.cartridges = selectedDirectories;
            }
        }

        const dwConfig = {
            hostname: selectedSandbox.hostname,
            username: finalUsername,
            password: finalPassword,
            'code-version': selectedSandbox['code-version'],
            cartridges: selectedSandbox.cartridges || []  // Add the directories to the dw.json
        };

        fs.writeFileSync(dwFilePath, JSON.stringify(dwConfig, null, 4));
        vscode.window.showInformationMessage(`dw.json updated with selected details.`);
    } catch (error) {
        vscode.window.showErrorMessage('Error selecting sandbox: ' + (error as Error).message);
    }
}

async function detailedSandboxSelection(context: vscode.ExtensionContext) {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace is open.');
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const dwFilePath = path.join(workspacePath, 'dw.json');
        const envFilePath = path.join(workspacePath, 'dw-envs.json');

        // Check if dw-envs.json exists, if not create it
        if (!fs.existsSync(envFilePath)) {
            const initialContent = { sandboxes: [] };
            fs.writeFileSync(envFilePath, JSON.stringify(initialContent, null, 4));
            vscode.window.showInformationMessage('dw-envs.json was not found, a new one was created.');
        }

        const savedHostnames = context.globalState.get<string[]>('dw-hostnames') || [];
        const savedUsernames = context.globalState.get<string[]>('dw-usernames') || [];
        const savedCodeVersions = context.globalState.get<string[]>('dw-codeversions') || [];

        // Let the user select an existing hostname or enter a new one
        const hostnameOptions = ['➕ Enter New', ...savedHostnames];
        let selectedHostname = await vscode.window.showQuickPick(hostnameOptions, {
            placeHolder: 'Select or enter a hostname'
        });

        if (!selectedHostname) return;

        if (selectedHostname === '➕ Enter New') {
            selectedHostname = await vscode.window.showInputBox({
                prompt: 'Enter a new hostname',
                ignoreFocusOut: true
            });
            if (!selectedHostname) return;
            if (!savedHostnames.includes(selectedHostname)) {
                savedHostnames.push(selectedHostname);
                await context.globalState.update('dw-hostnames', savedHostnames);
            }
        }

        const usernameOptions = ['➕ Enter New', ...savedUsernames];
        let selectedUsername = await vscode.window.showQuickPick(usernameOptions, {
            placeHolder: 'Select or enter a username'
        });

        if (!selectedUsername) return;

        let selectedPassword: string | undefined;

        if (selectedUsername === '➕ Enter New') {
            selectedUsername = await vscode.window.showInputBox({
                prompt: 'Enter a new username',
                ignoreFocusOut: true
            });
            if (!selectedUsername) return;
            if (!savedUsernames.includes(selectedUsername)) {
                savedUsernames.push(selectedUsername);
                await context.globalState.update('dw-usernames', savedUsernames);
            }
            selectedPassword = await vscode.window.showInputBox({
                prompt: 'Enter password for new username',
                ignoreFocusOut: true,
                password: true
            });
            if (!selectedPassword) return;
            await context.globalState.update(`dw-password-${selectedUsername}`, selectedPassword);
        } else {
            selectedPassword = await context.globalState.get<string>(`dw-password-${selectedUsername}`);
            if (!selectedPassword) {
                selectedPassword = await vscode.window.showInputBox({
                    prompt: `Enter password for username ${selectedUsername}`,
                    ignoreFocusOut: true,
                    password: true
                });
                if (!selectedPassword) return;
                await context.globalState.update(`dw-password-${selectedUsername}`, selectedPassword);
            }
        }

        const codeVersionOptions = ['➕ Enter New', ...savedCodeVersions];
        let selectedCodeVersion = await vscode.window.showQuickPick(codeVersionOptions, {
            placeHolder: 'Select or enter a code version'
        });

        if (!selectedCodeVersion) return;

        if (selectedCodeVersion === '➕ Enter New') {
            selectedCodeVersion = await vscode.window.showInputBox({
                prompt: 'Enter a new code version',
                ignoreFocusOut: true
            });
            if (!selectedCodeVersion) return;
            if (!savedCodeVersions.includes(selectedCodeVersion)) {
                savedCodeVersions.push(selectedCodeVersion);
                await context.globalState.update('dw-codeversions', savedCodeVersions);
            }
        }

        const sandboxName = await vscode.window.showInputBox({
            prompt: 'Enter a name for this sandbox configuration (existing name will be overwritten)',
            ignoreFocusOut: true
        });

        if (!sandboxName) return;

        const sandboxEntry: SandboxConfig = {
            name: sandboxName,
            hostname: selectedHostname,
            username: selectedUsername,
            password: selectedPassword,
            "code-version": selectedCodeVersion,
            cartridges: []  // Explicitly initialize cartridges as an empty array
        };

        // Write sandbox configuration to dw.json
        fs.writeFileSync(dwFilePath, JSON.stringify(sandboxEntry, null, 4));
        vscode.window.showInformationMessage(`dw.json updated with selected details.`);

        let envsContent = { sandboxes: [] as SandboxConfig[] };
        if (fs.existsSync(envFilePath)) {
            try {
                envsContent = JSON.parse(fs.readFileSync(envFilePath, 'utf-8'));
            } catch (error) {
                vscode.window.showWarningMessage('Failed to parse existing dw-envs.json. A new one will be created.');
            }
        }

        const existingIndex = envsContent.sandboxes.findIndex((sb: SandboxConfig) => sb.name === sandboxName);

        if (existingIndex >= 0) {
            envsContent.sandboxes[existingIndex] = sandboxEntry;
        } else {
            envsContent.sandboxes.push(sandboxEntry);
        }

        fs.writeFileSync(envFilePath, JSON.stringify(envsContent, null, 4));
        vscode.window.showInformationMessage(`Saved sandbox '${sandboxName}' in dw-envs.json.`);

        // Ask if user wants to choose cartridges
        const chooseCartridges = await vscode.window.showQuickPick(
            ['Yes', 'No'],
            { placeHolder: 'Do you want to choose directories for cartridges?' }
        );

        if (chooseCartridges === 'Yes') {
            // Get available directories from the workspace
            const availableDirectories = await getCartridgesFromDirectory(workspacePath);

            // Get only the folder names (not full paths)
            const folderNames = getCartridgeFolderNames(availableDirectories);

            // Show directories in a QuickPick list for the user to choose from
            const selectedDirectories = await vscode.window.showQuickPick(folderNames, {
                placeHolder: 'Select directories to include in the sandbox (Ctrl+Click to select multiple)',
                canPickMany: true,  // Allow multiple selection
            });

            // Add selected directories to the sandbox entry
            if (selectedDirectories) {
                sandboxEntry.cartridges = selectedDirectories;
            }

            // Update dw.json with selected cartridges
            const dwConfig = {
                hostname: selectedHostname,
                username: selectedUsername,
                password: selectedPassword,
                'code-version': selectedCodeVersion,
                cartridges: sandboxEntry.cartridges || []  // Update with the selected cartridges
            };

            fs.writeFileSync(dwFilePath, JSON.stringify(dwConfig, null, 4));
            vscode.window.showInformationMessage(`dw.json updated with selected cartridges.`);

            // Update dw-envs.json with selected cartridges
            envsContent.sandboxes = envsContent.sandboxes.map(sb => {
                if (sb.name === sandboxName) {
                    sb.cartridges = sandboxEntry.cartridges;
                }
                return sb;
            });

            fs.writeFileSync(envFilePath, JSON.stringify(envsContent, null, 4));
            vscode.window.showInformationMessage(`dw-envs.json updated with selected cartridges.`);
        }
    } catch (error) {
        vscode.window.showErrorMessage('Error in detailed sandbox selection: ' + (error as Error).message);
    }
}

// Delete saved username
async function deleteSavedUsername(context: vscode.ExtensionContext) {
    try {
        const savedUsernames = context.globalState.get<string[]>('dw-usernames') || [];

        if (savedUsernames.length === 0) {
            vscode.window.showInformationMessage('No saved usernames found.');
            return;
        }

        const usernameToDelete = await vscode.window.showQuickPick(savedUsernames, {
            placeHolder: 'Select a username to delete'
        });

        if (!usernameToDelete) return;

        const updatedUsernames = savedUsernames.filter(u => u !== usernameToDelete);
        await context.globalState.update('dw-usernames', updatedUsernames);
        await context.globalState.update(`dw-password-${usernameToDelete}`, undefined);

        vscode.window.showInformationMessage(`Deleted saved username: ${usernameToDelete}`);
    } catch (error) {
        vscode.window.showErrorMessage('Error deleting saved username: ' + (error as Error).message);
    }
}

// Delete saved sandbox
async function deleteSavedSandbox(context: vscode.ExtensionContext) {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace is open.');
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const envFilePath = path.join(workspacePath, 'dw-envs.json');

        if (!fs.existsSync(envFilePath)) {
            vscode.window.showInformationMessage('No dw-envs.json found.');
            return;
        }

        const envsContent = JSON.parse(fs.readFileSync(envFilePath, 'utf-8'));
        const sandboxes: SandboxConfig[] = envsContent.sandboxes;

        if (!sandboxes || sandboxes.length === 0) {
            vscode.window.showInformationMessage('No sandboxes to delete.');
            return;
        }

        const sandboxNameToDelete = await vscode.window.showQuickPick(
            sandboxes.map(sb => sb.name),
            { placeHolder: 'Select a sandbox to delete' }
        );

        if (!sandboxNameToDelete) return;

        const updatedSandboxes = sandboxes.filter(sb => sb.name !== sandboxNameToDelete);
        envsContent.sandboxes = updatedSandboxes;

        fs.writeFileSync(envFilePath, JSON.stringify(envsContent, null, 4));
        vscode.window.showInformationMessage(`Deleted sandbox '${sandboxNameToDelete}' from dw-envs.json.`);
    } catch (error) {
        vscode.window.showErrorMessage('Error deleting saved sandbox: ' + (error as Error).message);
    }
}

export function deactivate() {}
