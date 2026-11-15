## Consolidated .83 source checkpoint

The [frozen selected-source inventory](SOURCE_FREEZE_DESKTOP_ALPHA83.json) pins 2151 selected paths to canonical commit `7e5414c4b2eaac794f8cb0a46bfa53570631c68a`, with exact export hashes and any declared transformations or exceptions. The generated documentation catalog is explicitly held at its older reviewed public bytes; it is not the catalog in the .83 desktop. Earlier candidate notes below are historical preparation evidence. Existing omitted-dependency and license notices remain in force. This source-only checkpoint does not establish signed-desktop, website, scientific or live-game acceptance.

> A [post-R384 Friends connection recovery follow-up](SOURCE_ADDENDUM_FRIENDS_RECOVERY_CANDIDATE.json) is included in this unpublished proposal. It has local tests; replacement-package acceptance is pending.

> A [post-R384 callback reporting follow-up](SOURCE_ADDENDUM_ROOM_CALLBACK_DETAIL_CANDIDATE.json) is included in this unpublished source proposal. It has local test evidence but is not installed in R384.

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

## Unpublished guides and room-entry proposal

The local [candidate inventory](SOURCE_ADDENDUM_GUIDES_ROOM_CANDIDATE.json) records three revised files and three new source/test files based on canonical 2113d0e7547b018220da38d6adc4f36b5718fcd4 plus exact working-tree hashes. It adds Friends and Minecraft pilot guides, source links and minimal hosted-room presence/withdrawal controls. The source is not frozen or published. Account setup pages, shared contracts, styles and screenshot media remain separate inputs; no mod binaries are included.

The guides distinguish clean-server startup from attended Minecraft/GPT Live acceptance and leave public mod downloads pending. A room link alone does not enter the room. Synthetic tests do not establish real membership, invitation delivery, game action or signed-client availability. Other client deltas are still held for review; this addition does not qualify the entire client.

## Unpublished Friends stream controls proposal

The local [stream candidate inventory](SOURCE_ADDENDUM_STREAMS_CANDIDATE.json) adds nine reviewed implementation and synthetic-test files for explicit source/audience sharing, passive following into a selected destination, account-scoped navigation and Friends authorization recovery. It records exact working-tree hashes on canonical 2113d0e7547b018220da38d6adc4f36b5718fcd4. It is not frozen or published. The parent Friends panel, shared contracts and account/binding helpers remain separate inputs. Tests with mocked services do not establish installed delivery, room revocation, OAuth authorization or model funding.

## Unpublished Friend Chat and room-entry proposal

The local [Friend Chat inventory](SOURCE_ADDENDUM_FRIEND_BOARD_CANDIDATE.json) records ten implementation/test files on canonical 2113d0e7547b018220da38d6adc4f36b5718fcd4 plus exact working-tree hashes. It adds persistent conversation UI, pinned qualitative glyph stickers, an isolated recipient workspace and explicit entry to existing hosted-room mission controls. This is a private proposal, not a release or standalone application. Account, shared renderer, voice, room-review and glyph-transport dependencies remain separate inputs. Mock checks cannot establish consent, a game result or installed/public availability.

## Unpublished presence and voice cancellation proposal

The [presence and voice inventory](SOURCE_ADDENDUM_PRESENCE_VOICE_CANDIDATE.json) adds six reviewed files on canonical 2113d0e7547b018220da38d6adc4f36b5718fcd4 plus exact working-tree hashes. Presence is owned by the signed-in workstation. Voice startup drops closed attempts and releases late microphone tracks; pending restarts are invalidated on Stop, unmount or party/member changes. Two runtime fixes are newer than private R378. Mock tests do not establish real microphone, audio, Discord, GPT Live or signed-client acceptance. The shell and transport dependencies remain separate inputs.

## Unpublished workstation Friends wiring proposal

The [workstation inventory](SOURCE_ADDENDUM_WORKSTATION_FRIENDS_CANDIDATE.json) records three changed files: workstation-lifetime presence/publisher wiring and finite signed-out policy fallback with tests. Four inspected binding/navigation source/test dependencies already match this public baseline. Source remains unfrozen and unpublished. Cached pairing state does not authorize a connection; the server must validate current exact-chat access. Mock and source-text tests are not installed or public-release acceptance.

## Unpublished independent glyph-copy proposal

The [glyph copy inventory](SOURCE_ADDENDUM_GLYPH_COPY_CANDIDATE.json) records ten implementation/test files with exact working-tree hashes. It supersedes the earlier FriendArtifactWorkspace row: v3 rendering now uses the received copy’s own store for interpretation state and sampled layers. Four UI files are newer than R378. Existing callers retain the main workspace by default. Scientific contracts/operators and other dependencies remain separate; this source-only proposal and mock tests establish no empirical validity, installed tool access or public release.

## Unpublished artifact context targeting

The [artifact context inventory](SOURCE_ADDENDUM_ARTIFACT_CONTEXT_CANDIDATE.json) records four source/test files for explicit context delivery to the selected chat and cancellation when the selected account, chat or artifact copy changes. It supersedes overlapping earlier glyph rows. This controls UI targeting, not pairing authority, evidence validity or automatic task execution. Mock tests do not establish installed delivery.

## Unpublished account-scoped chat storage

The [chat store inventory](SOURCE_ADDENDUM_CHAT_STORE_CANDIDATE.json) records six source/test files for account-separated chat and registry persistence, bounded saved representations and duplicate-message suppression. Unknown identity, signed-out guest and named accounts have separate keys; legacy shared data is not automatically claimed. Cached bindings and terminal metadata are projections, not current authorization or independently verified evidence.

