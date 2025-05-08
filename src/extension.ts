
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
const archiver = require('archiver');
const unzipper = require('unzipper');

interface SandboxConfig {
    name: string;
    hostname: string;
    "code-version": string;
    username?: string;
    password?: string;
    cartridges?: string[];
}


export async function pickOrEnter(label: string, previous: string[] = [], currentValue?: string): Promise<string | undefined> {
    const options = ['➕ Enter New', ...previous];
    const selected = await vscode.window.showQuickPick(options, { placeHolder: currentValue ? `Current: ${currentValue}` : undefined });
    if (!selected) return;

    if (selected === '➕ Enter New') {
        return await vscode.window.showInputBox({ prompt: `Enter ${label}`, value: currentValue });
    }

    return selected;
}



function getCartridgeFolderNames(directories: string[]): string[] {
    return directories.map(dir => path.basename(dir));
}

async function getCartridgesFromDirectory(workspacePath: string): Promise<string[]> {
    const validDirectories: string[] = [];
    function scan(dirPath: string) {
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


export async function simpleSandboxSelection(context: vscode.ExtensionContext) {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) return vscode.window.showErrorMessage('No workspace is open.');

    const envPath = path.join(workspace, 'dw-envs.json');
    const dwPath = path.join(workspace, 'dw.json');

    if (!fs.existsSync(envPath)) return detailedSandboxSelection(context);

    const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8')).sandboxes as SandboxConfig[];
    const sandboxName = await vscode.window.showQuickPick(envs.map(sb => sb.name), { placeHolder: 'Select a sandbox' });
    if (!sandboxName) return;

    const sandbox = envs.find(sb => sb.name === sandboxName);
    if (!sandbox) return;

    let username = sandbox.username || await context.globalState.get('dw-username');
    let password = sandbox.password || await context.globalState.get('dw-password');

    if (!username || !password) {
        username = await vscode.window.showInputBox({ prompt: 'Enter username' });
        password = await vscode.window.showInputBox({ prompt: 'Enter password', password: true });
        if (!username || !password) return;
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

export async function detailedSandboxSelection(context: vscode.ExtensionContext, sandboxName?: string) {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) return;

    const envPath = path.join(workspace, 'dw-envs.json');
    const dwPath = path.join(workspace, 'dw.json');

    if (!fs.existsSync(envPath)) fs.writeFileSync(envPath, JSON.stringify({ sandboxes: [] }, null, 4));

    const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
    const existing = sandboxName ? envs.sandboxes.find((sb: SandboxConfig) => sb.name === sandboxName) : undefined;
    // Add existing hostname to global hostnames if missing
    if (existing?.hostname) {
        const hostnames = context.globalState.get<string[]>('dw-hostnames') || [];
        if (!hostnames.includes(existing.hostname)) {
            hostnames.push(existing.hostname);
            await context.globalState.update('dw-hostnames', hostnames);
        }
    }

    const hostnames = context.globalState.get<string[]>('dw-hostnames') || [];
    const hostname = await pickOrEnter('hostname', hostnames, existing?.hostname);
    if (!hostname) return;
    if (!hostnames.includes(hostname)) {
        hostnames.push(hostname);
        await context.globalState.update('dw-hostnames', hostnames);
    }

    const usernames = context.globalState.get<string[]>('dw-usernames') || [];
    const username = await pickOrEnter('username', usernames, existing?.username);
    const password = await vscode.window.showInputBox({ prompt: 'Password', value: existing?.password, password: true });

    const versions = context.globalState.get<string[]>('dw-codeversions') || [];
    const codeVersion = await pickOrEnter('code version', versions, existing?.['code-version']);
    if (!codeVersion) return;
    if (!versions.includes(codeVersion)) {
        versions.push(codeVersion);
        await context.globalState.update('dw-codeversions', versions);
    }

    const name = sandboxName || await vscode.window.showInputBox({ prompt: 'Sandbox name', value: existing?.name });
    if (!name) return;

    const chooseCartridges = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'Select cartridges?' }) === 'Yes';
    const cartridges = chooseCartridges ? await vscode.window.showQuickPick(getCartridgeFolderNames(await getCartridgesFromDirectory(workspace)), { canPickMany: true }) : [];

    const sandbox: SandboxConfig = { name, hostname, username, password, "code-version": codeVersion, cartridges };

    envs.sandboxes = envs.sandboxes.filter((sb: SandboxConfig) => sb.name !== name);
    envs.sandboxes.push(sandbox);

    fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
    fs.writeFileSync(dwPath, JSON.stringify(sandbox, null, 4));

    vscode.window.showInformationMessage(`Saved sandbox ${name}`);
    vscode.commands.executeCommand('dwEnvSwitcherView.refresh');
}


