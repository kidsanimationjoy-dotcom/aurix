# AURIX launch readiness

**Decision: NOT READY for public launch.** The latest merged main-branch Windows build and application verification passed. Legal, trusted-signing, real-device acceptance, installer and broader product gates remain open.

## Latest main-branch Windows preview evidence

- Current main source commit: `7472dd196d3fb7c9084bdab9f7337b32cdc402dd`.
- Windows x64 compile, AI-proposal policy tests, self-contained publish, release notice/checksum generation and artifact upload: [main run 45924739819](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45924739819) — passed on the current main commit.
- Application TypeScript, unit tests, production build and browser smoke tests: [main run 45924739804](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45924739804) — passed on the current main commit.
- PR [#21](https://github.com/kidsanimationjoy-dotcom/aurix/pull/21) added approval-gated AI-proposed desktop plans and was merged in commit `4ebf2156f1321f7b4ebe076a1c3209185c2ed15b`.
- PR [#22](https://github.com/kidsanimationjoy-dotcom/aurix/pull/22) restricted AI-generated button clicks and text entry to Notepad and added policy tests; it was merged in commit `aadfd26aa326b57d6f18a15bbc4dc9bb0baa787d`.
- PR [#23](https://github.com/kidsanimationjoy-dotcom/aurix/pull/23) aligned Codex's system instructions and user-facing copy with the Notepad-only rule; it was merged in commit `7472dd196d3fb7c9084bdab9f7337b32cdc402dd`.
- Latest Windows artifact: `AURIX-Windows-x64`, artifact ID `15164984452`, GitHub artifact digest `sha256:0182530d0fac6d21d57854c1343c564dc5c23f9c08aa72fe11dd72583a92dd5b`; retained until 2026-12-11.
- Downloaded ZIP SHA-256 independently matches the GitHub artifact digest: `0182530d0fac6d21d57854c1343c564dc5c23f9c08aa72fe11dd72583a92dd5b`.
- Executable SHA-256: `b04ee631dcab8b8664c0043db81c90e331004d59f06bc04ba61108ee732ceb53`; verified against the included `SHA256SUMS.txt`.
- ZIP inspection confirms a single-level Windows x64 portable package containing `Aurix.Desktop.exe`, its PDB, `README.txt`, `RELEASE-STATUS.txt` and `SHA256SUMS.txt`.
- The package explicitly identifies the executable as **unsigned** and instructs users not to bypass SmartScreen or Microsoft Defender. It is a portable preview, not an installer.

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
- AI-proposed app launches and read-only inspection use the supported application allowlist. AI-generated button clicks and text entry are restricted to Notepad; AURIX validates the full plan, asks for whole-plan approval, and retains separate approval prompts for each Notepad UI mutation.

## Latest merged AI voice extension

- Main merge commit: [`e37bf46129518cc281d9209374e3f3332ab2c23c`](https://github.com/kidsanimationjoy-dotcom/aurix/commit/e37bf46129518cc281d9209374e3f3332ab2c23c).
- PR [#20](https://github.com/kidsanimationjoy-dotcom/aurix/pull/20) added read-only Codex chat to the Windows voice path and was merged after the checks below passed.
- Windows x64 compile, self-contained publish and artifact upload: [run 45922086971](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45922086971) — passed.
- Application TypeScript, unit tests, production build and browser smoke tests: [run 45922086918](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45922086918) — passed.
- Windows artifact: `AURIX-Windows-x64`, artifact ID `15164677193`, GitHub artifact digest `sha256:2bd30f1bcafeec060a791b63c8f9be4aca38128128cedfe7aa2a51885847cd53`; retained until 2026-12-11.
- The voice bridge uses the authenticated loopback companion and separately signed-in Codex CLI. Recognised speech is sent as text; microphone audio remains local. Codex can return normal answers or structured proposals for the bounded desktop action schema. AURIX validates the proposal, requires whole-plan approval, and retains separate approval for button clicks and text entry. AI-proposed UI mutations are restricted to Notepad; browsers and messaging clients are excluded.
- Pairing tokens are protected with Windows DPAPI. Up to 12 bounded conversation turns remain in process memory only and can be cleared.

### Approval-gated desktop-action proposals (PRs #21–#23)

- Local Codex may return either a normal answer or a strict JSON proposal for one to five supported steps.
- AURIX rejects malformed JSON, unknown fields, duplicate fields, unsupported action types, unsupported apps, invalid text and external-impact button names.
- AI-proposed launching and read-only inspection can use the approved app allowlist. AI-generated button clicks and text entry are restricted to Notepad. Browser and messaging-app UI mutations are rejected by the parser and covered by Windows policy tests.
- AURIX displays the full proposed plan and requires approval before execution. Each button click and text-entry operation then requires its own approval. The existing deterministic local command grammar remains separate and retains its existing per-action approvals.
- The bridge does not add arbitrary shell execution, scripts, unrestricted keyboard/mouse control, general filesystem access, browser navigation or network actions.
- The system prompt, desktop UI, README and architecture document now describe the same Notepad-only AI mutation boundary.


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
- No Store developer account, MSIX package, trusted certificate, SignPath project, or production signing approval is currently configured. The human legal owner must complete account, identity/business and agreement steps; AI automation must not attempt those actions.
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
