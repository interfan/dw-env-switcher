# DW Environment Switcher

**Author:** Ivaylo Trepetanov  
**License:** MIT

---

## About

This extension is designed to improve the developer workflow when working with **Salesforce Commerce Cloud** and **Prophet Debugger** inside Visual Studio Code.

Easily manage multiple sandbox environments, securely store credentials, dynamically select cartridges, and export or import sandbox configurations between different workstations.

✅ **NEW:**  
- "Switch Current Sandbox Code Version" command for fast version switching.  
- **Activity Bar View with sandbox management actions (edit, change cartridges/user, delete)**

---

## Features

- 🌐 Manage multiple Salesforce Commerce Cloud sandboxes.
- 🔐 Securely store global usernames and passwords.
- 🔄 Quickly switch between hostnames and code versions.
- 🛠 Save and overwrite sandbox configurations.
- 📦 Dynamically select cartridges from your workspace.
- 🚮 Delete saved users and sandboxes easily.
- 📥 Import and 📤 export sandbox setups with ease.
- ✅ **Switch current sandbox code version without changing other settings.**
- 📌 **Activity Bar view for easy sandbox access and editing.**
- 🐞 Seamless integration with Prophet Debugger setups.

---

## Activity Bar View

DW Environment Switcher adds a new icon to the Activity Bar.

From the **Sandboxes view**, you can:

- 📌 **Select a sandbox** (double-click to activate).
- ✏️ **Edit sandbox details** (right-click -> `Sandbox Actions` -> Edit).
- 🎛️ **Change cartridges** (right-click -> `Change Cartridges`).
- 👤 **Change user credentials** (right-click -> `Change User`).
- ❌ **Delete sandbox** (right-click -> `Delete Sandbox`).

This makes sandbox management even faster — no need to use command palette for most operations.

---

## Commands Available

- `Select Sandbox`: Select an environment from `dw-envs.json`.
- `Select Sandbox with Details`: Create a sandbox config manually (hostname, username, password, code version, cartridges).
- `Switch Current Sandbox Code Version`: Change only the `code-version` of the current sandbox.
- `Delete Saved Username`: Remove a saved username and password.
- `Delete Saved Sandbox`: Remove a saved sandbox from `dw-envs.json`.
- `Export Sandbox Setup`: Backup `dw.json`, `dw-envs.json` and global state to a zip file.
- `Import Sandbox Setup`: Restore sandbox setup from a zip file.

---

## How to Use

1. Open your Commerce Cloud project in VS Code.
2. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac) or use the **Activity Bar view**.
3. Use sandbox commands or right-click on sandboxes in the view to manage them.
4. Select or create sandbox environments, choose cartridges, or switch code versions easily.

### Switching Code Version

Use `Switch Current Sandbox Code Version` command to:

- Quickly change the `code-version` for your current sandbox (`dw.json`).
- Automatically update `dw-envs.json` if the sandbox exists there.

No need to reselect hostname or username — just pick or enter the new code version.

---

### Export Setup

- Use `Export Sandbox Setup` to save your environment into a zip file.
- Exports `dw.json`, `dw-envs.json`, and global state (credentials, hostnames, usernames, code versions).
- Useful for backups or transferring environments between machines.

### Import Setup

- Use `Import Sandbox Setup` to restore sandbox configurations.
- Select the exported zip file and the extension will apply the configurations to your current workspace.

---

## Cartridge Selection

When configuring or switching sandboxes (using `Select Sandbox with Details`):

1. Choose **Yes** when prompted to select cartridges.
2. The extension lists valid cartridges from the workspace (folders with `.project` and `cartridges` folder).
3. Pick cartridges to associate with the sandbox. These will be added to `dw.json`.

---

## Requirements

- VS Code with Prophet Debugger installed.
- Project folder with `dw.json` and/or `dw-envs.json` (automatically created if missing).
- Node.js installed locally (VS Code extension dependencies only).

---

## Extension Settings

No configuration required.  
All credentials and sandbox environments are stored securely in VS Code global state.

---

## License

MIT © 2025 Ivaylo Trepetanov
