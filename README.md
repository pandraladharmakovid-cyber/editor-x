# EDITOR X

> A powerful browser-based development environment for building, editing, running, and previewing web projects directly in your browser.

EDITOR X brings a modern VS Code-style development experience to the browser. It combines a professional code editor, project explorer, interactive terminal, live preview, browser-based Node.js runtime, project upload/download tools, authentication, and developer-focused workflow features into one workspace.

---

## ✨ Features

### 🧑‍💻 Browser-Based Development Environment

- Full development workspace running directly in the browser
- Browser-based Node.js runtime powered by WebContainer
- Virtual project filesystem
- VS Code/Replit-style development workflow
- Runtime status monitoring
- No traditional local IDE required for the browser workspace

---

## 📁 Project Explorer

EDITOR X includes a complete project file explorer.

- Hierarchical file tree
- Create files
- Create folders
- Rename files and folders
- Delete files and folders
- Refresh project tree
- Search/filter project files
- Open files directly from Explorer
- Unsaved-file indicators
- Nested directory support
- Large project tree support
- Filesystem synchronization

---

## 📤 Upload Projects

Bring existing projects directly into EDITOR X.

### File Upload

- Upload individual files
- Upload multiple files
- Preserve file paths where supported
- Replace existing files
- Ignore conflicting files when required

### Folder Upload

- Upload an entire project folder
- Preserve nested directory structure
- Import large projects
- Automatically create required directories
- Skip unnecessary directories such as `node_modules` and `.git`

EDITOR X uses modern browser file APIs when available and provides fallback support where possible.

---

## 📥 Download Projects

Export your current EDITOR X project.

- Download the current project
- Recursively collect project files
- Preserve project structure
- Create an export snapshot
- Generate browser-downloadable project files

This allows users to take their project out of EDITOR X whenever they need it.

---

## 📝 Professional Code Editor

EDITOR X uses **Monaco Editor**, the same editor technology that powers VS Code.

### Editor capabilities

- Syntax highlighting
- Multi-language support
- Automatic language detection
- IntelliSense
- Multiple editor tabs
- Active-file management
- Unsaved-change indicators
- Automatic saving
- Manual saving
- Save all files
- Save failure handling
- Editor focus controls
- Keyboard shortcuts

### Editor shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + S` | Save current file |
| `Ctrl/Cmd + Shift + S` | Save all changed files |
| `Ctrl/Cmd + P` | Toggle editor shortcuts |
| `Ctrl/Cmd + O` | Focus editor |

---

# 🖥️ Interactive Terminal

EDITOR X includes a real interactive browser terminal powered by **xterm.js + WebContainer**.

The terminal runs the WebContainer `jsh` shell and allows developers to work with their project directly from the browser.

### Terminal capabilities

- Interactive shell
- Node.js execution
- npm/pnpm commands
- Run project scripts
- Create files and folders
- Read and modify project files
- Install packages
- Run development servers
- Stream process output
- 10,000-line terminal scrollback
- Copy and paste
- Terminal links
- Clear terminal
- Restart terminal
- Interrupt running processes
- Maximize terminal
- Scroll-to-bottom controls
- Terminal status indicators
- Persistent shell process
- Large command/paste handling
- Serialized terminal input to prevent concurrent stdin conflicts

### Example commands

```bash
pwd
ls
cat package.json
pnpm install
pnpm run dev
pnpm run build
mkdir components
````

---

# 📋 Smart Project Paste

EDITOR X includes project-aware paste functionality for handling large multi-file content.

Instead of treating every paste as plain text, EDITOR X can analyze structured project content before writing it to the filesystem.

### Smart Paste capabilities

* Detect project paste payloads
* Analyze pasted project content
* Parse multiple files
* Validate project paths
* Preview changes before committing
* Detect file conflicts
* Detect duplicate paths
* Handle overwrite decisions
* Create required directories
* Write multiple project files
* Display progress
* Display project summaries
* Validate content before filesystem changes

This makes large project imports and AI-generated project pastes much easier to manage.

---

# 👀 Live Preview

EDITOR X provides a live application preview alongside the editor.

### Preview capabilities

* Run development servers inside WebContainer
* Display the running application
* Live preview URL
* Refresh preview
* Open preview in a new browser tab
* Fullscreen preview
* Double-click fullscreen
* Escape to exit fullscreen
* Preview loading states
* Preview error handling
* Runtime connection status

---

# ⚡ Hot Module Replacement

EDITOR X supports modern development-server workflows with HMR.

When a supported development server is running:

```text
Edit file
   ↓
