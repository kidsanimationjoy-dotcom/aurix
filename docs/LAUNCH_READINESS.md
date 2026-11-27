# AURIX launch readiness

**Decision: NOT READY for public launch.** The Windows desktop companion is merged into `main` and all three fresh CI workflows passed. Legal, trusted-signing, real-device acceptance and broader product gates remain open.

## Latest merged Windows preview evidence

- Main merge commit: [`2cae59ab4c865aca4b52700828c41b197bc99f50`](https://github.com/kidsanimationjoy-dotcom/aurix/commit/2cae59ab4c865aca4b52700828c41b197bc99f50).
- Reviewed PR source head: `bfe5b33c67a82f8f36c7b88c6e793a2a7e7b50fc`; PR [#19](https://github.com/kidsanimationjoy-dotcom/aurix/pull/19) was merged after the checks below passed.
- Windows x64 compile, self-contained publish, release notice/checksum generation and artifact upload: [run 45920986046](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45920986046) — passed.
- Application TypeScript, unit tests, production build and browser smoke tests: [run 45920986048](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45920986048) — passed. The browser test now waits for the asynchronous provider retry to settle before testing persistence and cancellation.
- Repository CI: [run 45920986069](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45920986069) — passed.
- Windows artifact: `AURIX-Windows-x64`, artifact ID `15163894688`, GitHub artifact digest `sha256:b0e92d73b4194a7b2dbfcddcf2e6c871b19ccc7e452e5b974de65815ecb319d4`. The artifact is retained until 2026-12-11.
- The workflow labels this preview UNSIGNED. The artifact is not a trusted-publisher release and must not be used as a reason to disable SmartScreen or Microsoft Defender.

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
- **Windows companion:** the local desktop task planner remains a bounded allowlist of app-launch and named UI Automation commands. It is not a general-purpose autonomous AI desktop agent. The richer Codex task engine runs from AURIX Task Center through the local companion.
- A complete multi-engine public launch still requires live account acceptance tests for each advertised provider, production deployment, and clear disconnected/planned states for unavailable features.

## Release decision

A passing CI run proves the recorded source compiled and packaged in GitHub's hosted environment. It does not prove real-device behavior, publisher identity, legal eligibility, or that all advertised AURIX features exist. Do not announce public launch until the relevant gates above are evidenced and closed.
