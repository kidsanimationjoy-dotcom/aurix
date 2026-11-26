# AURIX launch readiness

**Overall status: NOT READY FOR PUBLIC LAUNCH.** This document records verified repository state and the remaining release gates. A passing build is not a complete product release.

## Verified current state

- The repository contains a native .NET 8 WPF Windows companion.
- The Windows GitHub Actions workflow builds and packages a self-contained Windows x64 ZIP.
- The companion has a system-tray shell, optional hands-free wake listening, a bounded local command planner, allowlisted app launching, limited UI Automation, Defender status/quick-scan integration and an emergency stop.
- The companion's wake-word and microphone behavior have not yet been verified on the target user's laptop.
- The current Windows ZIP is unsigned. A build artifact or checksum is not an Authenticode publisher signature.
- The main AURIX README describes Phase 2 task orchestration but explicitly says real provider execution adapters are not yet connected.
- The repository does not currently contain a root LICENSE file or a published privacy policy.
- SignPath Foundation application, acceptance, project configuration and signing credentials are not present.

## Launch blockers

### Product and functionality
- Decide and document the first launch product scope: Windows companion only, or the broader AURIX workspace.
- Test install, first run, microphone permission, wake phrase, dictation, tray pause/resume, startup behavior, emergency stop and clean exit on a real supported Windows device.
- Verify all advertised actions against actual behavior. Keep unsupported AI/provider features visibly marked as planned or disconnected.
- Connect and test each provider adapter before advertising that provider as available.
- Add a repeatable installer/uninstaller and recovery instructions if distributing a desktop installer.
- Complete accessibility, error handling, update, backup/recovery and security review for the chosen launch scope.

### Legal, privacy and publisher identity
- Project owner must choose and adopt an appropriate licence after understanding its permissions and obligations. No licence is selected by this checklist.
- Audit actual application and dependency data flows before publishing a privacy policy. Do not claim that the whole AURIX product is local-only unless verified.
- Publish the privacy policy and link it from the project homepage and download/release page.
- Review third-party provider terms, dependency licences, notices and redistribution rights.
- Keep unsigned builds labelled unsigned until a real Authenticode signature is verified.

### Trusted code signing
- Confirm the project's eligibility against the current SignPath Foundation terms.
- Apply only after the required licence, release, documentation, privacy, account-security and team-governance conditions are genuinely met.
- Complete provider review and onboarding. Application submission is not approval.
- Configure the provider-issued project, trusted build, artifact configuration and signing policy only after onboarding.
- Require the specified human approval for every production signing request.
- Verify the final executable's Authenticode signature and publisher identity before describing it as signed.

### Release engineering
- Build from a reviewed, tagged source revision using the documented CI workflow.
- Run automated tests and the real-device acceptance checklist.
- Scan release artifacts and publish cryptographic checksums.
- Test the exact downloaded release package on a clean Windows environment.
- Publish versioned release notes, supported Windows requirements, installation, update and uninstall instructions.
- Keep a rollback/revocation plan and a support/contact route.

## Release decision

AURIX may be called ready for launch only when every blocker applicable to the chosen launch scope is closed and evidenced. A draft pull request, a green CI run, a locally generated ZIP, or a pending signing application does not satisfy those gates.

## Current signing-policy preparation

The preparatory policy is tracked separately in [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md). It does not claim SignPath acceptance or a signed release.
