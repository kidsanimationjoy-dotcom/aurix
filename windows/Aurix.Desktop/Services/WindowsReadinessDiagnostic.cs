using System.Runtime.InteropServices;
using System.Speech.Recognition;
using Microsoft.Win32;

namespace Aurix.Desktop.Services;

/// <summary>
/// Performs read-only Windows readiness checks. It enumerates input-device
/// availability but never opens an audio device or captures microphone data.
/// </summary>
internal static class WindowsReadinessDiagnostic
{
    private const string MicrophonePolicyPath = @"SOFTWARE\Policies\Microsoft\Windows\AppPrivacy";

    [DllImport("winmm.dll", EntryPoint = "waveInGetNumDevs", ExactSpelling = true)]
    private static extern uint WaveInGetNumDevs();

    public static string CreateReport()
    {
        var lines = new List<string>
        {
            "AURIX WINDOWS READINESS CHECK",
            "Read-only preflight. It does not open the microphone, record or upload audio, or change Windows settings.",
            string.Empty
        };

        AddCheck(lines, "Windows version", CheckWindowsVersion());
        AddCheck(lines, "System architecture", Environment.Is64BitOperatingSystem
            ? ("PASS", "64-bit Windows detected; the published application is Windows x64.")
            : ("WARN", "32-bit Windows detected; the published application requires Windows x64."));
        AddCheck(lines, "Microphone device", CheckInputDevices());
        AddCheck(lines, "Offline English speech recognizer", CheckEnglishRecognizer());
        AddCheck(lines, "Microphone privacy policy", CheckMicrophonePolicy());

        AddCheck(lines, "Live microphone and wake-word test", ("INFO",
            "Not tested. This check does not activate the microphone. Actual microphone permission and wake-word accuracy require a later test on this computer."));
        lines.Add(string.Empty);
        lines.Add("A warning means you should review the indicated Windows settings; it does not mean AURIX changed anything.");
        return string.Join(Environment.NewLine, lines);
    }

    private static (string Status, string Details) CheckWindowsVersion()
    {
        var version = Environment.OSVersion.Version;
        return version >= new Version(10, 0, 19041)
            ? ("PASS", $"Windows {version.Major}.{version.Minor}, build {version.Build}.")
            : ("WARN", $"Detected Windows version {version}. AURIX targets Windows 10 version 2004 (build 19041) or later.");
    }

    private static (string Status, string Details) CheckInputDevices()
    {
        try
        {
            var count = WaveInGetNumDevs();
            return count > 0
                ? ("PASS", $"Windows reports {count} waveform-audio input device(s). Presence does not prove that microphone permission is enabled or that recording works.")
                : ("WARN", "Windows reports no waveform-audio input devices, or the device query could not determine a count. Check Settings > System > Sound > Input.");
        }
        catch (DllNotFoundException)
        {
            return ("WARN", "The Windows multimedia device query was unavailable. Check Settings > System > Sound > Input.");
        }
        catch (EntryPointNotFoundException)
        {
            return ("WARN", "The Windows multimedia device query was unavailable. Check Settings > System > Sound > Input.");
        }
    }

    private static (string Status, string Details) CheckEnglishRecognizer()
    {
        try
        {
            var english = SpeechRecognitionEngine.InstalledRecognizers()
                .Where(recognizer =>
                    recognizer.Culture.Name.Equals("en", StringComparison.OrdinalIgnoreCase) ||
                    recognizer.Culture.Name.StartsWith("en-", StringComparison.OrdinalIgnoreCase))
                .Select(recognizer => $"{recognizer.Culture.Name} ({recognizer.Description})")
                .ToArray();

            return english.Length > 0
                ? ("PASS", "Installed: " + string.Join("; ", english))
                : ("WARN", "No installed English System.Speech recognizer was found. Add an English speech-recognition language in Windows settings.");
        }
        catch (Exception ex)
        {
            return ("WARN", "The installed speech-recognizer list could not be read (" + ex.GetType().Name + ").");
        }
    }

    private static (string Status, string Details) CheckMicrophonePolicy()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(MicrophonePolicyPath, writable: false);
            var value = key?.GetValue("LetAppsAccessMicrophone");
            if (value is null)
                return ("INFO", "No machine-wide LetAppsAccessMicrophone policy value was found. This does not prove that microphone permission is enabled.");

            if (!int.TryParse(value.ToString(), out var policyValue))
                return ("INFO", "A machine-wide microphone policy exists but its value was not recognised.");

            return policyValue switch
            {
                0 => ("INFO", "Policy is User in control. Review Windows Settings > Privacy & security > Microphone."),
                1 => ("INFO", "Policy is Force Allow for Windows apps. Per-app, desktop-app and other device policies may still apply."),
                2 => ("WARN", "Policy is Force Deny for Windows apps. Ask the device administrator to review it; AURIX has not changed the policy."),
                _ => ("INFO", $"Unrecognised machine-wide microphone policy value: {policyValue}.")
            };
        }
        catch (UnauthorizedAccessException)
        {
            return ("INFO", "Windows did not allow this optional machine-wide policy to be read.");
        }
        catch (System.Security.SecurityException)
        {
            return ("INFO", "Windows did not allow this optional machine-wide policy to be read.");
        }
    }

    private static void AddCheck(List<string> lines, string name, (string Status, string Details) check)
        => lines.Add($"[{check.Status}] {name}: {check.Details}");
}