## Unpublished account-scoped workstation stores

The [workstation stores inventory](SOURCE_ADDENDUM_WORKSTATION_STORES_CANDIDATE.json) records nine source/test files for account-separated notes, clipboard receipts, session drafts, scroll state and workflow history. The proposal uses canonical 2113d0e7547b018220da38d6adc4f36b5718fcd4 plus the exact working-tree hashes in each inventory. It preserves legacy shared records without automatically migrating them. Notes have an in-memory fallback and clipboard persistence is bounded under quota pressure. Registry metadata and local events do not grant context or program access.

All three proposals remain unfrozen and unpublished. Shared contracts, event helpers, layout stores and external dependencies remain separate inputs. Focused local tests do not qualify cross-device backup, live voice, game actions, installed account switching or public release availability.

## Unpublished account-recovery controls

The [account-recovery inventory](SOURCE_ADDENDUM_ACCOUNT_RECOVERY_CANDIDATE.json) records six implementation/test files for bounded Auth0 link recovery, browser sign-in feedback and installation website-connection controls. Account linking remains separate from exact-task pairing and funded model use. Review also repaired stale private-text and connection-status callbacks after account changes or panel closure; those two files are newer than R379. No submitted provider request is canceled or automatically retried. Source remains unfrozen and unpublished; mocked checks do not establish installed OAuth, funding settlement or public availability. Native bridge and shared-schema dependencies remain separate.

## Unpublished exact-task recovery controls

The [pairing-recovery inventory](SOURCE_ADDENDUM_PAIRING_RECOVERY_CANDIDATE.json) records five changed implementation/test files and one unchanged transport test. It distinguishes accepted pairing, task registration, runtime binding and optional local clock-tool inspection; preserves exact reviewed requests through uncertainty; and keeps replacement, cancellation and revocation explicit. No invitation secrets or live account state are included. Source remains unfrozen and unpublished. Shared contracts, native services, storage helpers and synthetic fixtures remain separate dependencies; mock tests do not establish installed pairing or program authority.

## Unpublished owner stream activity

The [stream-activity inventory](SOURCE_ADDENDUM_STREAM_ACTIVITY_CANDIDATE.json) records five implementation/test files for background collection of explicitly granted Codex streams and attributed session activity. Hiding the Float does not stop an approved stream. Native grants and shared schemas remain separate dependencies; projected adapter choices are not performed actions or evidence of a live worker. The tests mock native boundaries and do not establish installed or Discord delivery. This source proposal remains unfrozen and unpublished.

## Unpublished hosted-room mission controls

The [room-mission inventory](SOURCE_ADDENDUM_ROOM_MISSION_CANDIDATE.json) records seven implementation/test files for explicit owner task selection, private report review, exact report sharing and member readback. Reports remain untrusted observations, not action grants or proof of game effects. Sending a shared broker report to GPT Live is a separate owner action with distinct delivery status. This proposal also contains a post-R379 timeout fix that requires installed validation. Shared contracts, server/native authorization and other UI dependencies remain separate. The source remains unfrozen and unpublished.

## Unpublished reviewed instruction handoff

The [room-instruction inventory](SOURCE_ADDENDUM_ROOM_INSTRUCTION_CANDIDATE.json) records three changed source/test files and the unchanged volatile preview store. Browser speech transfer and native task queueing each require explicit review. Same-world metadata and expected block outcomes grant no command authority. This proposal fixes silent late-response recovery in both instruction controls; installed validation is pending. Shared schemas and native/server consent and dispatch remain separate dependencies. Source remains unfrozen and unpublished.

## Unpublished hosted room connection recovery

The [room-connection inventory](SOURCE_ADDENDUM_ROOM_CONNECTION_CANDIDATE.json) records two implementation/test files for purpose-scoped authorization, saved-grant recovery, exact room selection and separate text/task/Discord controls. It includes a post-R379 request-deadline fix; installed validation remains pending. Source/context callback scope during room changes remains a follow-up concern. Shared/native authorization and the voice bridge remain separate dependencies, and mocked tests do not establish live voice or Minecraft continuity. The source remains unfrozen and unpublished.

## Unpublished room source scope recovery

The room connection follow-up now ignores source callbacks from a previous room or GPT Live session and closes a bridge when its session changes. This replaces the earlier callback concern at source-test level; native lease cleanup and attended context continuity remain unqualified. R379 does not include this fix.

## Unpublished hosted room text coordination

Three reviewed conversation/owner/test files preserve human-only room messaging, account-scoped drafts and explicit Console handoff. The unchanged in-memory draft store is reviewed as a dependency. Native membership, send delivery and deduplication remain separate qualification. Source-only, unfrozen and unpublished.

## Unpublished room capacity and navigation

Five reviewed panels and three changed tests distinguish two-person GPT Live, developer three-person consent evaluation, and text-only rooms. The unchanged runtime presentation test and draft store remain reviewed dependencies. Group voice is unavailable; member text, private chats and mission review keep separate controls. Controller/server/media behavior remains independently qualified. Source-only, unfrozen and unpublished.

## Unpublished room source setup and account isolation

Two reviewed source/test files expose explicit room source setup and command review, with account/room-scoped request isolation. The lifecycle fix is newer than private R379 and awaits installed validation. Player embodiment, local Minecraft lifecycle, shared contracts and server authority are separate dependencies. Source-only, unfrozen and unpublished.