export class SandboxTreeDataProvider implements vscode.TreeDataProvider<SandboxItem | SandboxDetailItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SandboxItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {}

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SandboxItem | SandboxDetailItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: SandboxItem): Promise<(SandboxItem | SandboxDetailItem)[]> {
        const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspace) return [];
    
        const envPath = path.join(workspace, 'dw-envs.json');
        const dwPath = path.join(workspace, 'dw.json');
    
        if (!fs.existsSync(envPath)) return [];
    
        const sandboxes = JSON.parse(fs.readFileSync(envPath, 'utf-8')).sandboxes as SandboxConfig[];
    
        let activeSandboxName: string | undefined = undefined;
    
        if (fs.existsSync(dwPath)) {
            const active = JSON.parse(fs.readFileSync(dwPath, 'utf-8')) as SandboxConfig;
            activeSandboxName = active.name;
        }
    
        // No parent -> top level -> list sandboxes
        if (!element) {
            return sandboxes.map(sb => new SandboxItem(sb, activeSandboxName));
        }
    
        // Has parent -> sandbox expanded -> show sandbox details
        const details: SandboxDetailItem[] = [];
    
        const hostnameItem = new SandboxDetailItem(`Hostname`);
        hostnameItem.description = element.sandbox.hostname;
        hostnameItem.tooltip = element.sandbox.hostname;
        details.push(hostnameItem);
    
        const usernameItem = new SandboxDetailItem(`Username`);
        usernameItem.description = element.sandbox.username ?? '(none)';
        usernameItem.tooltip = element.sandbox.username ?? '(none)';
        details.push(usernameItem);
    
        const codeVersionItem = new SandboxDetailItem(`Code Version`);
        codeVersionItem.description = element.sandbox["code-version"];
        codeVersionItem.tooltip = element.sandbox["code-version"];
        details.push(codeVersionItem);
    
        if (element.sandbox.cartridges?.length) {
            details.push(new SandboxDetailItem(`Cartridges:`));
            element.sandbox.cartridges.forEach(cart => {
                const cartItem = new SandboxDetailItem(`   - ${cart}`);
                cartItem.tooltip = cart;
                details.push(cartItem);
            });
        } else {
            details.push(new SandboxDetailItem(`Cartridges: (none)`));
        }
    
        return details;
    }
}


export class SandboxItem extends vscode.TreeItem {
    constructor(
        public sandbox: SandboxConfig,
        activeSandboxName?: string
    ) {
        super(sandbox.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'sandbox';
        this.tooltip = `Hostname: ${sandbox.hostname}\nUsername: ${sandbox.username ?? '(none)'}\nCode Version: ${sandbox["code-version"]}`;

        if (sandbox.name === activeSandboxName) {
            this.iconPath = new vscode.ThemeIcon("check", new vscode.ThemeColor("testing.iconPassed"));
        } else {
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




export class SandboxDetailItem extends vscode.TreeItem {
    constructor(label: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
    }
}


export async function exportSetup(context: vscode.ExtensionContext) {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) return;

    const dwPath = path.join(workspace, 'dw.json');
    const envPath = path.join(workspace, 'dw-envs.json');
    if (!fs.existsSync(dwPath) || !fs.existsSync(envPath)) return;

    const global = {
        'dw-username': context.globalState.get('dw-username'),
        'dw-password': context.globalState.get('dw-password'),
        'dw-hostnames': context.globalState.get('dw-hostnames'),
        'dw-usernames': context.globalState.get('dw-usernames'),
        'dw-codeversions': context.globalState.get('dw-codeversions')
    };

    const folder = await vscode.window.showOpenDialog({ canSelectFolders: true });
    if (!folder) return;

    const zipPath = path.join(folder[0].fsPath, 'sandbox_config.zip');
    const archive = archiver('zip');
    const output = fs.createWriteStream(zipPath);

    archive.pipe(output);
    archive.file(dwPath, { name: 'dw.json' });
    archive.file(envPath, { name: 'dw-envs.json' });
    archive.append(JSON.stringify(global, null, 4), { name: 'globalState.json' });

    archive.finalize();
}

export async function importSetup(context: vscode.ExtensionContext) {
    const zip = await vscode.window.showOpenDialog({ canSelectFiles: true, filters: { Zip: ['zip'] } });
    if (!zip) return;

    const extractPath = path.dirname(zip[0].fsPath);

    fs.createReadStream(zip[0].fsPath).pipe(unzipper.Extract({ path: extractPath })).on('close', async () => {
        const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspace) return;

        ['dw.json', 'dw-envs.json'].forEach(f => fs.copyFileSync(path.join(extractPath, f), path.join(workspace, f)));

        const global = JSON.parse(fs.readFileSync(path.join(extractPath, 'globalState.json'), 'utf-8'));
        for (const key in global) {
            await context.globalState.update(key, global[key]);
        }
    });
}


export async function deleteSavedUsername(context: vscode.ExtensionContext) {
    const usernames = context.globalState.get<string[]>('dw-usernames') || [];
    const username = await vscode.window.showQuickPick(usernames);
    if (!username) return;
    await context.globalState.update('dw-usernames', usernames.filter(u => u !== username));
    await context.globalState.update(`dw-password-${username}`, undefined);
}

export async function deleteSavedSandbox(context: vscode.ExtensionContext) {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) return;

    const envPath = path.join(workspace, 'dw-envs.json');
    const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));

    const sandbox = await vscode.window.showQuickPick(envs.sandboxes.map((sb: SandboxConfig) => sb.name));
    if (!sandbox) return;

    envs.sandboxes = envs.sandboxes.filter((sb: SandboxConfig) => sb.name !== sandbox);
    fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
    vscode.commands.executeCommand('dwEnvSwitcherView.refresh');
}

