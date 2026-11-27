# AURIX launch readiness

**Decision: NOT READY for public launch.** The latest main-branch Windows compile, AI desktop-proposal policy tests, package generation, TypeScript checks, unit tests, production build and browser smoke tests have passed. Real-device acceptance, trusted publisher identity, Store certification, legal/privacy governance and broader provider acceptance remain open.

## Latest main-branch Windows build evidence

- Current main repository head: `7062f0eea5e3d6d48268916cf406f0698c1a4d00`.
- Windows x64 compile, AI-proposal policy tests, self-contained publish, release notice/checksum generation, portable preview upload and unsigned MSIX packaging/upload: [main run 45926737822](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45926737822) — passed.
- TypeScript, unit tests, production build and browser smoke tests: [main run 45926737767](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45926737767) — passed.
- PR [#19](https://github.com/kidsanimationjoy-dotcom/aurix/pull/19) merged the native Windows companion; PRs [#21](https://github.com/kidsanimationjoy-dotcom/aurix/pull/21)–[#24](https://github.com/kidsanimationjoy-dotcom/aurix/pull/24) added approval-gated AI action proposals, Notepad-only UI mutations, matching instructions and MSIX packaging; PRs [#27](https://github.com/kidsanimationjoy-dotcom/aurix/pull/27)–[#30](https://github.com/kidsanimationjoy-dotcom/aurix/pull/30) tightened validation against the latest user instruction, conversational negation, complete text/field/button labels, and explicit same-clause Notepad targeting.
- Latest portable preview: artifact `AURIX-Windows-x64`, ID `15166369123`, GitHub digest `sha256:4cc42c3ba4332e9b846b867fc450f80ef2af66d44e8067eeb4d36fa8ca66a5f7`; retained until 2026-12-11.
- Downloaded portable ZIP SHA-256 independently matches that GitHub digest. Executable SHA-256 is `17058d6ebac540657623e8db46dc82257e602aa19ecaa09f34570b4d7d5b88e1`, matching the included `SHA256SUMS.txt`.
- The portable package contains `Aurix.Desktop.exe`, PDB, README, release-status notice and checksum manifest. It is explicitly **unsigned**, is a portable preview rather than an installer, and must not be run by bypassing SmartScreen or Microsoft Defender.

## Latest MSIX packaging validation

- The MSIX packaging pipeline is implemented in PR [#24](https://github.com/kidsanimationjoy-dotcom/aurix/pull/24). The current main workflow successfully lays out, validates and packs the MSIX with Windows SDK MakeAppx.
- Latest main-run artifact: `AURIX-Windows-MSIX-unsigned`, ID `15166558687`, GitHub digest `sha256:471631cfdeed7cd1e36d9facea43cd279ecc57f7af22fc8195ba7abc2158a6a8`; retained until 2026-12-11.
- Downloaded MSIX validation ZIP SHA-256 independently matches the GitHub artifact digest. Its inner `.msix` SHA-256 is `13000a822c934df37b4e8460e11b766f39ad55f287d9ff3eeab2526dc9e552aa`, matching its included checksum manifest.
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
- AI-proposed app launches and read-only inspection use the supported application allowlist. AI-generated button clicks and text entry are restricted to Notepad; AURIX requires explicit matching user instructions, a whole-plan approval, and separate approvals for each Notepad UI mutation.

## Latest merged AI voice and desktop-action extension

- The Windows voice path uses the authenticated loopback AURIX companion and the separately signed-in local Codex CLI. Recognised speech is sent as text; microphone audio remains on the user's PC. Pairing tokens are protected with Windows DPAPI, and up to 12 bounded conversation turns remain in process memory only.
- Codex can return a normal answer or a strict JSON proposal containing up to five supported steps. AURIX rejects malformed responses, unknown/duplicate fields, unsupported actions/apps, invalid input and external-impact button names.
- AI-proposed app launching and read-only inspection can use the supported application allowlist. AI-generated button clicks and text entry are restricted to Notepad. Browser and messaging-app UI mutations are rejected by the parser and covered by Windows policy tests.
- For a proposed click, the original instruction must contain an explicit click/press/select/activate verb, the exact complete button label, and a Notepad target in the same request clause. Merely mentioning a button or mentioning Notepad elsewhere is not authorization.
- For proposed text entry, the original instruction must link an affirmative text-entry verb, the exact complete user-supplied text, the exact complete field name and Notepad in one instruction sequence. Partial labels/text, invented values, disconnected instructions and conversationally negated requests fail closed.
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
- The MSIX pipeline is implemented and merged in PR [#24](https://github.com/kidsanimationjoy-dotcom/aurix/pull/24). The latest main run produced unsigned validation artifact `AURIX-Windows-MSIX-unsigned` (artifact ID `15166558687`, digest `sha256:471631cfdeed7cd1e36d9facea43cd279ecc57f7af22fc8195ba7abc2158a6a8`). The downloaded archive and its inner MSIX checksum were independently verified. The package publisher is explicitly `CN=UNCONFIGURED-PUBLISHER`, and the MSIX has no signature file; it is packaging validation only, not end-user-installable or Store-ready. The real Store identity, Partner Center account, Store submission/certification, trusted signing and production approval remain unconfigured. The human legal owner must complete account, identity/business and agreement steps with appropriate adult/guardian guidance; AI automation must not attempt those actions.
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