## Unpublished local Minecraft startup isolation

Two reviewed lifecycle source/test files keep explicit saved-Minecraft startup within the current account and panel request. Startup receipts remain separate from game observation and action permission. The fix is newer than private R379 and awaits installed validation; native launch admission and shared schemas are separate dependencies. Source-only, unfrozen and unpublished.

## Unpublished player activation isolation

Two reviewed player-panel source/test files scope setup and explicit activation to the selected account, chat, room, world and player. The unchanged journey helper retains separate permission, pickup and readiness stages. The isolation fix is newer than private R379; native authority, installed play and GPT Live continuity remain separate qualification. Source-only, unfrozen and unpublished.

## Unpublished owner result panel review

One reviewed panel delta recognizes the ordinary account-policy rejection. The unchanged API helper and tests retain explicit report-sharing consent, stable retry identity and the separate shared-result projection. Provider funding, server authorization and installed behavior require their own qualification. Source-only, unfrozen and unpublished.

## Unpublished hosted interpreter status review

One reviewed type-only panel delta admits the three-person voice capacity label. Shared AI remains inactive until separately admitted; owner key selection, text evaluation, provider costs and participant consent retain their separate controls. The unchanged six-test suite is mocked and does not qualify live voice. Source-only, unfrozen and unpublished.

## Unpublished Discord bridge review

Reviewed browser bridge and isolated PCM helper source with exact-session ticket compatibility and owner-stop startup cancellation tests. This private proposal includes a cancellation fix newer than running R380. It provides no model, consent, funded transcription or game-action authority, and does not qualify live Discord audio. Full transport and server dependencies remain separate. Unfrozen, source-only and unpublished.

## Unpublished room media review

Reviewed two-person room media source, unsupported group-voice handling, and microphone startup cancellation tests. A microphone returned after stop or consent withdrawal is released without opening a peer connection. The cancellation fix is newer than running R380. Mocked tests do not qualify live voice, provider mixing, game context or any paid service. Separate shared contracts and runtime helpers remain required. Unfrozen, source-only and unpublished.

## Unpublished room controls review

Reviewed room profiles, explicit pending group-voice labels, API transport and exact-room review navigation. A bounded one-shot navigation hint opens only the requested room review and supplies no membership, model, audio or game-action grant. Mocked tests cover cancellation, failed reads, queue expiry and request serialization; they do not qualify live room delivery or group media. Shared server contracts and runtime dependencies remain separate. Unfrozen, source-only and unpublished.

## Unpublished device and update review

Reviewed Device Check, Desktop Updates, personal-setup status and native bridge declarations. Account-profile changes clear local UI state, while same-profile policy refreshes preserve it. Native folder selection, exact-task enrollment, provider funding, game grants and signed installer verification retain their own authority. The renderer isolation fix is newer than R380. Tests use synthetic native/HTTP fixtures; this source-only proposal does not qualify installed updates or live game integration. Unfrozen and unpublished.

## Unpublished website entry review

Device connection keeps text and voice installation permission independent and opt-in. Download guidance links to setup tutorials and supported source repositories. Permission does not start paid inference, audio, room participation or game actions. Synthetic UI tests only; live authentication, deployment and signed release acceptance remain separate. Agent Access and account-portal additions remain held for their own dependency review. Unfrozen and unpublished.

## Unpublished setup helper review

Selected client setup helpers and synthetic tests preserve distinct pairing, room, source selection, game-readiness and spending facts. Shared contracts and their projections remain omitted dependencies. A malformed Discord selection expiry is rejected before saving resume state; this fix is newer than R380. The setup inbox and its action UI remain held. Tests make no live grants, publish no chat text and run no game or provider operation. Unfrozen and unpublished.

## Unpublished setup control review

Selected owner setup dialog and Companion control source preserve exact-scope review, separate authority checks, explicit task actions and an independent Stop control. Late preparation messages cannot replace a confirmed Stop. This renderer fix is newer than R380. Shared projections, inbox orchestration and native/domain enforcement remain separate dependencies. Tests use synthetic fixtures and mocked HTTP; they do not qualify live game operation, installed permissions or public paid features. Unfrozen and unpublished.

## Unpublished setup inbox review

The reviewed inbox and Agent Access entry display exact setup targets, current owner observations, finite scope and independent approval steps. Private pairing recovery reconciles uncertain replies; Discord selection does not itself publish text. Tests use synthetic identities and mocked services. Shared setup contracts, server/native authority and newer AgentConnectionSetup changes remain separate omitted or held inputs. This source preview is not a runnable product or proof of live grants, game operation, paid inference or signed-update acceptance. Unfrozen and unpublished.

## Unpublished connection setup review

Connection setup distinguishes personal local Codex approvals from the private developer tunnel and preserves explicit pairing revocation. Recovery guidance waits for route inspection before choosing its destination. Deterministic tests use mocked services; shared/native dependencies and installed acceptance remain separate. This candidate is unfrozen and unpublished.

## Unpublished account room and security review

Reviewed account components display saved Discord setup, hosted-room navigation and read-only Minecraft player-sharing requests. The private authenticator UI keeps confirmation and recovery-code acknowledgment explicit. These tests use mocked services; backend authentication, live room/game activity and installed acceptance remain separate. The account portal and billing changes are still held. Unfrozen and unpublished.

## Unpublished capped membership review

