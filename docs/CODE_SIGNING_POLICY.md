# Windows code-signing policy

**Current status: unsigned preview; no trusted publisher signature; no production signing configured.**

The Windows desktop companion is currently distributed as a portable GitHub Actions preview artifact without an Authenticode signature. A SHA-256 checksum verifies that a file matches the checksum published with it; it does not identify the publisher or make Windows SmartScreen trust the application.

## Preferred distribution option: Microsoft Store MSIX

Microsoft's current Windows signing guidance says that when an app is submitted as an MSIX package through the Microsoft Store, Microsoft re-signs the package after certification. The publisher does not need to buy or manage a code-signing certificate for that Store package. Microsoft describes this route as worldwide and says Store MSIX installs do not show SmartScreen warnings.

The repository now produces a portable ZIP and an **unsigned MSIX validation package** in CI. The MSIX pipeline validates the package layout and packs it with the Windows SDK, but this is not a Store-ready package. Before pursuing the Store route, the project must:
- replace `CN=UNCONFIGURED-PUBLISHER` with the correct, human-verified package publisher identity and matching Store identity;
- review package assets, capabilities, manifest declarations and Store listing;
- submit the correctly identified package and pass Microsoft's app certification and Store policy checks;
- test Store installation, update and uninstall on supported Windows versions.

A human legal owner must create and verify the Partner Center developer account, choose the correct legal account type, provide identity/business evidence and accept Microsoft's agreements. Individual accounts are intended for distribution not related to a business, trade or profession; distribution connected with a business requires the Company account type. Both account types currently have no registration fee in Microsoft's new onboarding flow, but verification is required. AI agents must not perform registration, identity/business verification or agreement acceptance.

## Alternative: SignPath Foundation for direct downloads

SignPath Foundation offers free signing to qualifying open-source projects. Before applying, project maintainers must verify all current conditions, including:
- an OSI-approved open-source licence for all project components, with no commercial dual-licensing and no proprietary project code;
- an actively maintained project that is already released in the form to be signed, with its functionality described on the download page;
- no features that compromise user privacy/security or qualify as prohibited hacking tools;
- MFA for every team member's SignPath and source-repository access;
- named author, reviewer and signing-approver roles, with human approval for every release signing request;
- a code-signing policy on the project homepage/release page, with team roles and members listed;
- an accurate privacy statement or privacy policy, including relevant third-party component/provider policies;
- notices for system changes and a usable uninstall path whenever installation instructions or automated installation are supplied.

If an app transfers user data to systems not specifically requested by the user or installer/operator, SignPath requires a privacy policy, that policy to be displayed during installation, and installation options to disable those data transfers. The project must not publish a blanket “no network transfer” statement if connected-provider features send data when used.

**No licence is selected or adopted by this document.** Choosing an open-source licence changes legal permissions and is a decision for the project owner with appropriate adult/guardian guidance. AURIX must not claim SignPath eligibility, acceptance or a signed binary until those requirements are actually met and the resulting Authenticode signature has been independently verified. Under a SignPath Foundation certificate, the publisher is SignPath Foundation, not the project owner.

## Alternative: traditional code-signing certificate

A recognised certificate authority may issue an organization-validated code-signing certificate after verifying the real legal identity of the applicant. This can support direct distribution outside the Store, but it involves a paid certificate, organization/identity checks and protected private-key handling. A valid signature alone does not guarantee that a brand-new download immediately avoids every SmartScreen reputation warning.

## Current build evidence

