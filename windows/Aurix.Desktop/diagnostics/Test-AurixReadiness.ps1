#requires -Version 5.1
<#
.SYNOPSIS
  Read-only preflight for the AURIX Windows desktop companion.
.DESCRIPTION
  Reports Windows, microphone endpoint, local English speech recognizer, and
  microphone privacy-policy signals. It does not open the microphone, record
  audio, change settings, install software, or bypass Windows security.
#>
[CmdletBinding()]
param(
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet('PASS','WARN','INFO')][string]$Status,
        [Parameter(Mandatory)][string]$Details
    )
    $checks.Add([pscustomobject]@{
        Check = $Name
        Status = $Status
        Details = $Details
    })
}

try {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem
    $version = [version]$os.Version
    if ($version -ge [version]'10.0.19041') {
        Add-Check 'Windows version' 'PASS' "$($os.Caption), build $($os.BuildNumber)"
    } else {
        Add-Check 'Windows version' 'WARN' "$($os.Caption), build $($os.BuildNumber). AURIX packaging targets Windows 10 2004 / Windows 11 or later."
    }
} catch {
    Add-Check 'Windows version' 'WARN' "Could not read Windows version: $($_.Exception.Message)"
}

try {
    if ([Environment]::Is64BitOperatingSystem) {
        Add-Check 'System architecture' 'PASS' '64-bit Windows detected.'
    } else {
        Add-Check 'System architecture' 'WARN' '32-bit Windows detected; the published preview is Windows x64.'
    }
} catch {
    Add-Check 'System architecture' 'WARN' 'Could not determine system architecture.'
}

try {
    $audioEndpoints = @(Get-PnpDevice -Class AudioEndpoint -ErrorAction Stop |
        Where-Object { $_.Status -eq 'OK' })
    $micEndpoints = @($audioEndpoints | Where-Object {
        $_.FriendlyName -match '(?i)microphone|mic array|input'
    })
    if ($micEndpoints.Count -gt 0) {
        $names = ($micEndpoints | Select-Object -ExpandProperty FriendlyName -Unique) -join '; '
        Add-Check 'Microphone endpoint' 'PASS' "Windows reports: $names"
    } elseif ($audioEndpoints.Count -gt 0) {
        $names = ($audioEndpoints | Select-Object -ExpandProperty FriendlyName -Unique) -join '; '
        Add-Check 'Microphone endpoint' 'WARN' "Audio endpoints exist, but none is clearly named as a microphone. Check Windows Input settings. Available endpoints: $names"
    } else {
        Add-Check 'Microphone endpoint' 'WARN' 'No active audio endpoints were reported by Windows. Connect or enable a microphone in Windows Settings.'
    }
} catch {
    Add-Check 'Microphone endpoint' 'WARN' "Could not enumerate audio endpoints. Check Windows Settings > System > Sound > Input. Detail: $($_.Exception.Message)"
}

try {
    Add-Type -AssemblyName System.Speech -ErrorAction Stop
    $recognizers = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
    $english = @($recognizers | Where-Object { $_.Culture.Name -match '^en(-|$)' })
    if ($english.Count -gt 0) {
        $names = ($english | ForEach-Object { "$($_.Culture.Name) ($($_.Description))" }) -join '; '
        Add-Check 'Offline English speech recognizer' 'PASS' "Installed: $names"
    } else {
        Add-Check 'Offline English speech recognizer' 'WARN' 'No installed English System.Speech recognizer was found. Install an English speech recognition language through Windows settings, then rerun this check.'
    }
} catch {
    Add-Check 'Offline English speech recognizer' 'WARN' "System.Speech recognizer check was unavailable: $($_.Exception.Message)"
}

try {
    $policyPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy'
    $policy = Get-ItemProperty -Path $policyPath -ErrorAction SilentlyContinue
    if ($null -ne $policy -and $null -ne $policy.LetAppsAccessMicrophone) {
        switch ([int]$policy.LetAppsAccessMicrophone) {
            0 { Add-Check 'Microphone privacy policy' 'WARN' 'A device policy denies microphone access to apps. Ask the device administrator to review it.' }
            1 { Add-Check 'Microphone privacy policy' 'INFO' 'A device policy allows microphone access to apps. Per-app and desktop-app settings may still apply.' }
            2 { Add-Check 'Microphone privacy policy' 'WARN' 'A device policy forces microphone access off for apps.' }
            default { Add-Check 'Microphone privacy policy' 'INFO' "Unrecognised policy value: $($policy.LetAppsAccessMicrophone)" }
        }
    } else {
        Add-Check 'Microphone privacy policy' 'INFO' 'No machine-wide microphone policy value was found. This does not prove that microphone permission is enabled.'
    }
} catch {
    Add-Check 'Microphone privacy policy' 'INFO' 'Could not read the optional machine-wide microphone policy.'
}

Add-Check 'Privacy and safety' 'PASS' 'This preflight is read-only. It does not open the microphone, record or upload audio, change privacy settings, or bypass SmartScreen/Defender.'
Add-Check 'Live wake-word test' 'INFO' 'Not tested by this script. After AURIX is safely installed, enable hands-free yourself, say “AURIX”, speak one harmless test instruction, then pause listening.'

if ($Json) {
    ConvertTo-Json -InputObject @($checks.ToArray()) -Depth 4
} else {
    Write-Host ''
    Write-Host 'AURIX WINDOWS READINESS CHECK' -ForegroundColor Cyan
    Write-Host 'Read-only diagnostics; no microphone recording or settings changes.'
    Write-Host ''
    $checks | Format-Table -Wrap -AutoSize
    Write-Host ''
    Write-Host 'A warning is a prompt to check Windows settings, not proof that AURIX is broken.'
}