These private sandbox components show ledger-backed limits, explicit cap review, processor management and separately reviewed test probes. Form consent and receipts are isolated by paid period; uncertain responses are not claims of an unchanged cap. Mocked tests do not qualify live billing, provider funding, tax, paid voice or legal terms. The authored support contact remains part of the final owner publication review. Account portal integration and installed acceptance are still held. Unfrozen and unpublished.

## Unpublished account portal review

The account portal integrates the reviewed room, private authenticator and sandbox billing controls, with GCN source credentials kept separate from managed funding. Delayed independent cap reads cannot restore controls after an account reload or sign-out. Tests mock services and do not qualify live identity, payment, source listening, paid inference or installed behavior. Shared/server dependencies remain separate. Unfrozen and unpublished.

## Unpublished personal device controls review

Personal computer and Codex approvals remain separate from private USB developer access. Delayed setup responses cannot replace a newer account session status or start completion polling after the panel closes. Native actions are mocked in tests; installed approval and public release remain unqualified. Unfrozen and unpublished.

## Unpublished installed account panel review

The installed account panel separates shared identity from local profile setup and launch visibility from authority. Account refresh ignores superseded reads; confirmed sign-out clears the prior account even if the next status read fails. Catalog counts match current source keys. Mocked source checks do not qualify native approval, paid services or installed behavior. Unfrozen and unpublished.

## Unpublished installed services review

Installed services keep personal keys, broker enrollment, sandbox billing, device security and task authority separate. Profile replacement clears old projections; delayed MFA callbacks cannot open or cancel requests after their original panel context ends. Agent Access adds setup and health entry points. Mocked tests and selected compilation are not installed or public-release acceptance. Unfrozen and unpublished.

## Unpublished connection controls review

Personal keys, read-only connection health and explicit Captain Keyes task controls keep their distinct approvals and limits. Health checks do not pair, renew grants or start work; notification history is hashed and never grants authority. Delayed task authorization cannot open the native browser after its account context ends. Native/provider/installed acceptance remains separate. Unfrozen and unpublished.

## Unpublished launch controls review

Launch visibility, panel access and server operation authority remain separate. Explicit locks apply in both picker and panel host; experimental visibility grants no operation access. Account cache invalidates late observations across profile changes. This is an unfrozen source proposal; full application and installed acceptance remain open.

## Unpublished notes and profile storage review

Profile-scoped notes, calculator state and backup filtering keep shared legacy data unassigned. A queued notes save cannot read a replacement note or account editor. Explicit browser detachment stops backup retries and survives reopening until reattachment; existing server backups are retained. Source checks are not installed or hosted storage acceptance. Unfrozen and unpublished.

## Unpublished app entry and shell review

The app adds its getting-started route and integrates account-aware mobile launching, settled job receipts, read-only connection health and bounded saved personal connection recovery. Home retains explicit import and inspection controls. These source checks do not establish installed/native recovery or full job execution. Unfrozen and unpublished.

## Unpublished job account attribution review

Pending workstation jobs and clipboard completions retain their initiating account identity and revision. Account switches prevent later note/Ask work and late shell receipts; clipboard writes already issued are not reversed. This is a client attribution guard, with installed and server authority qualification still separate. Unfrozen and unpublished.

## Unpublished glyph workbench review

The typed glyph adapter, workspace controls, explicit chat connection, sticker preparation and opt-in preview calculations are under review. Calculation admission rechecks synchronized account identity. This is artifact/presentation validation, not scientific certification. A broader theory-context adapter test remains a release hold. Unfrozen and unpublished.

## Unpublished reflection contract test alignment

The adapter regression now distinguishes likely symbol/payload matches from exact badge identity, following the existing shared reflection contract. An explicit-ID case also checks the inverse classification and passive evidence status. Production matching and scientific authority are unchanged; prior failure receipts are retained. Unfrozen and unpublished.

## Unpublished guide account isolation review

Guide launch/search entries follow the account policy and visibility settings. The Friends summary refreshes across equal-policy account switches and discards late results from an earlier account session. Mocked source checks do not establish installed or real multi-account acceptance. Unfrozen and unpublished.

## Unpublished typed navigation admission review

The path bar checks the current account policy for every destination before opening panels, changing documents or focusing a group. A route with a locked destination is rejected together; authorized experimental panels still work by exact path. Client admission is not server authority. Unfrozen and unpublished.

## Unpublished document and storage review

Document export uses the signed-out policy fallback. Storage inventory polling follows its interval, retires replaced requests and clears old server inventory on account changes. Solar storage labels distinguish byte inventory from source-hash verification. Source checks do not establish a real PDF export or installed scientific acceptance. Unfrozen and unpublished.

## Unpublished solar account access review

Signed-in owners can explicitly retain and inspect their own solar research artifacts. Local repository inspection stays separately gated and explicit feature locks take precedence. Named HEK references remain unverified navigation. Retention, replay integrity and UI checks do not establish scientific admission or a provider download. Unfrozen and unpublished.

## Unpublished sampled solar playback review

Sampled playback preserves separate source clocks, bounded buffering and explicit owner retention. Account changes retire playback state; reopened sources must match the selected owner, checkpoint and source identities. Display palettes and observer poses are not physical registration evidence. Globe, daily-movie dependencies and installed acceptance remain held. Unfrozen and unpublished.

## Unpublished solar daily-movie review

Daily playback keeps separate AIA, HMI and PFSS clocks and source receipts. Canceled requests cannot replace the next day’s model status. Browse imagery and approximate display registration do not establish calibrated data or physical reconstruction. Actual video/WebGL and installed acceptance remain unqualified. Unfrozen and unpublished.

