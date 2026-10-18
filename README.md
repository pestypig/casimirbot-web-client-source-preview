# PRIVATE DRAFT — combined 625-file web-client source addendum

This local, unpushed candidate adds 625 exact committed source files above Public web-client commit `739e33a0aaec948264b81300e494dbec9d9f62d9`: 374 remaining and companion client files, followed by 251 shared-dependent client files without the 11 held English and translation catalogs. The [combined inventory](SOURCE_COMBINED_INDEPENDENT.json) and the two stage inventories pin every raw Git blob from the private platform source commit.

The original 1,295-file Public selection retains its MIT license and upstream shadcn/ui notice below. **This private draft makes no license grant or public-release claim for the added 625 files.** Exact-file owner rights, copied-content and dependency review, final notices, and approval of this exact publication stack remain open. The source-only snapshot omits catalog text, other modules, styles, media, fixtures, and build inputs; it does not claim static import closure or a runnable workstation, website, service worker, voice bridge, or E2E suite.

---

# CasimirBot web-client source preview

This MIT-licensed source-only snapshot contains 1,295 selected TypeScript and TSX files from CasimirBot's web-client tree at private platform commit `2729878dee699a975cd8738d123baa0c341dc1ec`. The [exact inventory](SOURCE_SELECTION.json) records each file's SHA-256 and byte length and the 602 client files excluded by static import closure.

## What is here

- React components, pages, state, hooks, and shared client utilities for parts of the workstation and research UI.
- UI primitives under `client/src/components/ui/`, including shadcn/ui registry component source retained under its upstream MIT notice.
- Selected tests and model or visualization code for inspection and reuse.
- Source references to the separate [public shared TypeScript preview](https://github.com/pestypig/casimirbot-shared-source-preview).

Some source describes research models, diagnostics, or proof status. A visual, schema, badge, or test fixture is not empirical confirmation or a physical-viability certificate. Check the underlying evidence and maturity gate before relying on a scientific claim.

## Build and integration status

This is **not a runnable web client, hosted site, or supported SDK**. The selected TypeScript/TSX files parse, and the static import selection removes files that directly or transitively need private modules or omitted assets. It does not include the full client, public media, styles, generated build outputs, server, bundler setup, or all dependencies. No independent build or deployed behavior is promised by this snapshot.

Third-party library packages and external map or scientific data are not bundled here. Some included UI component source comes from the MIT-licensed shadcn/ui registry; its copyright and permission notice are retained in [dependency and data notices](THIRD_PARTY_NOTICES.md). The source retains its OpenStreetMap contributor links where used; any separately obtained data and libraries keep their own terms.

## Source boundary and license

The selected source files match the committed platform source after CRLF/LF line-ending normalization; 3 of 1,295 public Git blobs are byte-identical to the source-commit Git blobs. The SHA-256 hashes and byte lengths in `SOURCE_SELECTION.json` identify the public snapshot files. This clean-history snapshot omits local profiles, captured sessions, imported media, the current in-progress worktree, and the platform's historical Git commits. It does not grant access to hosted services or private developer controls. CasimirBot's first-party content here is released under the [MIT License](LICENSE); included upstream UI component source retains the separate MIT notice in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
