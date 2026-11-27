using Microsoft.Win32;

namespace Aurix.Desktop.Services;

/// <summary>
/// Stores the user's explicit hands-free opt-in for the current Windows account.
/// </summary>
public static class WakeWordSettings
{
    private const string SettingsPath = @"Software\AURIX\Desktop";
    private const string ValueName = "WakeWordEnabled";

    public static bool IsEnabled
    {
        get
        {
            try
            {
                using var key = Registry.CurrentUser.OpenSubKey(SettingsPath, writable: false);
                return Convert.ToInt32(key?.GetValue(ValueName, 0) ?? 0) == 1;
            }
            catch
            {
                return false;
            }
        }
    }

    public static bool SetEnabled(bool enabled)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(SettingsPath, writable: true);
            if (key is null)
                return false;

            key.SetValue(ValueName, enabled ? 1 : 0, RegistryValueKind.DWord);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
