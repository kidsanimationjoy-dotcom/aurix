# AURIX Windows release handoff

**Release status: engineering preview built; public release blocked.** The Windows source is merged into `main`, and CI has verified a portable x64 preview plus an unsigned MSIX validation package. Neither package carries a trusted publisher signature. The device tests and Store submission are not complete.

## Verified engineering build

- Windows workflow run: [46038661597](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46038661597).
- The workflow built PR #49's reviewed source tree immediately before it was merged into `main` as commit `7ebd83d2bacff89738800d18f00c2337f6810e3f`.
- All 13 workflow steps passed, including native build, desktop policy tests, read-only Windows readiness diagnostic, self-contained publish, package contents and checksum validation, ZIP upload, and unsigned MSIX packaging.
- Portable preview artifact: [AURIX-Windows-x64, artifact 15219442256](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46038661597/artifacts/15219442256). GitHub artifact ZIP digest: `sha256:e17a87700fb5776f6e7215c275a8e248e91b9fca31264ce2ecbd8449ffe4915c`.
- Unsigned MSIX validation artifact: [artifact 15219392178](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46038661597/artifacts/15219392178). GitHub artifact ZIP digest: `sha256:950115ff80c390db74dca413ab4d8c6ecc61e6821b19c678cffec0b149ae8d1c`.
- Both are temporary Actions artifacts and expire on December 11, 2026. They are CI evidence, not signed releases.

The new package gate checks that the ZIP contains the executable, README, one-click readiness launcher, read-only diagnostic, checksum and unsigned-release notice. It recomputes the executable SHA-256 and fails the build if the checksum, safety notice or launcher security checks do not match.

## Adult-owned publisher and Store account

A responsible adult who will legally own and maintain the publisher account must handle the Microsoft Partner Center registration, identity or business verification, and acceptance of Microsoft's agreements. The young developer should not submit another person's identity details or try to work around age or identity checks.

Microsoft distinguishes individual accounts for personal, hobby or non-business app publishing from company accounts for distribution connected with a business. The adult account owner must choose the legal account type that matches the actual publisher. Microsoft currently requires identity verification for individual accounts and business verification for company accounts.

Official entry points:

- [Microsoft Store developer registration](https://storedeveloper.microsoft.com/)
- [Open a developer account](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account)
- [Prepare and verify the developer account](https://learn.microsoft.com/en-us/windows/apps/publish/prepare-developer-account)

Do not send identity documents, account passwords, recovery codes or verification selfies to AURIX or put them in the repository.

## Package identity and Store submission

The workflow currently defaults to the placeholder publisher `CN=UNCONFIGURED-PUBLISHER`. That value is deliberately not a real publisher identity. After the adult account owner has a verified Partner Center account and the app's product identity, the repository's `AURIX_MSIX_IDENTITY` and `AURIX_MSIX_PUBLISHER` Actions variables must be set to the exact values shown by Partner Center. Rebuild and inspect the manifest before creating a Store submission. Never guess or invent these values.

Before submission, the publisher must review the package manifest and assets, including the `runFullTrust` restricted capability, and provide the Store information Microsoft requests: accurate app description and category, age-rating answers, screenshots and logos, and a privacy-policy URL that truthfully describes microphone use, local processing, optional Codex CLI connection and any provider data flows. Microsoft’s [MSIX Store readiness checklist](https://learn.microsoft.com/en-us/windows/apps/publish/store-readiness-checklist) covers identity matching, versioning, capabilities and signing.

For an MSIX distributed through Microsoft Store, Microsoft signs the package after it passes certification; the app publisher does not need to provide its own CA-trusted code-signing certificate for that Store channel. Certification can take up to three business days. This does not apply to direct-download ZIP/EXE distribution, and a Store submission is not approved merely because CI can pack an MSIX.

- [MSIX app certification process](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-certification-process)
- [Microsoft Store signing explanation](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/package-version-numbering?pivots=store-installer-msix)

## Real Windows laptop acceptance

CI cannot access the developer's physical laptop, microphone, Windows security configuration, installed applications or real wake-word environment. The following acceptance work remains open and must be performed on an actual supported Windows device before public release:

- First launch, close-to-tray, tray reopen, exit, and startup enable/disable.
- Microphone permission, installed English offline recognizer, wake phrase, one-command dictation, pause/resume and microphone release after exit.
- Pairing with the local companion, official Codex sign-in, AI-plan approval, per-action approval, disconnect and emergency stop.
- Supported application launching and UI Automation against the actual installed apps; confirm unsupported or ambiguous controls fail safely.
- Audit-log accuracy and privacy, Defender status and user-confirmed quick-scan behavior.
- Installation, update and uninstall from the final trusted package.

The readiness helper is a read-only preflight. It does not open or test-record from the microphone and cannot prove wake-word accuracy. Do not disable SmartScreen or Microsoft Defender to run an unsigned preview.

## Go/no-go rule

AURIX is **not ready for public launch** until all of the following are true: a responsible adult has completed the publisher-account process; package identity matches Partner Center; the real-device acceptance tests pass; the privacy and Store listing are accurate; Microsoft certifies the MSIX; and the released package's signature and publisher identity are verified. Until then, describe it only as an unsigned engineering preview.
