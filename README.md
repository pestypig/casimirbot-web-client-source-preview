# CasimirBot web-client source preview

This MIT-licensed source-only snapshot contains 1,295 selected TypeScript and TSX files from CasimirBot's web-client tree at private platform commit `2729878dee699a975cd8738d123baa0c341dc1ec`. The [exact inventory](SOURCE_SELECTION.json) records each file's SHA-256 and byte length and the 602 client files excluded by static import closure.

## What is here

- React components, pages, state, hooks, and shared client utilities for parts of the workstation and research UI.
- Selected tests and model or visualization code for inspection and reuse.
- Source references to the separate [public shared TypeScript preview](https://github.com/pestypig/casimirbot-shared-source-preview).

Some source describes research models, diagnostics, or proof status. A visual, schema, badge, or test fixture is not empirical confirmation or a physical-viability certificate. Check the underlying evidence and maturity gate before relying on a scientific claim.

## Build and integration status

This is **not a runnable web client, hosted site, or supported SDK**. The selected TypeScript/TSX files parse, and the static import selection removes files that directly or transitively need private modules or omitted assets. It does not include the full client, public media, styles, generated files, server, bundler setup, or all dependencies. No independent build or deployed behavior is promised by this snapshot.

Third-party packages and external map or scientific data are not bundled here. The source retains its OpenStreetMap contributor links where used; any separately obtained data and libraries keep their own terms. See [dependency and data notices](THIRD_PARTY_NOTICES.md).

## Source boundary and license

The selected source files match the committed platform source after CRLF/LF line-ending normalization; 3 of 1,295 public Git blobs are byte-identical to the source-commit Git blobs. The SHA-256 hashes and byte lengths in `SOURCE_SELECTION.json` identify the public snapshot files. This clean-history snapshot omits local profiles, captured sessions, imported media, the current in-progress worktree, and the platform's historical Git commits. It does not grant access to hosted services or private developer controls. The first-party content here is released under the [MIT License](LICENSE).