## Unpublished solar globe and ROB browser review

Globe views distinguish source imagery, modeled fields and approximate registration. ROB retained reopening matches the selected owner and source record; account/date changes retire requests while unrelated globe controls preserve them. Exact display receipts remain separate from verified rendered pixels or scientific admission. Native/WebGL and provider acceptance remain open. Unfrozen and unpublished.

## Unpublished solar budget controls review

Solar explanation controls retain explicit platform-owner limits and consent. Account changes retire local drafts, credentials and pending responses; budget creation and native worker review remain separate actions. Browser and mocked API checks do not establish live spending, worker startup or installed acceptance. Unfrozen and unpublished.

## Unpublished GCN account connection review

GCN account configuration keeps public browsing, saved personal credentials and finite private source access separate from reasoning and Discord delivery. Profile changes retire pending writes and clear review state. Private activation and Stop require matching lease receipts; provider listening is a separate observation. Public managed enrollment remains unavailable. Unfrozen and unpublished.

## Unpublished solar and neutrino catalog review

Daily HEK reports, DONKI patrol artifacts, IceCube contexts and platform comparisons retain separate source clocks and scientific limits. Catalog payloads and selected windows are checked before display; citation and embedded-media navigation exclude executable URLs and unadmitted movie endpoints. Tests use mocked HTTP and synthetic inputs. Real media, providers, physical interpretation and installed acceptance remain separate. Unfrozen and unpublished.

## Unpublished Star Watcher integration review

Star Watcher integrates the reviewed catalog, source, budget and playback controls. Retained observations require an exact owner, receipt and verified display archive; delayed results cannot replace a changed account or selection. Original acquisition times and provider/registration limits remain visible. Mocked browser tests and source compilation do not establish installed, scientific or live-provider acceptance. Unfrozen and unpublished.

## Unpublished timeline module review

Spore Timeline uses version-pinned ESM endpoints for optional PNG export and local image/audio metadata. The three module APIs passed synthetic browser checks; remote library code and user files are not included in this source preview. Complete timeline, installed CSP and future CDN behavior remain separate. Unfrozen and unpublished.

## Unpublished Image Lens access review

Image Lens keeps ordinary inspection available and shows its optional texture workspace only with an unlocked feature grant. Losing that access returns the panel to Inspect. Mocked account, crop and page-navigation checks do not establish installed provider or source authority. Unfrozen and unpublished.

## Unpublished geospatial credential review

Maps browser-key choices are account-scoped, and legacy origin keys are not automatically enrolled. Retired reads and saves cannot populate the next account view. Process-wide Routes credentials keep their explicit operator boundary. Mocked storage/settings tests establish client behavior; native custody, Google access and installed map behavior remain separate. Unfrozen and unpublished.

## Unpublished diplomacy and economic history review

The diplomacy overlay adds dated move records and scoped economic history with explicit coverage and interpretation limits. Receipts must match the active query. An explicitly requested wage scenario checks submitted-input and receipt content hashes; this does not authenticate sources, validate causal assumptions or recommend national policy. Tests use local fixtures and mocked HTTP. Pilot scope, unfrozen and unpublished.

## Unpublished chat stream activity review

Approved streams can collect exact-granted chat activity with the Float hidden. Replacing a grant retires old frames and pending reads; returned task and source identities must match. Stream activity does not itself request work. Mocked source checks are separate from installed streaming and program-effect verification. Unfrozen and unpublished.

## Unpublished Console activity and connection controls

Console activity distinguishes model observation summaries, decisions and native result receipts, and continues checking delayed task reports while open. Personal provider connections use the account feature policy independently of the developer-only inspector. Transcription and screen audio have distinct labels. Source tests use mocked transports; installed Live, provider and game-effect acceptance remain separate. Unfrozen and unpublished.

## Unpublished Live controls and cancellation review

Live controls separate local playback mute, microphone/visual consent, account room opt-in and program grants. Pending starts are retired by Stop or closing the control; late microphone acquisition is cleaned up. Account changes retire old Rooms responses. Tests use synthetic HTTP/media and do not establish live Discord or Minecraft acceptance. These changes are unfrozen and unpublished.

## Unpublished Realtime dispatch review

Realtime client dispatch preserves server admission and backend routing for room Minecraft command candidates. Added rejection tests use synthetic replies; they do not establish action authority or a verified game result. Provider item/event correlation remains distinct. Source is unfrozen and unpublished; full server, installed and attended checks remain required.

## Unpublished Console submission review

Both submission paths retain an explicitly admitted Live handoff for backend validation, including conceptual speech, without assigning game authority. Personal connections retain feature admission and separate developer inspection. Test fixtures follow current channel layout, helper ownership and receipt requirements. This source proposal is unpublished; full installed and server acceptance remains open.

## Unpublished Console workspace review

Managed text, personal Discord source controls and Party Chat retain their separate destinations and approvals. Account transitions retire workspace drafts and asynchronous stream continuations; a same-account refresh preserves them. This source proposal is unpublished. Native funding, installed stream delivery and full application acceptance remain separate.

## Unpublished command and context review

Command discovery respects account restrictions. Explicitly connected Physics Glyph context follows both Ask transports, with isolation and profile checks; it grants no actions. Discord account wording distinguishes active command sessions from remembered website linking. This source proposal remains unpublished and separate from installed acceptance.

## Unpublished local music review

