# ExcaliHub

A Chrome extension that saves your [Excalidraw](https://excalidraw.com) drawings directly to a private GitHub repository.

## Features

- 🎨 **Seamless Integration** - Works directly with Excalidraw in your browser
- 💾 **One-Click Save** - Save drawings to your GitHub repository with a single click
- 📂 **Saved Files Sidebar** - Browse and load your saved drawings directly from Excalidraw
- 🔐 **Secure Authentication** - Uses GitHub Device Flow (no passwords stored)
- 📁 **Organized Storage** - Automatically organizes drawings by date and filename
- ⚙️ **Customizable** - Configure your repository, branch, and save path

## Installation

### From Chrome Web Store (Coming Soon)

Visit the Chrome Web Store and click "Add to Chrome".

### Manual Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/adhilroshan/excalihub.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in the top right)

4. Click **Load unpacked** and select the `excalihub` folder

## Setup

### 1. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **OAuth Apps** → **New OAuth App**
3. Fill in the details:
   - **Application name**: ExcaliHub (or your preferred name)
   - **Homepage URL**: `https://excalidraw.com`
   - **Authorization callback URL**: `https://excalidraw.com` (can be any URL, not used with Device Flow)
4. **Important**: Enable **Device Flow** for this OAuth App
5. Copy your **Client ID**

### 2. Configure the Extension

1. Click the ExcaliHub extension icon
2. Click **Settings** (gear icon)
3. Open `background.js` in a text editor
4. Replace the `CLIENT_ID` value with your OAuth App's Client ID:
   ```javascript
   const CLIENT_ID = "YOUR_CLIENT_ID_HERE";
   ```
5. Reload the extension in `chrome://extensions/`

### 3. Connect Your GitHub Account

1. Click the extension icon
2. Click **Connect GitHub**
3. A browser tab will open to `github.com/login/device`
4. Enter the code displayed in the extension
5. Authorize the application

### 4. Configure Repository Settings

1. Open extension **Settings**
2. Fill in:
   - **Owner**: Your GitHub username or organization
   - **Repository**: Repository name (must exist)
   - **Branch**: Branch to save to (default: `main`)
   - **Save path**: Folder path within the repo (default: `drawings/`)
3. Click **Save Settings**

## Usage

### Saving a Drawing

1. Open [Excalidraw](https://excalidraw.com) and create your drawing
2. Click the ExcaliHub extension icon
3. (Optional) Edit the filename
4. Click **Save to GitHub**
5. Your drawing is saved as an `.excalidraw` file to your configured repository

### Browsing & Loading Saved Files

When you visit Excalidraw, the **ExcaliHub sidebar** automatically appears on the right side:

1. The sidebar lists all `.excalidraw` files from your configured GitHub repository
2. Click the **refresh button** to reload the file list
3. Click any file to **load it into your canvas** (replaces the current scene)
4. Use the **close button (X)** to hide the sidebar
5. Click the **floating ExcaliHub button** (bottom-right corner) to reopen it

## Architecture

```
┌─────────────────┐
│   popup.js      │  ← Extension popup UI (save drawings)
│   popup.html    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  background.js  │  ← Service worker: Auth, GitHub API, file list/load
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  content.js     │  ← Injected sidebar: file browser + scene loader
└─────────────────┘
```

### Components

- **background.js**: Handles OAuth Device Flow, token storage, GitHub API calls (save, list, load)
- **content.js**: Extracts scene data and injects the sidebar into excalidraw.com
- **popup.js/popup.html**: Main extension popup interface for saving drawings
- **options.js/options.html**: Settings page for configuration

### Message Types

| Message | Direction | Description |
|---------|-----------|-------------|
| `GET_SCENE` | popup → content | Extract current Excalidraw scene |
| `SAVE_SCENE` | popup → background | Save scene to GitHub |
| `LIST_FILES` | content → background | List all `.excalidraw` files from repo |
| `LOAD_FILE` | content → background | Load a specific file's content |
| `START_AUTH` | popup/options → background | Start GitHub Device Flow |
| `GET_AUTH_STATUS` | popup/options → background | Check authentication status |
| `SIGN_OUT` | options → background | Clear stored token |

## Security

- 🔒 **No passwords stored** - Uses GitHub's OAuth Device Flow
- 🔒 **Token stored securely** - Access token saved in Chrome's local storage
- 🔒 **Private repositories** - Your drawings stay in your private repos
- ⚠️ **Client ID is public** - The OAuth Client ID in `background.js` is visible but safe (it's not a secret)

## Development

### Project Structure

```
excalihub/
├── manifest.json      # Extension manifest (MV3)
├── background.js      # Service worker
├── content.js         # Content script
├── popup.html         # Popup UI
├── popup.js
├── options.html       # Settings page
├── options.js
├── icons/             # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── README.md
├── LICENSE
└── .gitignore
```

### Permissions

The extension requires the following permissions:

- `storage`: Save authentication token and settings
- `activeTab`: Access current Excalidraw tab
- `scripting`: Inject content script
- `tabs`: Query for Excalidraw tab

## Troubleshooting

### "Not configured" error
- Make sure you've filled in the Owner and Repository fields in Settings

### Authentication fails
- Verify your OAuth App has Device Flow enabled
- Check that the Client ID in `background.js` is correct
- The OAuth app must be registered under your GitHub account

### Save fails with 404
- Verify the repository exists and you have write access
- Check that the branch name is correct
- Ensure the save path doesn't start with `/`

### Empty canvas error
- Make sure your Excalidraw canvas has at least one element

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 🐛 **Bug Reports**: [Open an issue](https://github.com/adhilroshan/excalihub/issues)
- 💡 **Feature Requests**: [Open an issue](https://github.com/adhilroshan/excalihub/issues)
- 📧 **Questions**: [Open a discussion](https://github.com/adhilroshan/excalihub/discussions)

## Acknowledgments

- [Excalidraw](https://excalidraw.com) - The amazing drawing tool this extension works with
- [GitHub](https://github.com) - For the OAuth Device Flow and API

---

Made with ❤️ for the Excalidraw community