- Historical main source commit for the initial Windows preview evidence: `5f5f8fd81fe842eb87baa5aa4b2f8a1eb635ef99`. Current main is tracked separately below.
- Windows x64 build: [main run 45921375421](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45921375421) — native compile, self-contained publish, release notice, executable checksum generation and artifact upload succeeded.
- Application verification: [main run 45921375437](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45921375437) — TypeScript, unit tests, production build and browser smoke tests passed.
- Repository CI on the merged engineering revision: [run 45921098904](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45921098904) — passed.
- Engineering PR [#19](https://github.com/kidsanimationjoy-dotcom/aurix/pull/19) was merged in commit `2cae59ab4c865aca4b52700828c41b197bc99f50`.
- Artifact ID: `15164239353`; GitHub artifact digest and downloaded ZIP SHA-256: `f4b9e5d0342302c0268e69cff1ee59deeb1906e5fa649e42747cbbed57afac3e`.
- Executable SHA-256: `73609efb3279d6c94083bf52decb6f47cfc2316110335e450a931d1c926b2a5e`; verified against the included `SHA256SUMS.txt`.
- The ZIP is a single portable Windows x64 package. PE inspection confirms the Authenticode certificate-table offset and size are zero. The executable has **no embedded Authenticode certificate**.
- The packaged release notice explicitly labels the preview UNSIGNED and says not to disable SmartScreen or Microsoft Defender.
- No trusted signing certificate, SignPath project/approval, Store developer account or production signing workflow is configured. CI can generate an unsigned MSIX validation package, but its publisher remains `CN=UNCONFIGURED-PUBLISHER` and it contains no signature file; it is not installable as an end-user release.


## Latest merged voice-enabled preview evidence

- Main merge commit: [`e37bf46129518cc281d9209374e3f3332ab2c23c`](https://github.com/kidsanimationjoy-dotcom/aurix/commit/e37bf46129518cc281d9209374e3f3332ab2c23c); PR [#20](https://github.com/kidsanimationjoy-dotcom/aurix/pull/20) merged.
- Windows x64 compile and packaging: [run 45922086971](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45922086971) — passed.
- Application verification: [run 45922086918](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45922086918) — passed.
- Artifact ID `15164677193`, GitHub artifact digest `sha256:2bd30f1bcafeec060a791b63c8f9be4aca38128128cedfe7aa2a51885847cd53`.
- The artifact digest is integrity metadata, not publisher identity or an Authenticode signature. The build remains unsigned.

## Latest merged build and cancellation evidence (November 27, 2026)

- Main-branch Windows workflow after PR [#47](https://github.com/kidsanimationjoy-dotcom/aurix/pull/47): [run 46033957912](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46033957912) — passed native build, policy tests, read-only microphone/speech-recognizer preflight validation, self-contained publish and both package uploads.
- Main-branch application verification: [run 46033957953](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46033957953) — passed TypeScript, unit tests, production build and browser smoke tests.
- Latest portable preview artifact `15215936317`, digest `sha256:c7ec2a45fd9e64c542a057e41b2a590ea7082364acbd2bec5cbc4dabf86be09f`; latest unsigned MSIX validation artifact `15216075878`, digest `sha256:09be11ce04ab34f004eea87808714e91c724df2d4b572a42a1732a7f2a540b59`. Both are temporary CI artifacts retained until 2026-12-11; neither is signed.
- The portable preview includes `diagnostics/Test-AurixReadiness.ps1`, which checks Windows version/architecture, available audio endpoint names, installed English offline recognizers and an optional machine-wide microphone privacy policy. It is read-only and does not open or record from the microphone. It cannot validate wake-word accuracy or real microphone operation.
- Windows build source commit after PR [#47](https://github.com/kidsanimationjoy-dotcom/aurix/pull/47): `6e16d3dddd32f6155b8397b6b03dd98459adf1ac`. PR #47 packages a read-only Windows laptop-readiness script and validates it in CI.
- Latest Windows desktop source update is PR [#39](https://github.com/kidsanimationjoy-dotcom/aurix/pull/39). Its [Windows workflow run 46014044710](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46014044710) passed native compilation, desktop task-policy and lifecycle tests, self-contained publishing, portable ZIP packaging and unsigned MSIX validation packaging.
- Latest Windows package containing the local pairing-disconnect control is PR [#43](https://github.com/kidsanimationjoy-dotcom/aurix/pull/43), [Windows workflow run 46017864230](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46017864230). Build, all 47 desktop tests and both package uploads passed.
- Portable preview artifact 15206324568 has GitHub digest sha256:560de6beb05b61e9f5fc65cb8507277a32c4b175602da1856c0eafb78b9d5484; unsigned MSIX validation artifact 15207670222 has GitHub digest sha256:df00ca6a80e4a131e925b941f877fa35c028bfea6ca1d8d9df223114eb354beb. These are CI integrity digests, not signatures or publisher verification.
- PR [#40](https://github.com/kidsanimationjoy-dotcom/aurix/pull/40) adds end-to-end client-disconnect cancellation for the local Codex chat process. [AURIX verification run 46015853751](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46015853751) and [AURIX CI run 46015853805](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46015853805) passed, including the child-process cancellation regression.
- PR [#41](https://github.com/kidsanimationjoy-dotcom/aurix/pull/41) adds a graceful stop followed by a hard-stop fallback after 750 ms when the Codex child remains alive. [Verification run 46016349854](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46016349854) passed TypeScript, unit tests, production build and browser smoke tests. The regression test makes the fake Codex process ignore SIGTERM and checks that it exits after escalation.
- PRs #40 and #41 changed companion code and tests only; they did not change the Windows executable built by PR #39.
- PR [#45](https://github.com/kidsanimationjoy-dotcom/aurix/pull/45) adds tracked active-chat shutdown to the Node companion. Its [AURIX CI run 46020458611](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46020458611) and [verification run 46020458674](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/46020458674) passed all 92 tests, TypeScript, production build and browser smoke tests. PR #45 changed no Windows desktop code or Windows package artifacts.
- The latest Windows x64 and MSIX validation artifact IDs and digests above remain the PR #43 build evidence; both packages remain unsigned.
- These CI results confirm build and test behavior, not publisher identity or trusted signing. The portable ZIP and MSIX validation package remain unsigned. No SmartScreen or Defender bypass is permitted.

## Signing controls

- Sign only reviewed release binaries produced from the repository's verified source/build.
- Keep signing private keys in the approved signing provider's protected hardware/security service; never commit keys or place raw private keys in ordinary CI secrets.
- Store provider-issued project/policy IDs and tokens only in approved secret storage after onboarding.
- Require the provider's mandated human approval for each production signing request.
- Verify the final Authenticode signature and exact publisher identity before describing a binary as signed.
- Keep all unsigned builds clearly labelled as unsigned.

## Official information

- [Microsoft: Windows code-signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [Microsoft: prepare and verify a Store developer account](https://learn.microsoft.com/en-us/windows/apps/publish/prepare-developer-account)
- [SignPath Foundation terms and eligibility](https://signpath.org/terms)
