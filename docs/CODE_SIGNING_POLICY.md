# Windows code-signing policy

**Current status: unsigned preview; no SignPath application or approval; no production signing configured.**

The Windows desktop companion is currently published as a GitHub Actions preview artifact without an Authenticode signature. A SHA-256 checksum verifies file integrity against the published checksum; it does not establish publisher identity or make Windows SmartScreen trust the application.

## Current evidence

- Current Windows preview build: [GitHub Actions run 45911494666](https://github.com/kidsanimationjoy-dotcom/aurix/actions/runs/45911494666).
- Source commit: `92d890c745873d10bc476fadc2cc7de03edc57bf`.
- The executable's checksum is included in `SHA256SUMS.txt`.
- The executable's PE security directory is empty; no embedded Authenticode certificate is present.
- There is no SignPath project, signing policy, production certificate, API token, trusted signing workflow or human approval configured.

## Potential route: SignPath Foundation

The project may apply to the SignPath Foundation open-source code-signing programme only after it has independently confirmed it meets the programme's current requirements.

These include an OSI-approved open-source licence covering the project, a real public release and documented download page, active maintenance, a complete privacy policy, account MFA, defined author/reviewer/approver roles and manual approval for each production signing request.

**No licence is selected or adopted by this document.** Choosing an open-source licence grants legal permissions to others and is a decision for the project owner, with any required parent/guardian guidance. Until a compatible licence is actually adopted and all eligibility gates are met, AURIX must not claim to qualify.

If the project is accepted, it must use the provider's required wording and signing integration exactly as supplied. It must never claim SignPath acceptance or a signed binary before that happens.

## Signing controls

- Sign only reviewed release binaries produced from the repository's verified build.
- Keep the signing private key in the signing provider's hardware security module; do not put private keys in the repository or ordinary CI secrets.
- Store provider-issued project/policy identifiers and tokens only in approved secret storage after onboarding.
- Require the specified human approval for each production release signing request.
- Verify the final Authenticode signature and exact publisher identity before distributing a signed build.
- Keep unsigned preview builds clearly labelled unsigned.

## Distribution safety

Do not disable SmartScreen, Microsoft Defender or Windows security controls to run the unsigned preview. The release pipeline must not suggest bypassing those protections. Until trusted signing or another approved distribution route is in place, the current ZIP is a preview artifact and not a public-launch installer.

## Official information

- [SignPath Foundation](https://signpath.org/)
- [Programme terms and eligibility](https://signpath.org/terms)
- [Microsoft: Windows code-signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
