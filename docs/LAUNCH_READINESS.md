# AURIX launch readiness

**Decision: NOT READY for public launch.** PR #48 merged the one-click, read-only readiness launcher. PR #49 merged a pre-upload package-integrity gate that verifies required files, the executable checksum, unsigned-release wording and safe launcher arguments. The Windows app is built and CI-verified, but its public release remains blocked by real-device acceptance, trusted publisher identity, Store certification and legal/privacy governance.

## Latest verified Windows build (source now merged into main)

- [Windows workflow run 46038661597](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46038661597), run number 156, completed successfully with all 13 steps green.
- The run built PR #49's reviewed source tree at `a37b96ccea7eadb77f2f97204baa9071845c2a88` immediately before it was merged into `main` as `7ebd83d2bacff89738800d18f00c2337f6810e3f`. The merged source tree is the same; this is the latest directly verified package evidence.
- The workflow passed native WPF compilation, desktop action-policy tests, read-only Windows readiness diagnostic, self-contained Windows x64 publishing, release notice/checksum generation, portable package integrity validation, ZIP upload, MSIX layout preparation, unsigned MSIX packing and upload.
- Portable preview artifact `AURIX-Windows-x64`, ID `15219442256`, GitHub artifact ZIP digest `sha256:e17a87700fb5776f6e7215c275a8e248e91b9fca31264ce2ecbd8449ffe4915c`. [Download from workflow run 46038661597](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46038661597/artifacts/15219442256).
- Unsigned MSIX validation artifact, ID `15219392178`, GitHub artifact ZIP digest `sha256:950115ff80c390db74dca413ab4d8c6ecc61e6821b19c678cffec0b149ae8d1c`. [Download from workflow run 46038661597](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46038661597/artifacts/15219392178).
- Both temporary Actions artifacts expire on December 11, 2026. The hashes above are ZIP integrity digests, not publisher signatures or proof of SmartScreen reputation.
- The new package validator requires the EXE, README, launcher, diagnostic, checksum and release-status notice; verifies the executable SHA-256 against `SHA256SUMS.txt`; and rejects missing unsigned warnings or a launcher that bypasses PowerShell execution policy.
- The previous main-branch baseline after PR #47 was run [46033957912](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46033957912), with application verification [46033957953](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46033957953). The newer PR #49 build above supersedes that baseline package.

## Earlier Windows build evidence

