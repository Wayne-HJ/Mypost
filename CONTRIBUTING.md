# Contributing to Mypost

Bug reports, reproducible examples, documentation, translations, tests, and code contributions are welcome.

## Discuss the change

For a bug, open an issue with reproduction steps, expected and actual behavior, and your OS, architecture, and app version. A sanitized cURL command or a local demo endpoint is especially useful.

For a substantial feature or architectural change, open an issue before implementation so the scope and user workflow can be discussed. Small fixes and documentation improvements can go directly to a pull request.

Never include tokens, passwords, client certificates, private endpoint data, or unsanitized workspace exports in a public issue or pull request.

## Development setup

Use Node.js 22.12 or newer. CI uses Node.js 24.

```bash
git clone https://github.com/<your-username>/Mypost.git
cd Mypost
npm ci
npm run dev
```

Start `npm run fixture` in a separate terminal to test HTTP requests locally without relying on an external API. It listens on `127.0.0.1:8088`; select the **本地开发** environment in the app.

## Codebase guide

- `src/App.tsx` implements the request workbench and dialogs; reusable controls live in `src/components/`.
- `src/model.ts` owns request defaults, environment substitution, cURL parsing, and renderer workspace validation.
- `electron/http.cjs` executes requests, handles cancellation and timeouts, and limits request/response sizes.
- `electron/storage.cjs` validates and atomically saves workspace files.
- `electron/main.cjs` and `electron/preload.cjs` expose a small desktop IPC bridge.
- `shared/en.json` and `shared/i18n.mjs` contain translations shared by the renderer and desktop process.

Use the existing TypeScript and React conventions. Keep changes focused on a single problem and avoid unrelated refactors.

## Behavior to preserve

- Users must be able to reopen existing workspace files. If changing the schema, update both workspace validators and include a migration and regression test.
- A language change translates interface text while retaining user-defined names, request data, variables, and response content. Preserve numbered interpolation placeholders and add new English strings to the shared catalog.
- The renderer must not gain direct Node.js or unrestricted file-system access. Keep desktop operations behind the existing validated IPC bridge.
- Display API response data as content; do not execute HTML or scripts from an endpoint.
- Network failures, HTTP error responses, cancellation, and timeout conditions should remain distinguishable and useful to the user.

## Validate your work

```bash
npm test
npm run build
```

Add meaningful tests for changed behavior. For UI changes, manually check the affected workflow in the desktop app and both languages. For platform-specific changes, record the OS and architecture you tested and any unverified platform behavior.

The desktop build workflow runs tests and packages macOS and Windows. Successful compilation or packaging alone does not establish that the app works on that operating system.

## Submit a pull request

1. Fork the repository and create a branch for your change.
2. Implement the change with relevant tests or manual validation.
3. Update documentation if the user-facing behavior or development setup changes.
4. Open a pull request against `main` and explain the problem, resulting behavior, validation, and any limitations.

English is preferred for shared project documentation. Issues and discussions in Chinese are also welcome. By contributing, you agree that your contribution will be distributed under the project's MIT license.

## Packaging and releases

Use `npm run dist:dir` for a local unpacked app. Use `npm run dist:mac` on macOS or `npm run dist:win` on Windows for installers. Generated output belongs in `release/` and is not committed to Git.

Before publishing a version, confirm that `package.json` and the app's version label agree, run validation, review both platforms, and write release notes with known limitations. A `v*` tag triggers CI packaging. The current workflow uploads build artifacts but does not automatically create a GitHub Release. Maintainers publish release notes and selected installers separately.

Configure signing and notarization in the distribution environment; do not commit signing keys, certificates, or credentials.
