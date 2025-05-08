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
exports.SandboxDetailItem = exports.SandboxItem = exports.SandboxTreeDataProvider = void 0;
exports.pickOrEnter = pickOrEnter;
exports.simpleSandboxSelection = simpleSandboxSelection;
exports.detailedSandboxSelection = detailedSandboxSelection;
exports.exportSetup = exportSetup;
exports.importSetup = importSetup;
exports.deleteSavedUsername = deleteSavedUsername;
exports.deleteSavedSandbox = deleteSavedSandbox;
exports.deleteSandboxFromView = deleteSandboxFromView;
exports.changeCartridges = changeCartridges;
exports.switchCurrentSandboxCodeVersion = switchCurrentSandboxCodeVersion;
exports.changeUser = changeUser;
exports.changeSavedPassword = changeSavedPassword;
exports.sandboxActions = sandboxActions;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const archiver = require('archiver');
const unzipper = require('unzipper');
async function pickOrEnter(label, previous = [], currentValue) {
    const options = ['➕ Enter New', ...previous];
    const selected = await vscode.window.showQuickPick(options, { placeHolder: currentValue ? `Current: ${currentValue}` : undefined });
    if (!selected)
        return;
    if (selected === '➕ Enter New') {
        return await vscode.window.showInputBox({ prompt: `Enter ${label}`, value: currentValue });
    }
    return selected;
}
function getCartridgeFolderNames(directories) {
    return directories.map(dir => path.basename(dir));
}
async function getCartridgesFromDirectory(workspacePath) {
    const validDirectories = [];
    function scan(dirPath) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                if (fs.existsSync(path.join(fullPath, '.project')) &&
                    (fs.existsSync(path.join(fullPath, 'cartridges')) || fs.existsSync(path.join(fullPath, 'cartridge')))) {
                    validDirectories.push(fullPath);
                }
                scan(fullPath);
            }
        }
    }
    scan(workspacePath);
    return validDirectories;
}
async function simpleSandboxSelection(context) {
    var _a, _b;
    const workspace = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
    if (!workspace)
        return vscode.window.showErrorMessage('No workspace is open.');
    const envPath = path.join(workspace, 'dw-envs.json');
    const dwPath = path.join(workspace, 'dw.json');
    if (!fs.existsSync(envPath))
        return detailedSandboxSelection(context);
    const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8')).sandboxes;
    const sandboxName = await vscode.window.showQuickPick(envs.map(sb => sb.name), { placeHolder: 'Select a sandbox' });
    if (!sandboxName)
        return;
    const sandbox = envs.find(sb => sb.name === sandboxName);
    if (!sandbox)
        return;
    let username = sandbox.username || await context.globalState.get('dw-username');
    let password = sandbox.password || await context.globalState.get('dw-password');
    if (!username || !password) {
        username = await vscode.window.showInputBox({ prompt: 'Enter username' });
        password = await vscode.window.showInputBox({ prompt: 'Enter password', password: true });
        if (!username || !password)
            return;
        await context.globalState.update('dw-username', username);
        await context.globalState.update('dw-password', password);
    }
    if (await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'Choose cartridges?' }) === 'Yes') {
        const available = await getCartridgesFromDirectory(workspace);
        const selected = await vscode.window.showQuickPick(getCartridgeFolderNames(available), { canPickMany: true });
        sandbox.cartridges = selected;
    }
    fs.writeFileSync(dwPath, JSON.stringify({ hostname: sandbox.hostname, username, password, 'code-version': sandbox['code-version'], cartridges: sandbox.cartridges || [] }, null, 4));
    vscode.window.showInformationMessage(`dw.json updated for ${sandbox.name}`);
}
async function detailedSandboxSelection(context, sandboxName) {
    var _a, _b;
    const workspace = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
    if (!workspace)
        return;
    const envPath = path.join(workspace, 'dw-envs.json');
    const dwPath = path.join(workspace, 'dw.json');
    if (!fs.existsSync(envPath))
        fs.writeFileSync(envPath, JSON.stringify({ sandboxes: [] }, null, 4));
    const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
    const existing = sandboxName ? envs.sandboxes.find((sb) => sb.name === sandboxName) : undefined;
    // Add existing hostname to global hostnames if missing
    if (existing === null || existing === void 0 ? void 0 : existing.hostname) {
        const hostnames = context.globalState.get('dw-hostnames') || [];
        if (!hostnames.includes(existing.hostname)) {
            hostnames.push(existing.hostname);
            await context.globalState.update('dw-hostnames', hostnames);
        }
    }
    const hostnames = context.globalState.get('dw-hostnames') || [];
    const hostname = await pickOrEnter('hostname', hostnames, existing === null || existing === void 0 ? void 0 : existing.hostname);
    if (!hostname)
        return;
    if (!hostnames.includes(hostname)) {
        hostnames.push(hostname);
        await context.globalState.update('dw-hostnames', hostnames);
    }
    const usernames = context.globalState.get('dw-usernames') || [];
    const username = await pickOrEnter('username', usernames, existing === null || existing === void 0 ? void 0 : existing.username);
    const password = await vscode.window.showInputBox({ prompt: 'Password', value: existing === null || existing === void 0 ? void 0 : existing.password, password: true });
    const versions = context.globalState.get('dw-codeversions') || [];
    const codeVersion = await pickOrEnter('code version', versions, existing === null || existing === void 0 ? void 0 : existing['code-version']);
    if (!codeVersion)
        return;
    if (!versions.includes(codeVersion)) {
        versions.push(codeVersion);
        await context.globalState.update('dw-codeversions', versions);
    }
    const name = sandboxName || await vscode.window.showInputBox({ prompt: 'Sandbox name', value: existing === null || existing === void 0 ? void 0 : existing.name });
    if (!name)
        return;
    const chooseCartridges = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'Select cartridges?' }) === 'Yes';
    const cartridges = chooseCartridges ? await vscode.window.showQuickPick(getCartridgeFolderNames(await getCartridgesFromDirectory(workspace)), { canPickMany: true }) : [];
    const sandbox = { name, hostname, username, password, "code-version": codeVersion, cartridges };
    envs.sandboxes = envs.sandboxes.filter((sb) => sb.name !== name);
    envs.sandboxes.push(sandbox);
    fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
    fs.writeFileSync(dwPath, JSON.stringify(sandbox, null, 4));
    vscode.window.showInformationMessage(`Saved sandbox ${name}`);
    vscode.commands.executeCommand('dwEnvSwitcherView.refresh');
}
class SandboxTreeDataProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        var _a, _b, _c, _d, _e;
        const workspace = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
        if (!workspace)
            return [];
        const envPath = path.join(workspace, 'dw-envs.json');
        const dwPath = path.join(workspace, 'dw.json');
        if (!fs.existsSync(envPath))
            return [];
        const sandboxes = JSON.parse(fs.readFileSync(envPath, 'utf-8')).sandboxes;
        let activeSandboxName = undefined;
        if (fs.existsSync(dwPath)) {
            const active = JSON.parse(fs.readFileSync(dwPath, 'utf-8'));
            activeSandboxName = active.name;
        }
        // No parent -> top level -> list sandboxes
        if (!element) {
            return sandboxes.map(sb => new SandboxItem(sb, activeSandboxName));
        }
        // Has parent -> sandbox expanded -> show sandbox details
        const details = [];
        const hostnameItem = new SandboxDetailItem(`Hostname`);
        hostnameItem.description = element.sandbox.hostname;
        hostnameItem.tooltip = element.sandbox.hostname;
        details.push(hostnameItem);
        const usernameItem = new SandboxDetailItem(`Username`);
        usernameItem.description = (_c = element.sandbox.username) !== null && _c !== void 0 ? _c : '(none)';
        usernameItem.tooltip = (_d = element.sandbox.username) !== null && _d !== void 0 ? _d : '(none)';
        details.push(usernameItem);
        const codeVersionItem = new SandboxDetailItem(`Code Version`);
        codeVersionItem.description = element.sandbox["code-version"];
        codeVersionItem.tooltip = element.sandbox["code-version"];
        details.push(codeVersionItem);
        if ((_e = element.sandbox.cartridges) === null || _e === void 0 ? void 0 : _e.length) {
            details.push(new SandboxDetailItem(`Cartridges:`));
            element.sandbox.cartridges.forEach(cart => {
                const cartItem = new SandboxDetailItem(`   - ${cart}`);
                cartItem.tooltip = cart;
                details.push(cartItem);
            });
        }
        else {
            details.push(new SandboxDetailItem(`Cartridges: (none)`));
        }
        return details;
    }
}
exports.SandboxTreeDataProvider = SandboxTreeDataProvider;
class SandboxItem extends vscode.TreeItem {
    constructor(sandbox, activeSandboxName) {
        var _a;
        super(sandbox.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.sandbox = sandbox;
        this.contextValue = 'sandbox';
        this.tooltip = `Hostname: ${sandbox.hostname}\nUsername: ${(_a = sandbox.username) !== null && _a !== void 0 ? _a : '(none)'}\nCode Version: ${sandbox["code-version"]}`;
        if (sandbox.name === activeSandboxName) {
            this.iconPath = new vscode.ThemeIcon("check", new vscode.ThemeColor("testing.iconPassed"));
        }
        else {
            this.iconPath = new vscode.ThemeIcon("circle-slash", new vscode.ThemeColor("problemsErrorIcon.foreground"));
            this.label = `${sandbox.name}`;
        }
        this.command = {
            command: 'dw-env-switcher.activateSandbox',
            title: 'Activate Sandbox',
            arguments: [this.sandbox]
        };
    }
}
exports.SandboxItem = SandboxItem;
class SandboxDetailItem extends vscode.TreeItem {
    constructor(label) {
        super(label, vscode.TreeItemCollapsibleState.None);
    }
}
exports.SandboxDetailItem = SandboxDetailItem;
async function exportSetup(context) {
    var _a, _b;
    const workspace = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
    if (!workspace)
        return;
    const dwPath = path.join(workspace, 'dw.json');
    const envPath = path.join(workspace, 'dw-envs.json');
    if (!fs.existsSync(dwPath) || !fs.existsSync(envPath))
        return;
    const global = {
        'dw-username': context.globalState.get('dw-username'),
        'dw-password': context.globalState.get('dw-password'),
        'dw-hostnames': context.globalState.get('dw-hostnames'),
        'dw-usernames': context.globalState.get('dw-usernames'),
        'dw-codeversions': context.globalState.get('dw-codeversions')
    };
    const folder = await vscode.window.showOpenDialog({ canSelectFolders: true });
    if (!folder)
        return;
    const zipPath = path.join(folder[0].fsPath, 'sandbox_config.zip');
    const archive = archiver('zip');
    const output = fs.createWriteStream(zipPath);
    archive.pipe(output);
    archive.file(dwPath, { name: 'dw.json' });
    archive.file(envPath, { name: 'dw-envs.json' });
    archive.append(JSON.stringify(global, null, 4), { name: 'globalState.json' });
    archive.finalize();
}
async function importSetup(context) {
    const zip = await vscode.window.showOpenDialog({ canSelectFiles: true, filters: { Zip: ['zip'] } });
    if (!zip)
        return;
    const extractPath = path.dirname(zip[0].fsPath);
    fs.createReadStream(zip[0].fsPath).pipe(unzipper.Extract({ path: extractPath })).on('close', async () => {
        var _a, _b;
        const workspace = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
        if (!workspace)
            return;
        ['dw.json', 'dw-envs.json'].forEach(f => fs.copyFileSync(path.join(extractPath, f), path.join(workspace, f)));
        const global = JSON.parse(fs.readFileSync(path.join(extractPath, 'globalState.json'), 'utf-8'));
        for (const key in global) {
            await context.globalState.update(key, global[key]);
        }
    });
}
async function deleteSavedUsername(context) {
    const usernames = context.globalState.get('dw-usernames') || [];
    const username = await vscode.window.showQuickPick(usernames);
    if (!username)
        return;
    await context.globalState.update('dw-usernames', usernames.filter(u => u !== username));
    await context.globalState.update(`dw-password-${username}`, undefined);
}
async function deleteSavedSandbox(context) {
    var _a, _b;
    const workspace = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
    if (!workspace)
        return;
    const envPath = path.join(workspace, 'dw-envs.json');
    const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
    const sandbox = await vscode.window.showQuickPick(envs.sandboxes.map((sb) => sb.name));
    if (!sandbox)
        return;
    envs.sandboxes = envs.sandboxes.filter((sb) => sb.name !== sandbox);
    fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
    vscode.commands.executeCommand('dwEnvSwitcherView.refresh');
}
async function deleteSandboxFromView(context, item) {
    var _a, _b;
    const workspace = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
    if (!workspace)
        return;
    const envPath = path.join(workspace, 'dw-envs.json');
    const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
    envs.sandboxes = envs.sandboxes.filter((sb) => sb.name !== item.sandbox.name);
    fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
    vscode.commands.executeCommand('dwEnvSwitcherView.refresh');
}
async function changeCartridges(context, item) {
    var _a, _b;
    const workspace = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
    if (!workspace)
        return;
    const envPath = path.join(workspace, 'dw-envs.json');
    const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
    const dwPath = path.join(workspace, 'dw.json');
    const available = await getCartridgesFromDirectory(workspace);
    const selected = await vscode.window.showQuickPick(getCartridgeFolderNames(available), { canPickMany: true });
    const sandbox = envs.sandboxes.find((sb) => sb.name === item.sandbox.name);
    if (sandbox) {
        sandbox.cartridges = selected;
        fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
        fs.writeFileSync(dwPath, JSON.stringify(sandbox, null, 4));
        vscode.window.showInformationMessage(`Updated cartridges for ${sandbox.name}`);
        vscode.commands.executeCommand('dwEnvSwitcherView.refresh');
    }
}
async function switchCurrentSandboxCodeVersion(context) {
    var _a, _b;
    const workspace = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
    if (!workspace)
        return;
    const dwPath = path.join(workspace, 'dw.json');
    const envPath = path.join(workspace, 'dw-envs.json');
    const config = JSON.parse(fs.readFileSync(dwPath, 'utf-8'));
    const current = config['code-version'];
    const versions = context.globalState.get('dw-codeversions') || [];
    const selected = await vscode.window.showQuickPick(['➕ Enter New', ...versions], { placeHolder: `Current: ${current}` });
    if (!selected)
        return;
    const newVersion = selected === '➕ Enter New' ? await vscode.window.showInputBox({ prompt: 'Enter new code version' }) : selected;
    if (!newVersion)
        return;
    if (!versions.includes(newVersion)) {
        versions.push(newVersion);
        await context.globalState.update('dw-codeversions', versions);
    }
    config['code-version'] = newVersion;
    fs.writeFileSync(dwPath, JSON.stringify(config, null, 4));
    if (fs.existsSync(envPath)) {
        const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
        const match = envs.sandboxes.find((sb) => sb.hostname === config.hostname && sb.username === config.username);
        if (match) {
            match['code-version'] = newVersion;
            fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
        }
    }
}
async function changeUser(context, item) {
    var _a, _b;
    const workspace = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
    if (!workspace)
        return;
    const envPath = path.join(workspace, 'dw-envs.json');
    const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
    const dwPath = path.join(workspace, 'dw.json');
    const usernames = context.globalState.get('dw-usernames') || [];
    const username = await pickOrEnter('username', usernames, item.sandbox.username);
    if (!username)
        return;
    if (!usernames.includes(username)) {
        usernames.push(username);
        await context.globalState.update('dw-usernames', usernames);
    }
    const password = await vscode.window.showInputBox({ prompt: 'Enter new password', password: true });
    const sandbox = envs.sandboxes.find((sb) => sb.name === item.sandbox.name);
    if (sandbox) {
        sandbox.username = username;
        sandbox.password = password;
        fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
        fs.writeFileSync(dwPath, JSON.stringify(sandbox, null, 4));
        vscode.window.showInformationMessage(`Updated user for ${sandbox.name}`);
        vscode.commands.executeCommand('dwEnvSwitcherView.refresh');
    }
}
async function changeSavedPassword(context) {
    var _a, _b;
    const usernames = context.globalState.get('dw-usernames') || [];
    if (usernames.length === 0) {
        vscode.window.showInformationMessage('No saved usernames found.');
        return;
    }
    const username = await vscode.window.showQuickPick(usernames, { placeHolder: 'Select username to update password' });
    if (!username)
        return;
    const newPassword = await vscode.window.showInputBox({ prompt: `Enter new password for ${username}`, password: true });
    if (!newPassword)
        return;
    // Update global password
    await context.globalState.update(`dw-password-${username}`, newPassword);
    const workspace = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
    if (!workspace) {
        vscode.window.showInformationMessage('Password updated in global state only.');
        return;
    }
    const envPath = path.join(workspace, 'dw-envs.json');
    const dwPath = path.join(workspace, 'dw.json');
    // Update dw-envs.json
    if (fs.existsSync(envPath)) {
        const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
        let changed = false;
        for (const sandbox of envs.sandboxes) {
            if (sandbox.username === username) {
                sandbox.password = newPassword;
                changed = true;
            }
        }
        if (changed) {
            fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
        }
    }
    // Update dw.json if active username matches
    if (fs.existsSync(dwPath)) {
        const current = JSON.parse(fs.readFileSync(dwPath, 'utf-8'));
        if (current.username === username) {
            current.password = newPassword;
            fs.writeFileSync(dwPath, JSON.stringify(current, null, 4));
        }
    }
    vscode.window.showInformationMessage(`Password updated for user "${username}".`);
}
async function sandboxActions(context, item) {
    const action = await vscode.window.showQuickPick([
        'Edit Sandbox',
        'Change Cartridges',
        'Change Code Version',
        'Change User',
        'Delete Sandbox'
    ], { placeHolder: `Select action for ${item.sandbox.name}` });
    if (!action)
        return;
    switch (action) {
        case 'Edit Sandbox':
            vscode.commands.executeCommand('dw-env-switcher.selectSandboxWithDetails', item.sandbox.name);
            break;
        case 'Change Cartridges':
            vscode.commands.executeCommand('dw-env-switcher.changeCartridges', item);
            break;
        case 'Change Code Version':
            await switchCurrentSandboxCodeVersion(context);
            break;
        case 'Change User':
            await changeUser(context, item);
            break;
        case 'Delete Sandbox':
            vscode.commands.executeCommand('dw-env-switcher.deleteSandboxFromView', item);
            break;
    }
}
async function activateSandbox(sandbox) {
    var _a, _b;
    const workspace = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
    if (!workspace)
        return;
    const dwPath = path.join(workspace, 'dw.json');
    fs.writeFileSync(dwPath, JSON.stringify(sandbox, null, 4));
    vscode.window.showInformationMessage(`Activated sandbox: ${sandbox.name}`);
    vscode.commands.executeCommand('dwEnvSwitcherView.refresh');
}
function activate(context) {
    const sandboxProvider = new SandboxTreeDataProvider(context);
    vscode.window.registerTreeDataProvider('dwEnvSwitcherView', sandboxProvider);
    context.subscriptions.push(vscode.commands.registerCommand('dw-env-switcher.selectSandbox', () => simpleSandboxSelection(context)), vscode.commands.registerCommand('dw-env-switcher.selectSandboxWithDetails', (sandboxName) => detailedSandboxSelection(context, sandboxName)), vscode.commands.registerCommand('dw-env-switcher.deleteSavedUsername', () => deleteSavedUsername(context)), vscode.commands.registerCommand('dw-env-switcher.deleteSavedSandbox', () => deleteSavedSandbox(context)), vscode.commands.registerCommand('dw-env-switcher.exportSetup', () => exportSetup(context)), vscode.commands.registerCommand('dw-env-switcher.importSetup', () => importSetup(context)), vscode.commands.registerCommand('dw-env-switcher.switchCodeVersion', () => switchCurrentSandboxCodeVersion(context)), vscode.commands.registerCommand('dw-env-switcher.deleteSandboxFromView', (item) => deleteSandboxFromView(context, item)), vscode.commands.registerCommand('dwEnvSwitcherView.refresh', () => sandboxProvider.refresh()), vscode.commands.registerCommand('dw-env-switcher.addNewSandbox', () => detailedSandboxSelection(context)), vscode.commands.registerCommand('dw-env-switcher.changeCartridges', (item) => changeCartridges(context, item)), vscode.commands.registerCommand('dw-env-switcher.changeUser', (item) => changeUser(context, item)), vscode.commands.registerCommand('dw-env-switcher.sandboxActions', (item) => sandboxActions(context, item)), vscode.commands.registerCommand('dw-env-switcher.changeSavedPassword', () => changeSavedPassword(context)), vscode.commands.registerCommand('dw-env-switcher.activateSandbox', (sandbox) => activateSandbox(sandbox)));
}
function deactivate() { }
