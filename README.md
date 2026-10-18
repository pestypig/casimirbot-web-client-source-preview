# CasimirBot web-client source preview

This MIT-licensed, source-only snapshot contains **1,931 selected client code files** from CasimirBot's private platform source. The [initial inventory](SOURCE_SELECTION.json) identifies 1,295 TypeScript/TSX files at commit `2729878dee699a975cd8738d123baa0c341dc1ec`. The [combined addendum inventory](SOURCE_COMBINED_INDEPENDENT.json) identifies 625 more files from the same commit: 374 remaining or companion client files and 251 shared-dependent files. Two stage inventories, [374 files](SOURCE_ADDENDUM_INDEPENDENT.json) and [251 files](SOURCE_ADDENDUM_INDEPENDENT_251.json), record their hashes and byte lengths. A separate [11-file catalog inventory](SOURCE_ADDENDUM_CATALOGS.json) identifies the English source messages and ten translated locale files from that same private commit.

## What is here

- React components, pages, state, hooks, and shared client utilities for parts of the workstation and research UI.
- UI primitives under `client/src/components/ui/`, including shadcn/ui registry component source retained under its upstream MIT notice.
- Selected service-worker, voice, end-to-end test, and unit-conversion source in the addendum. The unit-conversion file cites WarpFactory's MIT-licensed `Units/` work; its attribution is retained in the notices.
- English UI messages and ten locale catalogs. Their source is available for review and reuse; translation coverage and quality vary, and this snapshot is not a promise of supported language completeness.
- Selected tests and model or visualization code for inspection and reuse.
- Source references to the separate [public shared TypeScript preview](https://github.com/pestypig/casimirbot-shared-source-preview).

Some source describes research models, diagnostics, or proof status. A visual, schema, badge, or test fixture is not empirical confirmation or a physical-viability certificate. Check the underlying evidence and maturity gate before relying on a scientific claim.

## Build and integration status

This is **not a runnable web client, hosted site, service worker, voice bridge, end-to-end test suite, or supported SDK**. The initial 1,295-file selection was screened for static import closure; that claim does not extend to the later addenda. The combined source still refers to omitted modules, styles, media, fixtures, build inputs, server code, and external packages. No independent build or deployed behavior is promised by this snapshot.

Third-party library packages and external map or scientific data are not bundled here. Included UI component source comes from the MIT-licensed shadcn/ui registry, and the addendum's unit-conversion source cites MIT-licensed WarpFactory work. Their copyright and permission notices are retained in [dependency and data notices](THIRD_PARTY_NOTICES.md). The source retains its OpenStreetMap contributor links where used; any separately obtained data and libraries keep their own terms.

## Source boundary and license

The initial selection matches its committed platform source after CRLF/LF line-ending normalization; three of its 1,295 public Git blobs are byte-identical to the source-commit blobs. The 625 code addendum and eleven catalog Git blobs are byte-identical to their pinned private source commit. The inventories identify the exact published bytes. This clean-history preview omits local profiles, captured sessions, imported media, the current in-progress worktree, and the platform's historical Git commits. It does not grant access to hosted services or private developer controls. CasimirBot's selected first-party source, English catalog prose, and translations are released under the [MIT License](LICENSE); included upstream material retains the separate notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
