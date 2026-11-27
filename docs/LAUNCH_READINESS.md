# AURIX launch readiness

**Decision: NOT READY for public launch.** The latest main-branch Windows compile, AI desktop-proposal policy tests, package generation, TypeScript checks, unit tests, production build and browser smoke tests have passed. Real-device acceptance, trusted publisher identity, Store certification, legal/privacy governance and broader provider acceptance remain open.

## Latest main-branch Windows build evidence

- Current main repository head: `f7e837b3ac582bf0c2d08a39b323608d38ea00a9`. Windows desktop code and packaging pipeline are in commit `7127fc0f54018c54f30aca575e97c4fa23a0e2d0`; the later main commit only refreshes launch-readiness evidence.
- Windows x64 compile, AI-proposal policy tests, self-contained publish, release notice/checksum generation, portable preview upload and unsigned MSIX packaging/upload: [main run 45924906069](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45924906069) — passed.
- TypeScript, unit tests, production build and browser smoke tests on the same code commit: [main run 45924906075](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45924906075) — passed.
- AURIX verification on the current documentation head: [main run 45924932986](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45924932986) — passed.
- PR [#19](https://github.com/kidsanimationjoy-dotcom/aurix/pull/19) merged the native Windows companion; PR [#21](https://github.com/kidsanimationjoy-dotcom/aurix/pull/21) added approval-gated AI-proposed desktop plans; PR [#22](https://github.com/kidsanimationjoy-dotcom/aurix/pull/22) restricted AI-generated UI mutations to Notepad and added policy tests; PR [#23](https://github.com/kidsanimationjoy-dotcom/aurix/pull/23) aligned the prompt and user-facing text with that restriction; PR [#24](https://github.com/kidsanimationjoy-dotcom/aurix/pull/24) added MSIX packaging validation.
- Latest portable preview: artifact `AURIX-Windows-x64`, ID `15166585001`, GitHub digest `sha256:9f862ed7535aaa588c14db5a461a9db7123953f86804dcddd3d1932d78af58a2`; retained until 2026-12-11.
- Downloaded portable ZIP SHA-256 independently matches that digest. Executable SHA-256 is `b04ee631dcab8b8664c0043db81c90e331004d59f06bc04ba61108ee732ceb53`, matching the included `SHA256SUMS.txt`.
- The portable package is a Windows x64 ZIP containing `Aurix.Desktop.exe`, PDB, README, release-status notice and checksum manifest. It is explicitly **unsigned**, not an installer, and must not be run by bypassing SmartScreen or Microsoft Defender.

## Latest MSIX packaging validation

- The MSIX pipeline was merged in PR [#24](https://github.com/kidsanimationjoy-dotcom/aurix/pull/24), commit `7127fc0f54018c54f30aca575e97c4fa23a0e2d0`. It creates the package layout, validates the manifest, uses Windows SDK MakeAppx to pack the MSIX, and uploads a separate validation artifact.
- Latest main-run artifact: `AURIX-Windows-MSIX-unsigned`, ID `15166106210`, GitHub digest `sha256:c42e35c58fc698fc05e5862402ede6e0aad08553e3b1471dce7bb02f16e31007`; retained until 2026-12-11.
- Downloaded validation ZIP SHA-256 independently matches the GitHub artifact digest. Its inner `.msix` SHA-256 is `1de9c2e0383b20d6842af608e8442cab042f0b91688f6c34aa226621a4903f52`, matching its included hash manifest.
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
- Authenticated local Codex voice reasoning: Codex can answer ordinary questions or propose up to five supported desktop steps.
- AI-proposed app launches and read-only inspection use the supported application allowlist. AI-generated button clicks and text entry are restricted to Notepad; AURIX validates the entire plan, requires whole-plan approval, and retains separate approval prompts for each Notepad UI mutation.

## Latest merged AI voice and desktop-action extension

- The Windows voice path uses the authenticated loopback AURIX companion and the separately signed-in local Codex CLI. Recognised speech is sent as text; microphone audio remains on the user's PC. Pairing tokens are protected with Windows DPAPI, and up to 12 bounded conversation turns remain in process memory only.
- Codex can return a normal answer or a strict JSON proposal containing up to five supported steps. AURIX rejects malformed responses, unknown/duplicate fields, unsupported actions/apps, invalid input and external-impact button names.
- AI-proposed app launching and read-only inspection can use the supported application allowlist. AI-generated button clicks and text entry are limited to Notepad. Browser and messaging-app UI mutations are rejected by the parser and covered by Windows policy tests.
- AURIX displays the complete proposed plan and requires whole-plan approval. Each Notepad button click and text-entry action then requires its own approval. The deterministic local command grammar remains separately bounded and keeps its own per-action approval prompts.
- The AI bridge does not add arbitrary shell execution, scripts, generic filesystem access, network actions, browser navigation or unrestricted keyboard/mouse control. It remains a bounded assistant, not a general-purpose autonomous desktop agent.

## Remaining launch blockers

### Device validation
- Test install, first launch, tray open/exit, close-to-tray and startup enable/disable on a real Windows 11 x64 laptop.
- Test microphone permission, local English speech recognizer detection, wake phrase reliability, one-command dictation, pause/resume and microphone release on exit.
- Test supported UI Automation behavior with the actual target apps and confirm that approval prompts and emergency stop behave correctly.
- Test Defender status and quick-scan behavior against the real Windows Security installation.
- Test the exact downloaded ZIP on a clean Windows machine. CI compilation does not establish runtime compatibility on a user's laptop.

### Publisher identity and safe distribution
- The preview ZIP is portable, **unsigned**, and not an installer. It has no automatic update or uninstall mechanism.
- Do not disable SmartScreen or Microsoft Defender to run an unrecognised build. Wait for a verified signed distribution or use a separately reviewed test environment.
- Preferred trusted distribution path to investigate: package the desktop app as MSIX and submit it through the Microsoft Store, which re-signs certified Store MSIX packages. This requires real package identity/publisher details, a tested MSIX, Store policy/certification and a human-verified Partner Center account.
- Alternative for direct downloads: apply to SignPath Foundation only after checking its open-source, release, privacy/security, MFA, team-role and manual-approval conditions. A commercial direct-download route may require a paid organization-validated certificate.
- The MSIX packaging pipeline is implemented and merged in PR [#24](https://github.com/kidsanimationjoy-dotcom/aurix/pull/24). The latest main run produced unsigned validation artifact `AURIX-Windows-MSIX-unsigned` (artifact ID `15166106210`, digest `sha256:c42e35c58fc698fc05e5862402ede6e0aad08553e3b1471dce7bb02f16e31007`). The downloaded archive and its inner MSIX checksum were independently verified. The package publisher is explicitly `CN=UNCONFIGURED-PUBLISHER`, and the MSIX has no signature file; it is packaging validation only, not end-user-installable or Store-ready. The real Store identity, Partner Center account, Store submission/certification, trusted signing and production approval remain unconfigured. The human legal owner must complete account, identity/business and agreement steps with appropriate adult/guardian guidance; AI automation must not attempt those actions.
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
