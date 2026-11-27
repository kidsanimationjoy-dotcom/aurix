[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$PublishDirectory
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath $PublishDirectory).Path
$requiredFiles = @(
    'Aurix.Desktop.exe',
    'README.txt',
    'Run-AURIX-Readiness.cmd',
    'SHA256SUMS.txt',
    'RELEASE-STATUS.txt',
    'diagnostics/Test-AurixReadiness.ps1'
)

foreach ($relativePath in $requiredFiles) {
    $candidate = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw "Required release file is missing: $relativePath"
    }
}

$checksumPath = Join-Path $root 'SHA256SUMS.txt'
$checksumText = Get-Content -LiteralPath $checksumPath -Raw
$checksumMatch = [regex]::Match(
    $checksumText,
    '(?im)^([0-9a-f]{64})\s+Aurix\.Desktop\.exe\s*$'
)
if (-not $checksumMatch.Success) {
    throw 'SHA256SUMS.txt does not contain a valid executable checksum entry.'
}

$expectedHash = $checksumMatch.Groups[1].Value.ToLowerInvariant()
$actualHash = (Get-FileHash -LiteralPath (Join-Path $root 'Aurix.Desktop.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
    throw "Executable checksum mismatch. Expected $expectedHash; received $actualHash."
}

$releaseNotice = Get-Content -LiteralPath (Join-Path $root 'RELEASE-STATUS.txt') -Raw
foreach ($requiredPhrase in @(
    'UNSIGNED',
    'Do not disable Microsoft Defender or SmartScreen',
    'portable preview package, not an installer'
)) {
    if (-not $releaseNotice.Contains($requiredPhrase)) {
        throw "Release notice is missing required safety text: $requiredPhrase"
    }
}

$launcher = Get-Content -LiteralPath (Join-Path $root 'Run-AURIX-Readiness.cmd') -Raw
if ($launcher -notmatch '(?i)Aurix\.Desktop\.exe' -or $launcher -notmatch '(?i)--readiness-check') {
    throw 'The one-click readiness launcher must start the native AURIX executable in readiness-check mode.'
}
if ($launcher -match '(?i)powershell\.exe|ExecutionPolicy') {
    throw 'The one-click readiness launcher must not depend on PowerShell or alter script execution policy.'
}

Write-Host 'AURIX portable release package validation passed.'
Write-Host "Files checked: $($requiredFiles.Count)"
Write-Host "Aurix.Desktop.exe SHA-256: $actualHash"
Write-Host 'Publisher status remains UNSIGNED; this is not a public-launch installer.'