export async function deleteSandboxFromView(context: vscode.ExtensionContext, item: any) {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) return;

    const envPath = path.join(workspace, 'dw-envs.json');
    const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
    envs.sandboxes = envs.sandboxes.filter((sb: SandboxConfig) => sb.name !== item.sandbox.name);
    fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
    vscode.commands.executeCommand('dwEnvSwitcherView.refresh');
}

export async function changeCartridges(context: vscode.ExtensionContext, item: SandboxItem) {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) return;

    const envPath = path.join(workspace, 'dw-envs.json');
    const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
    const dwPath = path.join(workspace, 'dw.json');

    const available = await getCartridgesFromDirectory(workspace);
    const selected = await vscode.window.showQuickPick(getCartridgeFolderNames(available), { canPickMany: true });

    const sandbox = envs.sandboxes.find((sb: SandboxConfig) => sb.name === item.sandbox.name);
    if (sandbox) {
        sandbox.cartridges = selected;
        fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
        fs.writeFileSync(dwPath, JSON.stringify(sandbox, null, 4));
        vscode.window.showInformationMessage(`Updated cartridges for ${sandbox.name}`);
        vscode.commands.executeCommand('dwEnvSwitcherView.refresh');
    }
}


export async function switchCurrentSandboxCodeVersion(context: vscode.ExtensionContext) {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) return;

    const dwPath = path.join(workspace, 'dw.json');
    const envPath = path.join(workspace, 'dw-envs.json');

    const config = JSON.parse(fs.readFileSync(dwPath, 'utf-8'));
    const current = config['code-version'];
    const versions = context.globalState.get<string[]>('dw-codeversions') || [];

    const selected = await vscode.window.showQuickPick(['➕ Enter New', ...versions], { placeHolder: `Current: ${current}` });
    if (!selected) return;

    const newVersion = selected === '➕ Enter New' ? await vscode.window.showInputBox({ prompt: 'Enter new code version' }) : selected;
    if (!newVersion) return;

    if (!versions.includes(newVersion)) {
        versions.push(newVersion);
        await context.globalState.update('dw-codeversions', versions);
    }

    config['code-version'] = newVersion;
    fs.writeFileSync(dwPath, JSON.stringify(config, null, 4));

    if (fs.existsSync(envPath)) {
        const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
        const match = envs.sandboxes.find((sb: SandboxConfig) => sb.hostname === config.hostname && sb.username === config.username);
        if (match) {
            match['code-version'] = newVersion;
            fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
        }
    }
}