Noise Gen opens a native local-music workspace with an explicit legacy-library switch. Account changes retire pending UI work; recipes follow the current runtime and model references. Native consent, grants, model installations and hardware qualification are separate. This source proposal is unpublished and does not bundle model weights.

## Unpublished room coordination review

Speaker identity linking, exact-task transcript offers and read-only Minecraft player-sharing requests keep their separate reviews and consents. Account and room changes retire pending UI work and private codes. This source proposal is unpublished; native/service and attended game acceptance remain separate.

## Unpublished private controls review

Private managed Discord voice retains exact contract, consent, funding and lease requirements; retired UI work cannot start a call. Connector guidance, local checksum inspection and fixed-review native import remain separate. Import keeps code stopped and grants no runtime access. This source proposal is unpublished and does not establish public availability of these private controls.

## Unpublished runtime resource disposition

The conversation workspace stylesheet is included unchanged. This source-only preview intentionally omits `client/src/lib/webgpu/hull-pathtracer.wgsl` and `client/src/data/needle_Ipeak_worksheet.csv`; their content and rights are outside the reviewed export. `client/src/lib/docs/docMetadata.generated.ts` retains the older public metadata while new document paths await review and source freeze. These omissions prevent full application parity. They do not change the private app inputs or establish installed qualification. See `SOURCE_ADDENDUM_FINAL_RESOURCES_CANDIDATE.json` for exact source identities and holds. Unfrozen and unpublished.

## Unpublished pending-answer recovery repair

Timeout and transport failures while reconnecting a pending answer now report against the saved trace without referencing an unrelated new-turn attempt. Partial output remains suppressed. Two reproduced callback failures are fixed; cancellation and missing-job checks plus the existing console suite pass. Installed recovery and the remaining type diagnostics are still open. Unfrozen and unpublished.

## Unpublished setup scope type repair

Setup source reviews and transcript offers now preserve their narrowed contract types across lookups and callbacks. Existing room, approval, expiry and exact-task checks remain unchanged. The submission route type comes from its defining module. These source changes do not establish installed qualification or grant new authority. Unfrozen and unpublished.

## Unpublished interface catalog type repair

Interface catalog types now use the existing shared language-code union and bind the source-derived message IDs locally. The existing mobile-start surface is represented in its metadata type. Message text, catalog counts and loading behavior are unchanged; partial-catalog and installed qualification limits remain. Unfrozen and unpublished.

## Unpublished account and task review repair

The task review now displays the exact single IceCube alert operation and its source/artifact limits. Account recovery uses the existing phase and native API contracts with explicit narrowing. Inspection remains passive; installed sign-in, pairing and task execution are separate qualification. Unfrozen and unpublished.

## Unpublished confirmed voice status repair

Confirmed transcripts offered to the selected chat now return to Listening; an unavailable destination shows its error without forwarding to another chat. Voice playback and diagnostic types use their existing contracts. Mocked source tests are separate from native delivery and attended GPT Live qualification. Unfrozen and unpublished.

## Unpublished workspace event type repair

Workspace graph event checks now narrow to their existing event families. Transcript debug rows retain their heterogeneous event collection, playback metrics use the existing type, and Friends tests use supported exact name queries. Deterministic checks remain separate from native delivery and installed release acceptance. Unfrozen and unpublished.

## Unpublished Google SDK coexistence repair

Google sign-in and Maps now have independent optional browser namespaces. The map tolerates sign-in being loaded before Maps; sign-in retains an existing Maps namespace. Mounted regressions use mocks and no provider access. Live Maps, sign-in and installed acceptance remain separate. Unfrozen and unpublished.

## Unpublished console diagnostics type alignment

Console diagnostics use the existing stream counter type and preserve nullable question and reply time values. Runtime behavior is unchanged; legacy source-position metadata is refreshed. Remaining compiler diagnostics and installed qualification are separate. Unfrozen and unpublished.

## Unpublished standalone room session repair

The standalone Rooms dialog passes the current GPT Live session state to its native room panel. Opening it does not connect audio, select game context or approve consent; existing explicit controls and authorization remain required. Mounted regression tests use synthetic service responses. Installed and attended acceptance remain separate. Unfrozen and unpublished.

## Unpublished room audio shutdown repair

Closed room playback ignores pending play outcomes. Mixer resume and its bridge owner recheck closure before publishing readiness or starting provider replacement. Deferred synthetic tests cover shutdown and the admitted positive path. In-flight provider replacement/restore ordering and installed audio acceptance remain separate open checks. Unfrozen and unpublished.

## Unpublished provider input ordering repair

Provider input changes are ordered within the current GPT Live transport. Room and Discord cleanup restore only their own input and stop owned audio before waiting. Late operations cannot overwrite a restarted transport, and original microphone mute state is preserved. Synthetic ordering and bridge tests are separate from installed and attended audio acceptance. Unfrozen and unpublished.

## Unpublished visual capture ownership review

Visual capture retains a non-null active stream and exact registered source independently of failure cleanup. Mounted-hook and existing source-control tests cover local capture and shutdown behavior. Real browser capture and installed game context continuity remain separate. Unfrozen and unpublished.

## Unpublished translation registry type review

Document translation metadata types now reflect unknown input validation and the existing session control key. Missing metadata preserves current projections. Existing explicit document language overrides remain supported; non-document locale checks remain separate. Local tests do not establish installed translation or provider behavior. Unfrozen and unpublished.

## Unpublished document translation status repair

