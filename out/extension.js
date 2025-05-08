"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const archiver = require('archiver');
function activate(context) {
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
    let disposableExport = vscode.commands.registerCommand('dw-env-switcher.exportSetup', async () => {
        await exportSetup(context);
    });
    let disposableImport = vscode.commands.registerCommand('dw-env-switcher.importSetup', async () => {
        await importSetup(context);
    });
    let disposableSwitchCodeVersion = vscode.commands.registerCommand('dw-env-switcher.switchCodeVersion', async () => {
        await switchCurrentSandboxCodeVersion(context);
    });
    context.subscriptions.push(disposableSimple);
    context.subscriptions.push(disposableAdvanced);
    context.subscriptions.push(disposableSwitchCodeVersion);
    context.subscriptions.push(disposableDeleteUser);
    context.subscriptions.push(disposableDeleteSandbox);
    context.subscriptions.push(disposableExport);
    context.subscriptions.push(disposableImport);
}
// Helper function to extract the folder name from the full directory path
function getCartridgeFolderNames(directories) {
    return directories.map(dir => path.basename(dir)); // Get the last part of the path (the folder name)
}
// Function to check if a folder contains both .project and cartridges folder (either directly or inside 'cartridges' folder)
async function getCartridgesFromDirectory(workspacePath) {
    if (!fs.existsSync(workspacePath)) {
        return []; // If the workspace doesn't exist, return an empty array
    }
    let validDirectories = [];
    // Recursive function to scan directories and subdirectories
    function scanDirectory(dirPath) {
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
async function simpleSandboxSelection(context) {
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
            await detailedSandboxSelection(context); // Call the detailedSandboxSelection if dw-envs.json is missing
            return; // Exit after calling the detailed sandbox selection
        }
        // If dw-envs.json exists, proceed with the rest of the logic
        const envFileContent = fs.readFileSync(envFilePath, 'utf-8');
        const parsedEnv = JSON.parse(envFileContent);
        const sandboxes = parsedEnv.sandboxes;
        const sandboxNames = sandboxes.map((sb) => sb.name);
        const selectedSandboxName = await vscode.window.showQuickPick(sandboxNames, {
            placeHolder: 'Select a sandbox environment',
        });
        if (!selectedSandboxName)
            return;
        const selectedSandbox = sandboxes.find(sb => sb.name === selectedSandboxName);
        if (!selectedSandbox) {
            vscode.window.showErrorMessage('Selected sandbox configuration not found.');
            return;
        }
        let globalUsername = context.globalState.get('dw-username');
        let globalPassword = context.globalState.get('dw-password');
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
        const chooseCartridges = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Do you want to choose which cartridges you will upload?',
        });
        if (chooseCartridges === 'Yes') {
            // Get available directories from the workspace
            const availableDirectories = await getCartridgesFromDirectory(workspacePath);
            // Get only the folder names (not full paths)
            const folderNames = getCartridgeFolderNames(availableDirectories);
            // Show directories in a QuickPick list for the user to choose from
            const selectedDirectories = await vscode.window.showQuickPick(folderNames, {
                placeHolder: 'Select directories to include in the sandbox (Ctrl+Click to select multiple)',
                canPickMany: true, // Allow multiple selection
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
            cartridges: selectedSandbox.cartridges || [] // Add the directories to the dw.json
        };
        fs.writeFileSync(dwFilePath, JSON.stringify(dwConfig, null, 4));
        vscode.window.showInformationMessage(`dw.json updated with selected details.`);
    }
    catch (error) {
        vscode.window.showErrorMessage('Error selecting sandbox: ' + error.message);
    }
}
async function detailedSandboxSelection(context) {
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
        const savedHostnames = context.globalState.get('dw-hostnames') || [];
        const savedUsernames = context.globalState.get('dw-usernames') || [];
        const savedCodeVersions = context.globalState.get('dw-codeversions') || [];
        // Let the user select an existing hostname or enter a new one
        const hostnameOptions = ['➕ Enter New', ...savedHostnames];
        let selectedHostname = await vscode.window.showQuickPick(hostnameOptions, {
            placeHolder: 'Select or enter a hostname'
        });
        if (!selectedHostname)
            return;
        if (selectedHostname === '➕ Enter New') {
            selectedHostname = await vscode.window.showInputBox({
                prompt: 'Enter a new hostname',
                ignoreFocusOut: true
            });
            if (!selectedHostname)
                return;
            if (!savedHostnames.includes(selectedHostname)) {
                savedHostnames.push(selectedHostname);
                await context.globalState.update('dw-hostnames', savedHostnames);
            }
        }
        const usernameOptions = ['➕ Enter New', ...savedUsernames];
        let selectedUsername = await vscode.window.showQuickPick(usernameOptions, {
            placeHolder: 'Select or enter a username'
        });
        if (!selectedUsername)
            return;
        let selectedPassword;
        if (selectedUsername === '➕ Enter New') {
            selectedUsername = await vscode.window.showInputBox({
                prompt: 'Enter a new username',
                ignoreFocusOut: true
            });
            if (!selectedUsername)
                return;
            if (!savedUsernames.includes(selectedUsername)) {
                savedUsernames.push(selectedUsername);
                await context.globalState.update('dw-usernames', savedUsernames);
            }
            selectedPassword = await vscode.window.showInputBox({
                prompt: 'Enter password for new username',
                ignoreFocusOut: true,
                password: true
            });
            if (!selectedPassword)
                return;
            await context.globalState.update(`dw-password-${selectedUsername}`, selectedPassword);
        }
        else {
            selectedPassword = await context.globalState.get(`dw-password-${selectedUsername}`);
            if (!selectedPassword) {
                selectedPassword = await vscode.window.showInputBox({
                    prompt: `Enter password for username ${selectedUsername}`,
                    ignoreFocusOut: true,
                    password: true
                });
                if (!selectedPassword)
                    return;
                await context.globalState.update(`dw-password-${selectedUsername}`, selectedPassword);
            }
        }
        const codeVersionOptions = ['➕ Enter New', ...savedCodeVersions];
        let selectedCodeVersion = await vscode.window.showQuickPick(codeVersionOptions, {
            placeHolder: 'Select or enter a code version'
        });
        if (!selectedCodeVersion)
            return;
        if (selectedCodeVersion === '➕ Enter New') {
            selectedCodeVersion = await vscode.window.showInputBox({
                prompt: 'Enter a new code version',
                ignoreFocusOut: true
            });
            if (!selectedCodeVersion)
                return;
            if (!savedCodeVersions.includes(selectedCodeVersion)) {
                savedCodeVersions.push(selectedCodeVersion);
                await context.globalState.update('dw-codeversions', savedCodeVersions);
            }
        }
        const sandboxName = await vscode.window.showInputBox({
            prompt: 'Enter a name for this sandbox configuration (existing name will be overwritten)',
            ignoreFocusOut: true
        });
        if (!sandboxName)
            return;
        const sandboxEntry = {
            name: sandboxName,
            hostname: selectedHostname,
            username: selectedUsername,
            password: selectedPassword,
            "code-version": selectedCodeVersion,
            cartridges: [] // Explicitly initialize cartridges as an empty array
        };
        // Write sandbox configuration to dw.json
        fs.writeFileSync(dwFilePath, JSON.stringify(sandboxEntry, null, 4));
        vscode.window.showInformationMessage(`dw.json updated with selected details.`);
        let envsContent = { sandboxes: [] };
        if (fs.existsSync(envFilePath)) {
            try {
                envsContent = JSON.parse(fs.readFileSync(envFilePath, 'utf-8'));
            }
            catch (error) {
                vscode.window.showWarningMessage('Failed to parse existing dw-envs.json. A new one will be created.');
            }
        }
        const existingIndex = envsContent.sandboxes.findIndex((sb) => sb.name === sandboxName);
        if (existingIndex >= 0) {
            envsContent.sandboxes[existingIndex] = sandboxEntry;
        }
        else {
            envsContent.sandboxes.push(sandboxEntry);
        }
        fs.writeFileSync(envFilePath, JSON.stringify(envsContent, null, 4));
        vscode.window.showInformationMessage(`Saved sandbox '${sandboxName}' in dw-envs.json.`);
        // Ask if user wants to choose cartridges
        const chooseCartridges = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'Do you want to choose directories for cartridges?' });
        if (chooseCartridges === 'Yes') {
            // Get available directories from the workspace
            const availableDirectories = await getCartridgesFromDirectory(workspacePath);
            // Get only the folder names (not full paths)
            const folderNames = getCartridgeFolderNames(availableDirectories);
            // Show directories in a QuickPick list for the user to choose from
            const selectedDirectories = await vscode.window.showQuickPick(folderNames, {
                placeHolder: 'Select directories to include in the sandbox (Ctrl+Click to select multiple)',
                canPickMany: true, // Allow multiple selection
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
                cartridges: sandboxEntry.cartridges || [] // Update with the selected cartridges
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
    }
    catch (error) {
        vscode.window.showErrorMessage('Error in detailed sandbox selection: ' + error.message);
    }
}
// Delete saved username
async function deleteSavedUsername(context) {
    try {
        const savedUsernames = context.globalState.get('dw-usernames') || [];
        if (savedUsernames.length === 0) {
            vscode.window.showInformationMessage('No saved usernames found.');
            return;
        }
        const usernameToDelete = await vscode.window.showQuickPick(savedUsernames, {
            placeHolder: 'Select a username to delete'
        });
        if (!usernameToDelete)
            return;
        const updatedUsernames = savedUsernames.filter(u => u !== usernameToDelete);
        await context.globalState.update('dw-usernames', updatedUsernames);
        await context.globalState.update(`dw-password-${usernameToDelete}`, undefined);
        vscode.window.showInformationMessage(`Deleted saved username: ${usernameToDelete}`);
    }
    catch (error) {
        vscode.window.showErrorMessage('Error deleting saved username: ' + error.message);
    }
}
// Delete saved sandbox
async function deleteSavedSandbox(context) {
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
        const sandboxes = envsContent.sandboxes;
        if (!sandboxes || sandboxes.length === 0) {
            vscode.window.showInformationMessage('No sandboxes to delete.');
            return;
        }
        const sandboxNameToDelete = await vscode.window.showQuickPick(sandboxes.map(sb => sb.name), { placeHolder: 'Select a sandbox to delete' });
        if (!sandboxNameToDelete)
            return;
        const updatedSandboxes = sandboxes.filter(sb => sb.name !== sandboxNameToDelete);
        envsContent.sandboxes = updatedSandboxes;
        fs.writeFileSync(envFilePath, JSON.stringify(envsContent, null, 4));
        vscode.window.showInformationMessage(`Deleted sandbox '${sandboxNameToDelete}' from dw-envs.json.`);
    }
    catch (error) {
        vscode.window.showErrorMessage('Error deleting saved sandbox: ' + error.message);
    }
}
async function exportSetup(context) {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        // Check if workspaceFolders is undefined or empty
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace is open.');
            return;
        }
        // Now TypeScript knows that workspaceFolders is not undefined and has at least one element
        const workspacePath = workspaceFolders[0].uri.fsPath; // Safe to access workspaceFolders[0]
        const dwFilePath = path.join(workspacePath, 'dw.json');
        const envFilePath = path.join(workspacePath, 'dw-envs.json');
        if (!fs.existsSync(dwFilePath) || !fs.existsSync(envFilePath)) {
            vscode.window.showErrorMessage('dw.json or dw-envs.json is missing in the workspace.');
            return;
        }
        // Export global state variables (username, password, etc.)
        const globalState = {
            'dw-username': context.globalState.get('dw-username'),
            'dw-password': context.globalState.get('dw-password'),
            'dw-hostnames': context.globalState.get('dw-hostnames'),
            'dw-usernames': context.globalState.get('dw-usernames'),
            'dw-codeversions': context.globalState.get('dw-codeversions'),
        };
        // Prompt user for export location (a folder or a zip file)
        const exportLocation = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Export Folder'
        });
        if (!exportLocation) {
            vscode.window.showErrorMessage('No export location selected.');
            return;
        }
        const exportFolder = exportLocation[0].fsPath;
        const zipPath = path.join(exportFolder, 'sandbox_config.zip');
        // Create a zip file containing the configuration files and global state
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', () => {
            vscode.window.showInformationMessage(`Export successful! Files are saved in ${zipPath}`);
        });
        // Handle errors in the archiver process
        archive.on('error', (err) => {
            vscode.window.showErrorMessage(`Error during export: ${err.message}`);
        });
        archive.pipe(output);
        archive.file(dwFilePath, { name: 'dw.json' });
        archive.file(envFilePath, { name: 'dw-envs.json' });
        // Export global state as JSON
        archive.append(JSON.stringify(globalState, null, 4), { name: 'globalState.json' });
        archive.finalize();
    }
    catch (error) {
        vscode.window.showErrorMessage('Error exporting setup: ' + error.message);
    }
}
async function importSetup(context) {
    try {
        // Prompt user to select the zip file for import
        const zipLocation = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: { 'Zip Files': ['zip'] },
            openLabel: 'Select Zip File for Import'
        });
        if (!zipLocation) {
            vscode.window.showErrorMessage('No zip file selected.');
            return;
        }
        const zipPath = zipLocation[0].fsPath;
        const extractFolder = path.dirname(zipPath); // Extract to the same folder
        // Extract the zip file
        const unzipper = require('unzipper');
        fs.createReadStream(zipPath)
            .pipe(unzipper.Extract({ path: extractFolder }))
            .on('close', async () => {
            // After extraction, check if dw.json and dw-envs.json exist
            const dwFilePath = path.join(extractFolder, 'dw.json');
            const envFilePath = path.join(extractFolder, 'dw-envs.json');
            const globalStatePath = path.join(extractFolder, 'globalState.json');
            if (fs.existsSync(dwFilePath) && fs.existsSync(envFilePath) && fs.existsSync(globalStatePath)) {
                // Prompt user to overwrite the existing files in the workspace
                const workspaceFolders = vscode.workspace.workspaceFolders;
                // Ensure workspaceFolders is not undefined or empty
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('No workspace is open.');
                    return;
                }
                const workspacePath = workspaceFolders[0].uri.fsPath;
                // Overwrite files in the workspace
                fs.copyFileSync(dwFilePath, path.join(workspacePath, 'dw.json'));
                fs.copyFileSync(envFilePath, path.join(workspacePath, 'dw-envs.json'));
                // Read global state file and restore values
                const globalStateContent = fs.readFileSync(globalStatePath, 'utf-8');
                const globalState = JSON.parse(globalStateContent);
                await context.globalState.update('dw-username', globalState['dw-username']);
                await context.globalState.update('dw-password', globalState['dw-password']);
                await context.globalState.update('dw-hostnames', globalState['dw-hostnames']);
                await context.globalState.update('dw-usernames', globalState['dw-usernames']);
                await context.globalState.update('dw-codeversions', globalState['dw-codeversions']);
                vscode.window.showInformationMessage('Workspace setup has been successfully updated with the imported files.');
            }
            else {
                vscode.window.showErrorMessage('Invalid zip file. Missing dw.json, dw-envs.json, or globalState.json.');
            }
        })
            // Explicitly typing `err` as `Error`
            .on('error', (err) => {
            vscode.window.showErrorMessage(`Error during import: ${err.message}`);
        });
    }
    catch (error) {
        vscode.window.showErrorMessage('Error importing setup: ' + error.message);
    }
}
// Add this function in your extension file
async function switchCurrentSandboxCodeVersion(context) {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace is open.');
            return;
        }
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const dwFilePath = path.join(workspacePath, 'dw.json');
        const envFilePath = path.join(workspacePath, 'dw-envs.json');
        if (!fs.existsSync(dwFilePath)) {
            vscode.window.showErrorMessage('dw.json not found in workspace.');
            return;
        }
        const dwContent = JSON.parse(fs.readFileSync(dwFilePath, 'utf-8'));
        const currentCodeVersion = dwContent['code-version'];
        const savedCodeVersions = context.globalState.get('dw-codeversions') || [];
        const codeVersionOptions = ['➕ Enter New', ...savedCodeVersions];
        let selectedCodeVersion = await vscode.window.showQuickPick(codeVersionOptions, {
            placeHolder: `Current Code Version: ${currentCodeVersion}. Select or enter a new code version.`,
        });
        if (!selectedCodeVersion)
            return;
        if (selectedCodeVersion === '➕ Enter New') {
            selectedCodeVersion = await vscode.window.showInputBox({
                prompt: 'Enter new code version',
                ignoreFocusOut: true
            });
            if (!selectedCodeVersion)
                return;
            if (!savedCodeVersions.includes(selectedCodeVersion)) {
                savedCodeVersions.push(selectedCodeVersion);
                await context.globalState.update('dw-codeversions', savedCodeVersions);
            }
        }
        // Update dw.json
        dwContent['code-version'] = selectedCodeVersion;
        fs.writeFileSync(dwFilePath, JSON.stringify(dwContent, null, 4));
        vscode.window.showInformationMessage(`dw.json updated with new code version: ${selectedCodeVersion}`);
        // Update dw-envs.json if sandbox matches
        if (fs.existsSync(envFilePath)) {
            const envsContent = JSON.parse(fs.readFileSync(envFilePath, 'utf-8'));
            const sandboxToUpdate = envsContent.sandboxes.find((sb) => sb.hostname === dwContent.hostname &&
                sb.username === dwContent.username);
            if (sandboxToUpdate) {
                sandboxToUpdate['code-version'] = selectedCodeVersion;
                fs.writeFileSync(envFilePath, JSON.stringify(envsContent, null, 4));
                vscode.window.showInformationMessage(`dw-envs.json updated with new code version.`);
            }
        }
    }
    catch (error) {
        vscode.window.showErrorMessage('Error switching code version: ' + error.message);
    }
}
function deactivate() { }
