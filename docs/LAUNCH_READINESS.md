# AURIX launch readiness

**Decision: NOT READY for public launch.** A Windows x64 preview package has been built and its automated checks pass, but legal, signing, device-validation and broader product gates remain open.

## Verified Windows preview

- Source branch: `feature/windows-desktop-clean-main`
- Build commit: `92d890c745873d10bc476fadc2cc7de03edc57bf`
- Windows CI: [run 45911494666](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45911494666) — build, self-contained publish, package metadata, checksum and artifact upload succeeded.
- AURIX verification CI: [run 45911494664](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45911494664) — TypeScript, unit tests, production build and browser smoke tests succeeded.
- Artifact: `AURIX-Windows-x64`, artifact ID `15160700703`, SHA-256 `c977cd0c28a5d71e247b196d37c7334b0ce9568e669f9d177332bb690e93057a`.
- Executable checksum: `6d2ee3142a6c9548a3ee3526348d2a1bc65a34bff7eb897b7915a9af74736068`; independently compared with the executable inside the uploaded ZIP and matched.
- PE inspection confirms no embedded Authenticode certificate is present. The executable is **unsigned**.

## What the Windows companion currently does

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
- The repository README states that the real Codex, Claude, Grok, Higgsfield, REA and 21st.dev provider execution adapters are not yet connected and AURIX is not deployed.
- The Windows companion currently uses a bounded local command planner. It is not yet a full general-purpose AI desktop agent.
- A public launch of the complete multi-engine AURIX workspace requires these provider connections, end-to-end testing, production deployment and clear disconnected/planned states for unavailable features.

## Release decision

A passing CI run proves the recorded source compiled and packaged in GitHub's hosted environment. It does not prove real-device behavior, publisher identity, legal eligibility, or that all advertised AURIX features exist. Do not announce public launch until the relevant gates above are evidenced and closed.
