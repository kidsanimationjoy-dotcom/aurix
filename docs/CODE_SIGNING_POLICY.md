# Windows code-signing policy

**Status: unsigned; SignPath Foundation application not submitted; production signing is not configured.**

AURIX's Windows desktop companion is currently distributed as an unsigned build artifact. Windows may therefore display Microsoft Defender SmartScreen's unrecognized-app warning. A successful build, checksum, or self-signed development certificate is not a trusted publisher signature.

## Intended signing route

The project may apply to the SignPath Foundation open-source code-signing programme after it has independently confirmed that it meets every current eligibility condition.

If accepted, the release notice will use the provider's required wording:

> Free code signing provided by SignPath.io, certificate by SignPath Foundation

This wording describes a future conditional plan only. It must not be used to imply that AURIX has been accepted, that a certificate has been issued, or that any binary has been signed.

## Current release status

- Windows desktop builds are produced by GitHub Actions from this repository.
- The current Windows ZIP is unsigned.
- No SignPath project, signing policy, production certificate, signing token, or signing approval is configured.
- No private signing key or signing credential is stored in this repository.
- A build must not be labelled signed until its Authenticode signature has been independently verified.

## Eligibility and governance gates

Before applying, the project maintainers must review the current SignPath Foundation conditions and confirm, rather than assume, all of the following:

1. The project has an OSI-approved open-source licence covering all project components, with no incompatible proprietary or dual-licensed project code.
2. The project has an actual, documented public release and a download page explaining the software.
3. The project is actively maintained and its source/build provenance can be verified.
4. The project meets the Foundation's security, account MFA, review, author, reviewer and signing-approver requirements.
5. The project publishes a complete privacy policy covering the desktop app and any third-party providers or services that users may connect.
6. The project accepts the Foundation's technical constraints, including manual approval for every production signing request.

**No licence is selected by this document.** Choosing and applying an open-source licence grants legal permissions to others and must be an informed decision by the project owner with any required parent/guardian guidance. Until a compatible licence is actually adopted, AURIX must not claim to meet the Foundation's open-source licence requirement.

## Signing controls if approved

- Only binaries built from AURIX's own reviewed source may be submitted.
- Production signing must happen through the provider's approved trusted-build integration.
- The signing private key must remain in the provider's hardware security module; it must never be exported into this repository or an ordinary CI secret.
- API tokens, project identifiers and signing-policy identifiers must be stored only in the approved secret/configuration facilities after onboarding.
- Each release signing request requires an authorised human approver.
- The release pipeline must verify the resulting Authenticode signature and publisher identity before publishing a signed-status claim.
- Unsigned builds must remain clearly labelled as unsigned.

## Project roles

No SignPath signing team has been created yet. The repository owner/maintainer remains responsible for deciding who may author, review and approve releases. Named SignPath roles and access permissions will be published here only after the project is accepted and those members have explicitly agreed to their responsibilities.

## Privacy

A complete public privacy policy is a prerequisite for application. This policy does not substitute for it. The project must document what information stays local, what is sent to connected providers when the user requests a networked feature, and the applicable third-party privacy terms before applying.

## Official programme information

- [SignPath Foundation](https://signpath.org/)
- [Eligibility and programme conditions](https://signpath.org/terms)
- [Microsoft: Windows code-signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
