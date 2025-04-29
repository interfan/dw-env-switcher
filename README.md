
# DW Environment Switcher

**Author:** Ivaylo Trepetanov
**License:** MIT

---

## About

This extension is specifically built to enhance the development experience when using the **Prophet Debugger** (Salesforce Commerce Cloud) inside Visual Studio Code.

It helps you manage multiple Salesforce sandbox environments and switch between them easily, without manually editing `dw.json`. Additionally, it allows you to **select cartridges** dynamically for your Salesforce Commerce Cloud projects. The extension also includes **Export** and **Import** functionality, making it easy to transfer configurations between different computers.

---

## Features

- 🌐 Manage multiple Salesforce Commerce Cloud sandboxes.
- 🔒 Securely store global usernames and passwords.
- 🔄 Quickly switch between hostnames and code versions.
- 🛠 Save and overwrite sandbox configurations.
- 🧹 Delete saved users and sandboxes easily.
- 🐞 Works seamlessly with Prophet Debugger setups.
- 🛠 Dynamically select available cartridges from your project directory.
- 📦 **Export Sandbox Setup**: Export your environment configurations to a zip file.
- 📥 **Import Sandbox Setup**: Import sandbox configurations from a zip file to restore your environment.

---

## Commands Available

- `Select Sandbox`: Select an existing environment from `dw-envs.json`.
- `Select Sandbox with Details`: Build and save a custom environment manually, including selecting cartridges.
- `Delete Saved Username`: Remove a saved username (and password).
- `Delete Saved Sandbox`: Remove a saved sandbox from `dw-envs.json`.
- `Export Sandbox Setup`: Export your current environment setup (including `dw.json`, `dw-envs.json`, and global state) to a zip file.
- `Import Sandbox Setup`: Import a previously exported sandbox setup (including `dw.json`, `dw-envs.json`, and global state) from a zip file.

---

## How to Use

1. Open your Salesforce Commerce Cloud project with Prophet Debugger installed.
2. Press `Ctrl+Shift+P` to open the Command Palette.
3. Search for **DW Environment Switcher** commands.
4. Quickly switch or create new environment setups as needed, and choose your cartridges if required.

### Export Setup
- Use **Export Sandbox Setup** to create a backup of your current environment (including `dw.json`, `dw-envs.json`, and global state).
- A zip file containing the exported configuration will be saved in a location of your choice.
- Share or move the zip file to another machine to restore the environment.

### Import Setup
- Use **Import Sandbox Setup** to restore your previously exported sandbox configuration.
- Select a zip file containing `dw.json`, `dw-envs.json`, and `globalState.json`.
- Choose whether to overwrite your current workspace setup with the imported configuration.

---

## Cartridge Selection

When selecting a sandbox with details, you'll be prompted to choose which **cartridges** to use for the selected environment. The extension dynamically fetches the available cartridges from your project directory and presents them in a list for easy selection.

1. Choose **Yes** when asked if you'd like to select cartridges.
2. A list of cartridges from the `cartridges/` directory will be displayed.
3. Select one or more cartridges that you want to associate with the sandbox environment.

---

## Requirements

- Prophet Debugger installed in VS Code.
- `dw-envs.json` file inside your project (can be created automatically).
- Node.js installed locally (for VS Code extension dependencies).

---

## Extension Settings

No special settings needed — all credentials and configurations are stored securely using VS Code's global storage.

---

## License

MIT © 2024 Ivaylo Trepetanov