Save/change detected
   ↓
WebContainer filesystem
   ↓
Development server
   ↓
HMR
   ↓
Live Preview updates
```

This allows developers to see changes without manually rebuilding the entire application.

---

# ↔️ Resizable Workspace

EDITOR X provides a flexible multi-panel workspace.

```text
┌─────────────────┬────────────────────────┬──────────────────┐
│                 │                        │                  │
│    EXPLORER     │       CODE EDITOR      │     PREVIEW      │
│                 │                        │                  │
│    Files        │       Monaco           │      Live        │
│    Folders      │       Editor           │     Website      │
│                 │                        │                  │
├─────────────────┴────────────────────────┤                  │
│                 TERMINAL                 │                  │
│              WebContainer jsh            │                  │
└─────────────────────────────────────────┴──────────────────┘
```

Panels can be resized to create a workspace that fits the developer's workflow.

---

# 🪟 Open in New Window

EDITOR X supports opening the application in a separate browser window.

Useful for:

* Multi-monitor workflows
* Separate preview windows
* Keeping the main workspace accessible
* Working across multiple browser windows

---

# 🔐 Authentication

EDITOR X includes authentication powered by **Supabase**.

### Authentication features

* User registration
* User login
* User logout
* Email/password authentication
* Persistent sessions
* Session restoration
* Automatic authentication state handling
* Token refresh
* PKCE authentication flow
* Protected workspace access
* Signed-in account information

### Environment variables

Create a `.env` file with:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Never commit private credentials or secret keys to GitHub.

---

# 🗂️ Project & Filesystem Operations

The EDITOR X filesystem layer supports:

* Create files
* Read files
* Write files
* Read binary files
* Write binary files
* Create directories
* Delete files
* Delete directories
* Rename files
* Rename directories
* Move files
* Copy files
* Copy directories
* List directories
* Recursively scan projects
* Check whether paths exist
* Check whether paths are directories
* Create project snapshots
* Restore project snapshots
* Upload files
* Upload directories
* Export projects
* Calculate project statistics

---

# 🔄 File Watching

EDITOR X monitors filesystem changes inside WebContainer.

Changes can originate from:

* Monaco Editor
* Terminal commands
* npm/pnpm
* Project scripts
* Uploaded projects
* Filesystem operations

The watcher helps keep the Explorer, editor, and project state synchronized.

---

# 📊 Project Statistics

EDITOR X can analyze the project filesystem and calculate project information such as:

* Files
* Directories
* Project structure
* File counts
* Project size-related information

This is especially useful when working with large projects.

---

# 🏗️ Architecture

EDITOR X is built around a browser-based development runtime.

```text
                    ┌─────────────────────────┐
                    │       EDITOR X UI       │
                    │      React + TypeScript │
                    └────────────┬────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
     File Explorer          Monaco Editor          xterm.js
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                                 ▼
                     ┌─────────────────────────┐
                     │      WebContainer       │
                     │                         │
                     │  Virtual Filesystem     │
                     │  Node.js Runtime        │
                     │  Process Management     │
                     │  Development Server     │
                     └────────────┬────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  Live Preview   │
                         │  Running App    │
                         └─────────────────┘

                     Authentication
                           │
                           ▼
                         Supabase
```

---

# 🛠️ Technology Stack

| Technology             | Purpose                          |
| ---------------------- | -------------------------------- |
| React 18               | User interface                   |
| TypeScript             | Type-safe development            |
| Vite                   | Development and production build |
| WebContainer API       | Browser-based Node.js runtime    |
| Monaco Editor          | Code editing                     |
| xterm.js               | Interactive terminal             |
| xterm-addon-fit        | Terminal sizing                  |
| xterm-addon-web-links  | Terminal links                   |
| Zustand                | Application state                |
| React Resizable Panels | Workspace resizing               |
| Radix UI               | Accessible UI components         |
| Lucide React           | Icons                            |
| Tailwind CSS           | Styling                          |
| Supabase               | Authentication and sessions      |

---

# 🚀 Getting Started

## Requirements

* Node.js 18+
* pnpm recommended
* Modern browser
* Browser support for WebContainer
* Cross-origin isolation support

---

## Installation

Clone the repository:

```bash
git clone <YOUR_GITHUB_REPOSITORY>
```

Enter the project:

```bash
cd <YOUR_PROJECT_FOLDER>
```

Install dependencies:

```bash
pnpm install
```

---

## Development

Start the development server:

```bash
pnpm dev
```

Open the local URL displayed by Vite.

---

## Production Build

```bash
pnpm build
```

---

## Preview Production Build

```bash
pnpm preview
```

---

# 🌐 Deployment

EDITOR X includes deployment configuration for modern hosting platforms.

The project already contains Vercel configuration.

Recommended deployment architecture:

```text
              GitHub
                 │
                 │ Push
                 ▼
              Vercel
                 │
                 ▼
        ┌─────────────────┐
        │    EDITOR X     │
        │    Live Site    │
        └─────────────────┘
