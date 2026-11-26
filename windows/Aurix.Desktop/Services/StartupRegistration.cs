using System.IO;
using Microsoft.Win32;

namespace Aurix.Desktop.Services;

public sealed record StartupResult(bool Success, string Message);

public static class StartupRegistration
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "AURIXDesktop";

    public static StartupResult Enable()
    {
        var executable = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executable) ||
            !Path.GetFileName(executable).Equals("Aurix.Desktop.exe", StringComparison.OrdinalIgnoreCase))
        {
            return new(false, "Publish and run Aurix.Desktop.exe before enabling automatic startup. This avoids registering the .NET development host by mistake.");
        }

        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: true)
                            ?? Registry.CurrentUser.CreateSubKey(RunKey, writable: true);
            key.SetValue(ValueName, '"' + executable + '" --background');
            return new(true, "AURIX will start when you sign in to Windows. You can disable this later in Windows Settings > Apps > Startup.");
        }
        catch (UnauthorizedAccessException)
        {
            return new(false, "Windows denied access to the current-user startup setting.");
        }
        catch (Exception ex)
        {
            return new(false, $"Could not enable startup: {ex.Message}");
        }
    }

    public static void Disable()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: true);
        key?.DeleteValue(ValueName, throwOnMissingValue: false);
    }
}
