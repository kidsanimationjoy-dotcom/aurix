# Windows code-signing policy

**Current status: unsigned preview; no trusted publisher signature; no production signing configured.**

The Windows desktop companion is currently distributed as a portable GitHub Actions preview artifact without an Authenticode signature. A SHA-256 checksum verifies that a file matches the checksum published with it; it does not identify the publisher or make Windows SmartScreen trust the application.

## Preferred distribution option: Microsoft Store MSIX

Microsoft's current Windows signing guidance says that when an app is submitted as an MSIX package through the Microsoft Store, Microsoft re-signs the package after certification. The publisher does not need to buy or manage a code-signing certificate for that Store package. Microsoft describes this route as worldwide and says Store MSIX installs do not show SmartScreen warnings.

The repository currently produces a portable ZIP, **not an MSIX package**, so this route is not yet implemented. Before pursuing it, the project must:
- create and test a valid MSIX package for the WPF app;
- prepare correct package identity, publisher information, assets, capability declarations and Store listing;
- pass Microsoft's app certification and Store policy checks;
- test Store install, update and uninstall on supported Windows versions.

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

- Current source branch: `feature/windows-desktop-release-current`.
- Windows x64 build: [GitHub Actions run 45918490446](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45918490446) — compile, self-contained publish, release notice, checksum generation and artifact upload all succeeded.
- Application verification: [run 45918490424](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45918490424) — TypeScript, unit tests, production build and browser smoke tests all passed.
- Additional repository CI: [run 45918490437](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45918490437) — install, typecheck, unit tests, production build and browser smoke tests passed.
- Artifact ID: `15162979150`; ZIP SHA-256: `aac0c61d91c831cf895bb472b048ce1564ac6e5da9f24ed3c7f12dd07673dd64`.
- Executable SHA-256: `cfc8f3c3b6e20ecfda45a87af83a63b672faba34073eb448d216e890371cb11d`; verified against `SHA256SUMS.txt` inside the downloaded ZIP.
- The ZIP contains a single portable Windows x64 package with the executable, PDB, README, release-status notice and checksum manifest.
- PE inspection confirms the Authenticode certificate-table offset and size are both zero; the executable has **no embedded Authenticode certificate**.
- No SignPath application, approved project, certificate, trusted signing workflow, production token, Store developer account, MSIX package or signing approval is configured.
- The workflow labels the preview UNSIGNED and instructs users not to disable SmartScreen or Microsoft Defender.

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