```

The production build uses:

```bash
pnpm build
```

Build output:

```text
dist
```

---

# 🔒 WebContainer Requirements

WebContainer requires cross-origin isolation.

The production deployment must provide:

```text
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

EDITOR X already includes the required deployment configuration.

---

# ⚠️ Current Limitations

EDITOR X is actively being developed.

### Direct Deployment

The current deployment UI exists, but direct one-click production deployment from inside EDITOR X is not yet fully connected to a hosting provider.

The project can still be deployed through Vercel or another compatible hosting platform.

### Browser Runtime Limitations

Because EDITOR X uses WebContainer:

* Native Node.js addons may not work
* Browser memory limits apply
* CPU-intensive workloads may be slower than native environments
* Network requests remain subject to browser/CORS restrictions
* Some native operating-system functionality is unavailable

### Project Persistence

Authentication and session persistence are provided through Supabase.

The current WebContainer workspace should not be considered a complete cloud project-storage system yet. Full remote project persistence is a future capability.

---

# ⌨️ Terminal Controls

| Shortcut           | Action                       |
| ------------------ | ---------------------------- |
| `Ctrl + C`         | Interrupt running process    |
| `F5`               | Restart terminal             |
| `Ctrl + Shift + L` | Clear terminal               |
| `Ctrl + Shift + K` | Terminal reset/clear control |
| Copy               | Copy selected terminal text  |
| Paste              | Paste clipboard content      |

---

# 📂 Project Structure

```text
src/
├── auth/
│   └── Auth.tsx
│
├── editor/
│   └── Editor.tsx
│
├── lib/
│   └── supabase.ts
│
├── preview/
│   └── Preview.tsx
│
├── store/
│   └── useStore.ts
│
├── ui/
│   ├── FileTree.tsx
│   └── Terminal.tsx
│
├── webcontainer/
│   ├── fileOperations.ts
│   ├── fileWatcher.ts
│   ├── init.ts
│   ├── template.ts
│   ├── terminalManager.ts
│   └── webcontainer.ts
│
├── App.tsx
├── index.css
├── main.tsx
└── vite-env.d.ts
```

---

# 🎯 Product Vision

EDITOR X aims to provide a complete browser-first development environment.

The core workflow is:

```text
Open Project
     ↓
Explore Files
     ↓
Edit Code
     ↓
Run Commands
     ↓
Install Packages
     ↓
Start Development Server
     ↓
Live Preview
     ↓
Test & Iterate
     ↓
Export / Deploy
```

The goal is to make web development possible from a browser while providing the workflow developers expect from a modern desktop IDE.

---

# 🗺️ Future Roadmap

Planned and potential future improvements include:

* One-click production deployment
* Cloud project persistence
* Git integration
* GitHub integration
* Collaboration
* Multiple terminal tabs
* Advanced global search and replace
* Debugging tools
* Project templates
* AI-assisted development
* Developer workflow automation
* More advanced project management
* Cross-device project continuation

Future features will be developed while preserving the existing verified:

* Editor
* WebContainer runtime
* Terminal
* File operations
* File watcher
* Live preview
* Project upload/download foundation

---

# 📜 License

This project is currently intended to be released under the MIT License.

See the repository's `LICENSE` file for the complete license text.

---

# 👨‍💻 Creator

**Pandrala Dharma Kovidh**

Creator and developer of **EDITOR X**.

---

## ⭐ EDITOR X

**Build. Run. Preview. Create — directly in your browser.**