export async function changeUser(context: vscode.ExtensionContext, item: SandboxItem) {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) return;

    const envPath = path.join(workspace, 'dw-envs.json');
    const envs = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
    const dwPath = path.join(workspace, 'dw.json');

    const usernames = context.globalState.get<string[]>('dw-usernames') || [];
    const username = await pickOrEnter('username', usernames, item.sandbox.username);
    if (!username) return;
    if (!usernames.includes(username)) {
        usernames.push(username);
        await context.globalState.update('dw-usernames', usernames);
    }
    const password = await vscode.window.showInputBox({ prompt: 'Enter new password', password: true });

    const sandbox = envs.sandboxes.find((sb: SandboxConfig) => sb.name === item.sandbox.name);
    if (sandbox) {
        sandbox.username = username;
        sandbox.password = password;
        fs.writeFileSync(envPath, JSON.stringify(envs, null, 4));
        fs.writeFileSync(dwPath, JSON.stringify(sandbox, null, 4));
        vscode.window.showInformationMessage(`Updated user for ${sandbox.name}`);
        vscode.commands.executeCommand('dwEnvSwitcherView.refresh');
    }
}

export async function changeSavedPassword(context: vscode.ExtensionContext) {
    const usernames = context.globalState.get<string[]>('dw-usernames') || [];
    if (usernames.length === 0) {
        vscode.window.showInformationMessage('No saved usernames found.');
        return;
    }

    const username = await vscode.window.showQuickPick(usernames, { placeHolder: 'Select username to update password' });
    if (!username) return;

    const newPassword = await vscode.window.showInputBox({ prompt: `Enter new password for ${username}`, password: true });
    if (!newPassword) return;

    // Update global password
    await context.globalState.update(`dw-password-${username}`, newPassword);

    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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

export async function sandboxActions(context: vscode.ExtensionContext, item: SandboxItem) {
    const action = await vscode.window.showQuickPick([
        'Edit Sandbox',
        'Change Cartridges',
        'Change Code Version',
        'Change User',
        'Delete Sandbox'
    ], { placeHolder: `Select action for ${item.sandbox.name}` });

    if (!action) return;

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

async function activateSandbox(sandbox: SandboxConfig) {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) return;

    const dwPath = path.join(workspace, 'dw.json');

    fs.writeFileSync(dwPath, JSON.stringify(sandbox, null, 4));

    vscode.window.showInformationMessage(`Activated sandbox: ${sandbox.name}`);

    vscode.commands.executeCommand('dwEnvSwitcherView.refresh');
}


export function activate(context: vscode.ExtensionContext) {
    const sandboxProvider = new SandboxTreeDataProvider(context);
    vscode.window.registerTreeDataProvider('dwEnvSwitcherView', sandboxProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('dw-env-switcher.selectSandbox', () => simpleSandboxSelection(context)),
        vscode.commands.registerCommand('dw-env-switcher.selectSandboxWithDetails', (sandboxName) => detailedSandboxSelection(context, sandboxName)),
        vscode.commands.registerCommand('dw-env-switcher.deleteSavedUsername', () => deleteSavedUsername(context)),
        vscode.commands.registerCommand('dw-env-switcher.deleteSavedSandbox', () => deleteSavedSandbox(context)),
        vscode.commands.registerCommand('dw-env-switcher.exportSetup', () => exportSetup(context)),
        vscode.commands.registerCommand('dw-env-switcher.importSetup', () => importSetup(context)),
        vscode.commands.registerCommand('dw-env-switcher.switchCodeVersion', () => switchCurrentSandboxCodeVersion(context)),
        vscode.commands.registerCommand('dw-env-switcher.deleteSandboxFromView', (item: SandboxItem) => deleteSandboxFromView(context, item)),
        vscode.commands.registerCommand('dwEnvSwitcherView.refresh', () => sandboxProvider.refresh()),
        vscode.commands.registerCommand('dw-env-switcher.addNewSandbox', () => detailedSandboxSelection(context)),
        vscode.commands.registerCommand('dw-env-switcher.changeCartridges', (item: SandboxItem) => changeCartridges(context, item)),
        vscode.commands.registerCommand('dw-env-switcher.changeUser', (item: SandboxItem) => changeUser(context, item)),
        vscode.commands.registerCommand('dw-env-switcher.sandboxActions', (item: SandboxItem) => sandboxActions(context, item)),
        vscode.commands.registerCommand('dw-env-switcher.changeSavedPassword', () => changeSavedPassword(context)),
        vscode.commands.registerCommand('dw-env-switcher.activateSandbox', (sandbox: SandboxConfig) => activateSandbox(sandbox))

    );
}

export function deactivate() {}