Document rendering and visible-context metadata normalize projection/freshness statuses. Local missing selections are not reported as existing projection receipts. Source references and non-answer authority remain separate. Deterministic pipeline checks do not establish installed translation or provider behavior. Unfrozen and unpublished.

## Unpublished final-answer diagnostics boundary

Optional final-answer diagnostics are guarded without relaxing canonical terminal or prompt-projection checks. The reply diagnostics use their existing contract. Deterministic classifier and console checks do not establish installed or provider acceptance. Unfrozen and unpublished.

## Unpublished rendered reply diagnostics repair

Rendered reply diagnostics tolerate an absent backend turn ID while keeping local identity separate and existing backend-scope checks. Copy input types reflect existing coercion. DOM and source tests do not establish installed clipboard or backend delivery. Unfrozen and unpublished.

## Unpublished explicit chat context transport repair

The legacy Ask wrapper preserves the workspace context explicitly supplied by its caller through the existing request paths. Omitted context remains omitted, and context grants no action authority. Mocked transport tests do not establish live import or GPT Live game continuity. Unfrozen and unpublished.

## Unpublished pending response presentation repair

Manual response presentation reads the response-level pending metadata and respects existing cancellation and resolved-request checks. Classification does not resume or execute a request. Source tests do not establish installed clarification behavior. Unfrozen and unpublished.

## Unpublished reply diagnostics declaration repair

Reply diagnostics declare their existing optional raw metadata and action-summary fields. Existing validators and authority checks are unchanged. Runtime emission parity and local checks do not establish installed or physics acceptance. Unfrozen and unpublished.

## Unpublished room and sticker test contract repair

Room identity and source-binding fixtures now match existing contracts; the sticker scenario test narrows its legacy schema explicitly. Production behavior is unchanged. Synthetic tests do not establish installed or physical acceptance. Unfrozen and unpublished.

## Unpublished room floor renewal lifecycle repair

Automatic room floor renewal ignores replies from retired room/transport lifetimes and prevents overlapping requests within one lifetime. Existing server authority is unchanged; local cleanup does not cancel an already-dispatched request. Installed voice and Minecraft handoff remain unqualified. Unfrozen and unpublished.

## Unpublished document viewer metadata correction

Private research display entries carry explicit non-primary metadata defaults. Category badges keep their existing mapping. This does not publish private documents, grant retrieval or establish physical validity. Unfrozen and unpublished.

## Unpublished manual Ask mode default repair

Simple document questions use the mode inference function's actual absent value while retaining backend and reasoning guards. Missing observer display modes use the existing observation default. Expression tests do not establish a complete live Ask run or authorize an action. Unfrozen and unpublished.

## Unpublished conversation display contract correction

Browser steering metadata follows the shared timestamp/delivery-state contract. Missing final-source labels remain empty, and performance counters retain one source. These changes do not pair, send steering or acknowledge a friend update. Unfrozen and unpublished.

The shared steering contract also exposes the existing picked_up state. Both chat interfaces now continue waiting for acknowledgement after pickup, without treating it as failure or completion. Three source-branch regressions reproduced this issue. Installed acceptance remains open.

## Unpublished pending prompt contract alignment

Queued prompts use the existing absent-workflow convention. Selected-chat filtering and route metadata use their existing declared types. Authenticated binding inspection and runtime authority are unchanged. Source checks only; unfrozen and unpublished.

## Unpublished native test contract alignment

Account recovery, room review and desktop service fixtures match their existing contracts. Production behavior is unchanged. Mocked source tests do not establish installed account or room acceptance. Unfrozen and unpublished.

## Unpublished conversation test contract alignment

Saved-mail display and console inventory declarations match their existing behavior. Existing GPT Live and backend tests use typed fixtures. No live-mail schema, authority or production behavior changes. Unfrozen and unpublished.

## Unpublished goal-context response repair

A null goal-context response now clears the existing context lists instead of interrupting the Live Answer refresh. The Guide explicitly narrows its unchanged unresolved-objective filter. No work or authority is created. These are source checks, not installed GPT Live handoff acceptance. Unfrozen and unpublished.

## Unpublished optional mail metadata repair

Stage Play retains a usable passive display when wake packet IDs or mail analysis metadata are absent. Missing metadata stays unknown and no work is dispatched. Mounted tests use synthetic requests; installed qualification remains open. Unfrozen and unpublished.

## Unpublished remaining test contract alignment

Existing solar display, Companion Stop and activity/evidence fixtures now declare the request, DOM timer and result shapes used by their assertions. Production behavior is unchanged. Source checks do not establish installed or scientific acceptance. Unfrozen and unpublished.

## Unpublished pinned-model menu alignment

Pinned model choices follow the existing shared policy and survive reopening. Labels make no lowest-cost or live-provider claim. Tests use an injected transport; provider availability and installed acceptance remain separate. Unfrozen and unpublished.

## Unpublished connection-status recovery

The Live connection fallback addendum records bounded recovery for unhandled native result codes in OpenAI settings. Inspection starts no provider test. Source-only validation; installed checks and publication remain pending.

## Unpublished console display contracts

The console display addendum aligns existing nullable voice labels, provider event guards, display refs and runtime picker types. It changes no pairing, room consent or game-action authority. Source validation and installed acceptance remain separate.

## Unpublished hosted room request typing

The hosted turn request addendum preserves distinct ordinary and evaluation request shapes and their existing owner controls. Installed acceptance remains separate.

## Unpublished live media contracts

The live media addendum makes inactive frame status boolean and preserves existing chat identity and validated audio MIME types. Installed media acceptance remains separate.