- Earlier main-branch Windows x64 compile, expanded AI-proposal policy tests, self-contained publish and package uploads: [run 45927632927](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45927632927).
- Latest Windows rebuild after the native task-run coordinator change: PR [#39](https://github.com/kidsanimationjoy-dotcom/aurix/pull/39), [Windows workflow run 46014044710](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46014044710).
- Latest Windows rebuild with local pairing-disconnect control: PR [#43](https://github.com/kidsanimationjoy-dotcom/aurix/pull/43), [Windows workflow run 46017864230](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46017864230).
- PRs [#40](https://github.com/kidsanimationjoy-dotcom/aurix/pull/40) and [#41](https://github.com/kidsanimationjoy-dotcom/aurix/pull/41) added request cancellation and hard-stop behavior for the local Codex process; their verification runs passed.
- PR [#45](https://github.com/kidsanimationjoy-dotcom/aurix/pull/45) added tracked active-chat shutdown; its AURIX CI and verification runs [46020458611](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46020458611) and [46020458674](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46020458674) passed all 92 tests, TypeScript, production build and browser smoke tests.
- All historical artifacts are temporary CI outputs. None of the listed historical checks signs a release or substitutes for real-device tests.

## Local companion authentication and network boundary

- The companion CLI binds its HTTP server explicitly to `127.0.0.1`; it does not listen on a LAN/public interface.
- Each request must present the per-run bearer token. The server compares the supplied token using Node's timing-safe comparison.
- The server rejects non-loopback Host headers and foreign Origin values. The allowed browser origin is configured explicitly; the native desktop client uses the loopback URL.
- PR [#36](https://github.com/kidsanimationjoy-dotcom/aurix/pull/36) adds an integration test that sends a request to the loopback socket with `Host: evil.example` and expects `403 HOST_NOT_ALLOWED`, plus a missing-token request that expects `401`. These tests passed in main runs 45928261853 and 45928261880.
- The companion deliberately disables generic filesystem and terminal routes (HTTP 501) and the generic Codex exec route (HTTP 405 for GET; unsupported methods do not execute). Project coding remains behind the separate Codex App Server permission/approval model.

## Latest MSIX packaging validation

- The MSIX packaging pipeline is implemented in PR [#24](https://github.com/kidsanimationjoy-dotcom/aurix/pull/24). The current main workflow successfully lays out, validates and packs the MSIX with Windows SDK MakeAppx.
- Latest main-run artifact: `AURIX-Windows-MSIX-unsigned`, ID `15167137551`, GitHub digest `sha256:da03e7e74bb6fb34f817c3055ac5e415ee17e2e2f4279fecb11205a784cb97bb`; retained until 2026-12-11.
- Downloaded MSIX validation ZIP SHA-256 independently matches the GitHub artifact digest. Its inner `.msix` SHA-256 is `b395907f20e13c1983e5451a19e3c7b0cdea6a74fc35dca83f06790d6e008d25`, matching the included sidecar hash.
- The package manifest sets `Identity Publisher="CN=UNCONFIGURED-PUBLISHER"`. The MSIX contains no signature file, and its status file says it is not installable for end users until signed by Microsoft Store or a verified publisher certificate.
- This proves the MSIX packaging path works; it does **not** prove Store acceptance, a valid publisher identity, signing, installation or runtime behavior. It is not a Store-ready release.

#### What the Windows companion currently does

- Native .NET 8 WPF application with system tray and close-to-tray behavior.
- Optional, explicitly enabled local wake-word listening for “AURIX” / “Hey AURIX”, followed by one spoken instruction and a return to wake-only mode.
- Allowlisted application launching and a bounded deterministic command planner.
- Read-only inspection of visible windows and supported UI Automation controls.
- Approval-gated exact-name button activation and editable-field replacement, with sensitive/destructive targets refused.
- Microsoft Defender status display and user-confirmed quick-scan request.
- Emergency stop for remaining task steps.
- Bounded local task audit history that records action type, application, UTC time and outcome, but does not record dictated instructions, entered text, window titles or exception messages.
- Reversible current-user startup registration.
- Confirmed local AI disconnect control: cancels the active AURIX task, removes the DPAPI-protected pairing-token file and stale temporary token file, and clears the in-memory token. This removes AURIX's saved credential only; it does not stop or rotate a running companion's token.
- Authenticated local Codex voice reasoning: Codex can answer ordinary questions or propose up to five supported desktop steps.
- AI-proposed launches and read-only inspection use the supported application allowlist only when the user explicitly requested each step. AI-generated button clicks and text entry are restricted to Notepad and must match the exact user instruction; AURIX requires whole-plan approval and separate approval for each Notepad UI mutation.

## Latest merged AI voice and desktop-action extension

- The Windows voice path uses the authenticated loopback AURIX companion and the separately signed-in local Codex CLI. Recognised speech is sent as text; microphone audio remains on the user's PC. Pairing tokens are protected with Windows DPAPI, and up to 12 bounded conversation turns remain in process memory only.
- Codex can return a normal answer or a strict JSON proposal containing up to five supported steps. AURIX rejects malformed responses, unknown/duplicate fields, unsupported actions/apps, invalid input and external-impact button names.
- Every AI-proposed step must independently match an explicit user request. App launches require an open/launch/start request naming that app; window inspection requires an explicit request to show/list/inspect open windows/apps; control inspection requires an explicit request to inspect/show/list controls in the named app. Unrequested extra launches or observations are rejected.
- AI-proposed app launching and read-only inspection can use the supported application allowlist. AI-generated button clicks and text entry are restricted to Notepad. Browser and messaging-app UI mutations are rejected by the parser and covered by Windows policy tests.
- For a proposed click, the original instruction must contain an explicit click/press/select/activate verb, the exact complete button label, and a Notepad target in the same request clause. Merely mentioning a button or mentioning Notepad elsewhere is not authorization.
- For proposed text entry, the original instruction must link an affirmative text-entry verb, the exact complete user-supplied text, the exact complete field name and Notepad in one instruction sequence. Partial labels/text, invented values, disconnected instructions and conversationally negated requests fail closed.
- AURIX displays the complete proposed plan and requires whole-plan approval. Each Notepad button click and text-entry action then requires its own approval. The deterministic local command grammar remains separately bounded and keeps its own per-action approval prompts.
- The AI bridge does not add arbitrary shell execution, scripts, generic filesystem access, network actions, browser navigation or unrestricted keyboard/mouse control. It remains a bounded assistant, not a general-purpose autonomous desktop agent.

## Latest runtime reliability and account-control fixes (PRs #39–#45)

- PR [#39](https://github.com/kidsanimationjoy-dotcom/aurix/pull/39) adds a single Windows task-run coordinator. Starting a newer task cancels the previous run; stale progress callbacks and completion handlers cannot overwrite the newer task's UI or clear its emergency-stop state. Regression checks cover task supersession, old-run cleanup, emergency stop and completion.
- PR [#40](https://github.com/kidsanimationjoy-dotcom/aurix/pull/40) propagates an HTTP client disconnect to an AbortController in the local companion and passes its signal to the Codex chat runner. The active CLI child is terminated when the caller cancels or disconnects.
- PR [#41](https://github.com/kidsanimationjoy-dotcom/aurix/pull/41) sends a graceful termination signal and escalates to a hard termination if the Codex child is still running after 750 ms. The escalation timer is cleared when the child exits.
- These are cancellation and reliability improvements only. They do not expand the Codex read-only sandbox, add new desktop permissions, or remove existing user approvals.
- PR [#43](https://github.com/kidsanimationjoy-dotcom/aurix/pull/43) adds a confirmed Disconnect action and serializes Connect, Verify, Login and Disconnect so an asynchronous pairing request cannot silently restore a token after the user disconnects. The DPAPI test verifies save, load, removal and failed reload; decrypted and newly entered cleartext token byte arrays are zeroed after use.
- PR [#45](https://github.com/kidsanimationjoy-dotcom/aurix/pull/45) tracks every active read-only Codex chat request. The companion's idempotent closeCompanion() method aborts each active chat, destroys its outstanding response, waits for the Codex child process to exit (including the hard-stop fallback), stops an active Codex login child, and closes the loopback HTTP server.
- The companion CLI handles SIGINT and SIGTERM through that controlled shutdown path. Its end-to-end regression starts a fake Codex process that ignores SIGTERM, then verifies that the companion does not report shutdown complete until the process has exited.
- CI success does not replace real Windows laptop testing, microphone testing, or verification of the exact downloaded release artifacts.

## Remaining launch blockers

### Device validation
- Test install, first launch, tray open/exit, close-to-tray and startup enable/disable on a real Windows 11 x64 laptop.
- Test microphone permission, local English speech recognizer detection, wake phrase reliability, one-command dictation, pause/resume and microphone release on exit.
- Test supported UI Automation behavior with the actual target apps and confirm that approval prompts and emergency stop behave correctly.
- Test Defender status and quick-scan behavior against the real Windows Security installation.
- Test the exact downloaded ZIP on a clean Windows machine. CI compilation does not establish runtime compatibility on a user's laptop.

### Hands-free microphone failure recovery (PR #38)
- The Windows listener now treats recognition errors and unexpected cancellation as a failed hands-free session, releases the microphone, and reports the stopped state instead of remaining falsely marked as active.
- If the wake-word-to-command transition fails, AURIX fails closed and releases the recognizer. The desktop controls return to **Enable hands-free** while retaining the user's saved opt-in for a later app launch retry.
- PR [#38](https://github.com/kidsanimationjoy-dotcom/aurix/pull/38) is merged. The Windows build, desktop-action policy tests, portable x64 packaging, unsigned MSIX packaging, TypeScript checks, unit tests, production build and browser smoke tests all passed on commit `37eaf72defb83a50038b6912f7f59fc6b9a688b7`.
- This is code/CI validation only. It does not replace real microphone, wake phrase, reconnect, CPU/battery or Windows 11 laptop acceptance testing.

### Publisher identity and safe distribution
- The preview ZIP is portable, **unsigned**, and not an installer. It has no automatic update or uninstall mechanism.
- Do not disable SmartScreen or Microsoft Defender to run an unrecognised build. Wait for a verified signed distribution or use a separately reviewed test environment.
- Preferred trusted distribution path to investigate: package the desktop app as MSIX and submit it through the Microsoft Store, which re-signs certified Store MSIX packages. This requires real package identity/publisher details, a tested MSIX, Store policy/certification and a human-verified Partner Center account.
- Alternative for direct downloads: apply to SignPath Foundation only after checking its open-source, release, privacy/security, MFA, team-role and manual-approval conditions. A commercial direct-download route may require a paid organization-validated certificate.
- The MSIX pipeline is implemented and merged in PR [#24](https://github.com/kidsanimationjoy-dotcom/aurix/pull/24). The latest main run produced unsigned validation artifact `AURIX-Windows-MSIX-unsigned` (artifact ID `15167137551`, digest `sha256:da03e7e74bb6fb34f817c3055ac5e415ee17e2e2f4279fecb11205a784cb97bb`). The downloaded archive and its inner MSIX checksum were independently verified. The package publisher is explicitly `CN=UNCONFIGURED-PUBLISHER`, and the MSIX has no signature file; it is packaging validation only, not end-user-installable or Store-ready. The real Store identity, Partner Center account, Store submission/certification, trusted signing and production approval remain unconfigured. The human legal owner must complete account, identity/business and agreement steps with appropriate adult/guardian guidance; AI automation must not attempt those actions.
- Never label a build signed until the final executable's Authenticode signature and publisher identity have been independently verified.

### Legal, privacy and release governance
- No project licence has been adopted in this branch. Selecting an open-source licence changes legal permissions and must be an informed decision by the project owner with required adult/guardian guidance.
- No complete public privacy policy has been published. The policy must describe actual local storage and any information shared with connected provider accounts; it must not claim the whole AURIX product is local-only unless verified.
- Review dependency licences, third-party notices, provider terms, redistribution permissions and actual data flows.
- Prepare a public download/release page, versioned release notes, supported Windows requirements, update/uninstall guidance, support contact and rollback plan.

### Full AURIX product scope
- **Codex:** local Codex chat and project-scoped coding-task execution are implemented through the paired companion. Task Center displays one-time approvals for command and file-change requests, refuses network/persistent-root grants, and requires a successful sandbox check. This is not access to private ChatGPT conversations or cloud Codex.
- **REA:** local application and browser investigation are implemented through the companion for explicitly approved target scopes. Analysis is evidence-limited and does not reveal private server source or inaccessible model internals.
- **Higgsfield:** the official CLI media workflow supports account status, model discovery, quote-first image/video job creation and job polling. It requires a real signed-in account, available credits and explicit confirmation; live generation against a user's account was not part of CI.
- **Claude, Grok and 21st.dev:** their current adapters are interface-only and do not provide live chat, coding-agent or component-search execution.
- **Windows companion:** the local desktop task planner remains a bounded allowlist of app-launch and named UI Automation commands. Local Codex may propose up to five supported steps, but AURIX validates and displays the full plan for approval; each UI mutation requires a second approval and AI-proposed UI mutations are restricted to Notepad. It is not a general-purpose autonomous AI desktop agent. The richer Codex coding-task engine runs from AURIX Task Center through the local companion.
- A complete multi-engine public launch still requires live account acceptance tests for each advertised provider, production deployment, and clear disconnected/planned states for unavailable features.

## Release decision

A passing CI run proves the recorded source compiled and packaged in GitHub's hosted environment. It does not prove real-device behavior, publisher identity, legal eligibility, or that all advertised AURIX features exist. Do not announce public launch until the relevant gates above are evidenced and closed.
