# Mypost

[![Desktop builds](https://github.com/Wayne-HJ/Mypost/actions/workflows/build.yml/badge.svg)](https://github.com/Wayne-HJ/Mypost/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS-blue.svg)](#desktop-builds)

**An open-source, local-first API management and debugging tool for Windows and macOS.**

Organize REST requests into collections, manage environments, debug HTTP responses, and keep your work on your own device. Mypost provides a focused desktop workbench with Chinese and English interfaces and no account required.

English · [简体中文](README.zh-CN.md)

## Project status

Mypost is in early development (`v0.1.0`). The current version focuses on the REST / HTTP workflow: compose, organize, send, inspect, and reuse requests. It is built with Electron, React, and TypeScript and is released under the [MIT license](LICENSE).

macOS desktop behavior has been tested locally. Windows installers have been cross-built; Windows installation and runtime still need verification on a Windows device. Contributions, bug reports, and feedback are welcome.

## Features

- **Request management:** collections, multiple tabs, searchable requests, duplication, naming, deletion, and automatic local saving.
- **HTTP debugging:** GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS; configurable query parameters and headers, including repeated and disabled fields.
- **Request bodies:** JSON, plain text, and URL-encoded forms, with JSON formatting.
- **Authentication:** No Auth, Bearer Token, and Basic Auth.
- **Environments:** reusable variables in URLs, parameters, headers, bodies, and authentication with `{{variable}}` syntax.
- **Response inspection:** status, duration, size, headers, JSON highlighting, raw content, search, copy, and download. HTTP error responses remain inspectable.
- **Request controls:** cancellation, timeouts, and configurable redirect following.
- **History:** the latest 100 request snapshots, ready to restore and send again.
- **Import and export:** import common cURL commands, copy a request as cURL, and exchange Mypost workspaces as JSON.
- **Language settings:** switch between Simplified Chinese and English in Settings. Saving applies the selection immediately and remembers it across restarts.
- **Desktop workflow:** keyboard shortcuts, adjustable request and response panels, and cross-origin requests through the desktop HTTP engine.

Request bodies are limited to 10 MB and responses to 20 MB. The viewer previews up to 250 KB; copy and download retain the complete response. GET and HEAD requests do not send a body.

## Getting started

Use Node.js 22.12 or newer, npm, and Git on Windows or macOS. CI uses Node.js 24.

```bash
git clone https://github.com/Wayne-HJ/Mypost.git
cd Mypost
npm ci
npm run dev
```

This launches the Electron window and a local Vite server. The interface defaults to Chinese. Open the lower-left **设置 → 软件语言**, select **English**, and save. In English, this is **Settings → App language**.

Create a request, enter an HTTP or HTTPS URL, configure parameters, headers, authentication, or a body, and click **Send**. Save requests into collections and use environments for values such as `{{baseUrl}}` and `{{token}}`.

### Try the local demo API

Start the bundled test server in another terminal:

```bash
npm run fixture
```

Choose the seeded **本地开发** (Local development) environment and send a request from **入门示例** (Getting started examples). The fixture listens on `http://127.0.0.1:8088` and offers echo endpoints plus `/delay/10`, `/redirect`, `/binary`, and `/status/422`.

The seeded **公共测试** (Public testing) environment uses httpbin.org and requires internet access. Existing collection names, request content, environment names, and server responses are preserved when changing the interface language.

### Browser development preview

```bash
npm run dev:web
```

Open `http://127.0.0.1:5173`. The preview requires the Vite server to stay running and uses separate browser storage. The packaged desktop app sends requests through the Electron main process.

## Desktop builds

```bash
npm run build       # Type checking and frontend build
npm run start       # Launch the built app with Electron
npm run dist:dir    # Unpacked app for the current platform
npm run dist:mac    # macOS DMG / ZIP: Apple Silicon and Intel
npm run dist:win    # Windows NSIS installers: x64 and ARM64
```

Build output goes to `release/`. Build each platform on its own operating system when possible. The [desktop build workflow](https://github.com/Wayne-HJ/Mypost/actions/workflows/build.yml) tests and packages Windows and macOS on pushes to `main`, pull requests, and version tags. Installers are available as artifacts of successful workflow runs; they are not automatically published as GitHub Releases.

Development builds use an ad-hoc signature on macOS and are unsigned on Windows. For signed distribution, configure your own signing credentials, replace the macOS `identity: "-"` setting, and configure macOS notarization. See the [electron-builder signing documentation](https://www.electron.build/code-signing.html).

## Local data and privacy

Mypost stores collections, settings, environments, and request history locally. An account or cloud service is not required.

| Platform | Workspace location |
| --- | --- |
| macOS | `~/Library/Application Support/Mypost/workspace.json` |
| Windows | `%APPDATA%/Mypost/workspace.json` |
| Browser preview | localStorage for the current origin |

Saves use a serial queue and atomic file replacement. If an existing workspace cannot be read, the app displays the error and avoids overwriting the original file.

Environment values, authentication details, and historical request snapshots are stored as plain text. Workspace exports include these values. History retains request configuration, not response bodies. Review exports before sharing them or committing them to a repository.

The language preference is stored as `settings.language` (`zh-CN` or `en`). Older workspaces without this setting default to Chinese. Importing a workspace also imports its language preference.

## Keyboard shortcuts

Use `Cmd` on macOS and `Ctrl` on Windows.

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + Enter` | Send the current request |
| `Cmd/Ctrl + S` | Save to a collection |
| `Cmd/Ctrl + N` | Create a request |
| `Cmd/Ctrl + L` | Focus the URL field |
| `Cmd/Ctrl + K` | Search requests |
| `Esc` | Close a dialog |

## Development and testing

```bash
npm test
npm run build
```

Tests cover cURL parsing, environment interpolation, workspace validation and migration, language resources, atomic storage, and real HTTP behavior including cancellation, timeouts, redirects, binary data, character sets, and size limits.

```text
electron/       App lifecycle, restricted IPC, HTTP engine, and local storage
src/            React workbench, request models, and desktop bridge
shared/         Shared translations and locale formatting
scripts/        Development launcher, demo server, and icon generation
tests/          Model, localization, storage, and HTTP integration tests
.github/        CI workflows and contribution templates
```

The renderer uses context isolation and sandboxing with Node integration disabled. Desktop requests use Node fetch in the main process with default TLS verification. Response content is displayed as text rather than executed as HTML or JavaScript.

## Roadmap and current scope

The current release supports REST / HTTP and Mypost's own workspace format. It does not yet provide multipart file uploads, Cookie management, proxy configuration, client certificates, WebSocket, a dedicated GraphQL editor, request assertions, collection runners, Postman Collection compatibility, or cloud collaboration.

Potential next areas include broader import compatibility, file uploads, and automated request workflows. These are directions for discussion, not committed delivery dates. Propose a use case through a [feature request](https://github.com/Wayne-HJ/Mypost/issues/new?template=feature_request.md).

The cURL importer handles common separate options, including `-X`, `-H`, `-d`, `--data-raw`, `--data-urlencode`, and `-u`. It does not execute commands or read local files. Exported commands use POSIX shell quoting.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, project structure, validation, and the pull request workflow. Use [GitHub Issues](https://github.com/Wayne-HJ/Mypost/issues) for reproducible bugs and feature proposals.

Please report the app version, operating system and architecture, reproduction steps, and expected behavior. Use sample endpoints and remove credentials from screenshots and exported workspaces.

## License

[MIT](LICENSE). Third-party dependencies retain their own licenses.
