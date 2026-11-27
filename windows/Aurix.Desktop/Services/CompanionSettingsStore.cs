using System.Security.Cryptography;
using System.Text;

namespace Aurix.Desktop.Services;

/// <summary>
/// Stores the local companion pairing token encrypted for the current Windows user.
/// The token is never written to the task audit log or exposed in UI status text.
/// </summary>
public static class CompanionSettingsStore
{
    private static readonly string SettingsDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "AURIX",
        "Desktop");

    private static readonly string TokenPath = Path.Combine(SettingsDirectory, "companion-token.bin");

    public static string LoadToken()
    {
        try
        {
            if (!File.Exists(TokenPath))
                return string.Empty;

            var encrypted = File.ReadAllBytes(TokenPath);
            var clear = ProtectedData.Unprotect(encrypted, optionalEntropy: null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(clear);
        }
        catch (CryptographicException)
        {
            return string.Empty;
        }
        catch (IOException)
        {
            return string.Empty;
        }
        catch (UnauthorizedAccessException)
        {
            return string.Empty;
        }
    }

    public static void SaveToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 512)
            throw new ArgumentException("Enter a valid local companion pairing token.", nameof(token));

        Directory.CreateDirectory(SettingsDirectory);
        var clear = Encoding.UTF8.GetBytes(token.Trim());
        var encrypted = ProtectedData.Protect(clear, optionalEntropy: null, DataProtectionScope.CurrentUser);
        var temporaryPath = TokenPath + ".tmp";
        File.WriteAllBytes(temporaryPath, encrypted);
        File.Move(temporaryPath, TokenPath, overwrite: true);
        CryptographicOperations.ZeroMemory(clear);
    }

    public static void ClearToken()
    {
        try
        {
            if (File.Exists(TokenPath))
                File.Delete(TokenPath);
        }
        catch (IOException)
        {
            // A failed clear is surfaced by the caller when a new token is saved.
        }
        catch (UnauthorizedAccessException)
        {
            // Do not expose the previous token in UI or logs.
        }
    }
}
