using System.IO;
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
    private static readonly string TemporaryTokenPath = TokenPath + ".tmp";

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
        try
        {
            var encrypted = ProtectedData.Protect(clear, optionalEntropy: null, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(TemporaryTokenPath, encrypted);
            File.Move(TemporaryTokenPath, TokenPath, overwrite: true);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(clear);
        }
    }

    public static bool ClearToken()
    {
        try
        {
            if (File.Exists(TokenPath))
                File.Delete(TokenPath);
            if (File.Exists(TemporaryTokenPath))
                File.Delete(TemporaryTokenPath);

            return !File.Exists(TokenPath) && !File.Exists(TemporaryTokenPath);
        }
        catch (IOException)
        {
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
    }
}