## Unpublished workstation observation contracts

The workstation observation addendum aligns setup receipt action types and optional job fields with their existing consumers, while preserving event summaries and action admission. Installed acceptance remains separate.

## Unpublished unsupported shortcut correction

The split-group shortcut no longer emits an action without an executor. Split-panel support is not provided by this correction; supported workstation navigation is retained.

## Unpublished graph lane display correction

Existing receipt and monitor-signal graph connections now have visible labels and colors. This display correction does not establish live graph execution or receipt delivery.

## Unpublished display and event type alignment

Parity checklist keys and document-context event IDs now match their existing callers. These erased type changes do not change runtime behavior or advance live acceptance.

## Unpublished conversation response type correction

The client response type declares the optional pending clarification already returned by the active conversation route. No runtime behavior or authority changes are included.

## Unpublished reasoning timeout state correction

The asynchronous timeout callback and error reader share typed mutable state. Existing idle/hard limits, cancellation, cleanup and retry behavior are preserved; live acceptance remains separate.

## Unpublished Stage Play evidence display corrections

The panel uses current lifecycle names, stamped observer profiles and exact packet/goal relevance evidence. Missing evidence remains unknown. These display corrections do not establish live execution, voice delivery or game authority.

## Unpublished evidence store type corrections

Image-source coordinate-space typing and normalized evidence-reference array inference now match the existing store contracts. Runtime state, persistence, ranking and observation-only boundaries are unchanged.

## Unpublished prompt metadata contract corrections

The generic route type declares existing postulate evidence metadata. External prompt cancellation diagnostics consistently use the existing prompt claim identity. Dispatch and approval behavior are unchanged.

## Unpublished moral graph display corrections

Selected-node filtering retains the complete biome node type, and hover cards show the existing missing-procedure message when no expression is available. Graph result and execution policies are unchanged.

## Unpublished helper type corrections

Panel resolver types now include built-in alias IDs instead of casting them into arbitrary caller IDs. The symbolic variable callback follows the installed library string contract. Emitted runtime behavior is unchanged.

## Unpublished atlas catalog alignment

The catalog contract accepts the two already-present history and biophysics IDs; atlas presentation supplies their missing colors and the existing Casimir quantum-foam color. Scientific contents, status and authority remain unchanged. Qualification is pending.

Atlas catalog alignment local checks are complete: contract tests, static rendering, source scans and scoped compiler checks. This supersedes the preparation-only qualification note above. Installed and publication gates remain open; no physical certification is claimed.

## Unpublished application type alignment

UI state, optional input and observable discriminator typing are aligned with existing runtime behavior. Source remains an unpublished proposal; local checks do not establish installed acceptance or physical certification.

## Unpublished viewer source typing

The viewer types include the existing authority source and optional planar source metadata. Rendering and numeric behavior are unchanged; this proposal is not installed or published.

## Unpublished pipeline input typing

Geometry helpers use geometry-only input types. The client snapshot now declares the existing metric audit field. Emitted behavior is unchanged; no physical or certificate qualification is claimed.

## Unpublished room source recovery messages

The R382 candidate gives specific recovery actions for known room/source read errors and keeps arbitrary remote error text hidden. The two selected files match the reviewed canonical bytes after line-ending normalization. Focused canonical tests passed; installed delivery against a matching domain revision remains unverified. This source proposal is unfrozen and unpublished.


## Unpublished diagnostic trace update

The [current diagnostic-trace inventory](SOURCE_ADDENDUM_DIAGNOSTIC_TRACES_CANDIDATE.json) supersedes earlier hashes only for its listed paths. It carries the reviewed post-R382 source changes with the consolidated release candidate. Navigation and demonstration plans retain their events as explicitly uncertified diagnostics; they cannot assert a gate pass or certificate. Certificate-backed movement contracts remain unchanged.

The canonical checkout passes 40 focused tests and an eight-root typecheck for this change. This is selected source, not a standalone build, installed feature acceptance, live authorization verification or physical certification. The whole-candidate release gate remains incomplete. No private history, accounts, traces, binaries or third-party packages are included. Publication remains pending.


## Unpublished guide fragment navigation

The [guide fragment addendum](SOURCE_ADDENDUM_GUIDE_FRAGMENT_CANDIDATE.json) updates the getting-started guide so direct Friends and Minecraft section links scroll after the page mounts. Both initial links, the unanchored entry, and existing section navigation passed local production-site browser checks. These selected source bytes remain unpublished; pilot availability and authority requirements are unchanged.


## Current public UI inventory proposal

`SOURCE_ADDENDUM_PUBLIC_UI_INVENTORY.json` records the reviewed current control-identity and metadata updates, including exact canonical/export hashes. The source catalog covers 784 controls; its three existing route bindings remain unchanged. This proposal adds no permissions or new dependencies and preserves existing omitted dependencies and notices. It remains source-only, unpublished, and is not evidence of an installed or signed release.


## Consolidated candidate dependency boundaries

The [current dependency disclosure](DEPENDENCY_BOUNDARIES_CURRENT_CANDIDATE.json) names 6 omitted dependencies referenced by this selected preview. These code, documentation and evidence dependencies are not supplied by this repository; their call sites and tests do not make it a standalone build. This disclosure preserves the existing selected-source boundary and does not remove those capabilities from the separate consolidated desktop/domain candidate. Private package receipts, live account/room authority, research evidence, and public release acceptance remain separate checks. This candidate is not published.
