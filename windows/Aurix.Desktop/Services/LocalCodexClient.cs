using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;

namespace Aurix.Desktop.Services;

public sealed record LocalCodexHealth(string Version, IReadOnlyList<string> Capabilities);
public sealed record LocalCodexStatus(bool Installed, bool SignedIn, bool SandboxVerified, string State, string Message);
public sealed record LocalCodexPrepareResult(bool ProfilePrepared, bool SandboxVerified, string Message);

/// <summary>
/// Stores the local companion pairing token encrypted for the current Windows user.
/// The token is never written to the AURIX task audit log.
/// </summary>
public static class LocalCompanionSettings
{
    private const string SettingsPath = @"Software\AURIX\Desktop\LocalCompanion";
    private const string UrlValue = "Url";
    private const string TokenValue = "ProtectedToken";

    public static bool TrySave(string url, string token, out string error)
    {
        error = string.Empty;
        if (!LocalCodexClient.TryValidateEndpoint(url, out var endpoint))
        {
            error = "Use an HTTP loopback URL such as http://127.0.0.1:4317. Remote hosts are not accepted.";
            return false;
        }

        var cleanToken = (token ?? string.Empty).Trim();
        if (cleanToken.Length < 16 || cleanToken.Length > 300 ||
            cleanToken.Any(char.IsControl))
        {
            error = "Enter the pairing token printed by your local AURIX companion.";
            return false;
        }

        try
        {
            var protectedToken = ProtectedData.Protect(
                Encoding.UTF8.GetBytes(cleanToken),
                optionalEntropy: null,
                DataProtectionScope.CurrentUser);

            using var key = Registry.CurrentUser.CreateSubKey(SettingsPath, writable: true);
            if (key is null)
            {
                error = "Windows could not create the local AURIX settings key.";
                return false;
            }

            key.SetValue(UrlValue, endpoint.ToString().TrimEnd('/'), RegistryValueKind.String);
            key.SetValue(TokenValue, protectedToken, RegistryValueKind.Binary);
            return true;
        }
        catch (Exception)
        {
            error = "Windows could not protect and save the local companion pairing token.";
            return false;
        }
    }

    public static bool TryLoad(out string url, out string token, out string error)
    {
        url = string.Empty;
        token = string.Empty;
        error = string.Empty;

        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(SettingsPath, writable: false);
            if (key is null)
                return false;

            var savedUrl = key.GetValue(UrlValue) as string;
            var protectedToken = key.GetValue(TokenValue) as byte[];
            if (string.IsNullOrWhiteSpace(savedUrl) || protectedToken is null || protectedToken.Length == 0)
                return false;

            if (!LocalCodexClient.TryValidateEndpoint(savedUrl, out var endpoint))
            {
                error = "The saved companion address is not a permitted loopback URL. Re-enter its local address.";
                return false;
            }

            var bytes = ProtectedData.Unprotect(
                protectedToken,
                optionalEntropy: null,
                DataProtectionScope.CurrentUser);
            var decoded = Encoding.UTF8.GetString(bytes);
            if (decoded.Length < 16 || decoded.Length > 300 || decoded.Any(char.IsControl))
            {
                error = "The saved pairing token is invalid. Pair the local companion again.";
                return false;
            }

            url = endpoint.ToString().TrimEnd('/');
            token = decoded;
            return true;
        }
        catch (CryptographicException)
        {
            error = "Windows could not decrypt the saved pairing token for this account. Pair the companion again.";
            return false;
        }
        catch (Exception)
        {
            error = "The saved local companion settings could not be read.";
            return false;
        }
    }

    public static void Clear()
    {
        try { Registry.CurrentUser.DeleteSubKeyTree(SettingsPath, throwOnMissingSubKey: false); }
        catch { }
    }
}

/// <summary>
/// Authenticated client for the companion's existing loopback-only Codex API.
/// This client cannot contact remote hosts or invoke arbitrary companion routes.
/// </summary>
public sealed class LocalCodexClient
{
    private static readonly HttpClient Http = new()
    {
        Timeout = Timeout.InfiniteTimeSpan
    };

    private readonly Uri _baseUri;
    private readonly string _token;

    private LocalCodexClient(Uri baseUri, string token)
    {
        _baseUri = baseUri;
        _token = token;
    }

    public static bool TryCreate(string url, string token, out LocalCodexClient? client, out string error)
    {
        client = null;
        error = string.Empty;
        if (!TryValidateEndpoint(url, out var endpoint))
        {
            error = "The companion address must be an HTTP loopback URL on this computer.";
            return false;
        }

        var cleanToken = (token ?? string.Empty).Trim();
        if (cleanToken.Length < 16 || cleanToken.Length > 300 || cleanToken.Any(char.IsControl))
        {
            error = "Enter the pairing token printed by the local AURIX companion.";
            return false;
        }

        client = new LocalCodexClient(endpoint, cleanToken);
        return true;
    }

    public static bool TryValidateEndpoint(string? value, out Uri endpoint)
    {
        endpoint = null!;
        if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var parsed))
            return false;

        // Uri.IsLoopback accepts localhost, 127.0.0.0/8 and ::1. No HTTPS
        // proxy, non-loopback hostname, credentials, path, query or fragment is allowed.
        if (!parsed.IsLoopback ||
            !string.Equals(parsed.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) ||
            !string.IsNullOrEmpty(parsed.UserInfo) ||
            (parsed.AbsolutePath != "/" && parsed.AbsolutePath.Length != 0) ||
            !string.IsNullOrEmpty(parsed.Query) ||
            !string.IsNullOrEmpty(parsed.Fragment) ||
            parsed.Port < 1 || parsed.Port > 65535)
            return false;

        endpoint = new Uri(parsed.GetLeftPart(UriPartial.Authority) + "/");
        return true;
    }

    public async Task<LocalCodexHealth> CheckHealthAsync(CancellationToken cancellationToken = default)
    {
        using var document = await SendAsync(HttpMethod.Get, "/v1/health", null, 8_000, cancellationToken);
        var root = document.RootElement;
        if (GetString(root, "service") != "aurix-companion" ||
            GetInt(root, "apiVersion") != 1)
            throw new InvalidOperationException("The local service is not a compatible AURIX companion.");

        var capabilities = new List<string>();
        if (root.TryGetProperty("capabilities", out var array) && array.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in array.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String)
                {
                    var value = item.GetString();
                    if (!string.IsNullOrWhiteSpace(value))
                        capabilities.Add(value);
                }
            }
        }

        return new LocalCodexHealth(GetString(root, "version"), capabilities);
    }

    public async Task<LocalCodexStatus> GetCodexStatusAsync(CancellationToken cancellationToken = default)
    {
        using var document = await SendAsync(HttpMethod.Get, "/v1/codex/status", null, 10_000, cancellationToken);
        var root = document.RootElement;
        return new LocalCodexStatus(
            GetBool(root, "installed"),
            GetBool(root, "signedIn"),
            GetBool(root, "sandboxVerified"),
            GetString(root, "state"),
            GetString(root, "message"));
    }

    public async Task<LocalCodexPrepareResult> PrepareCodexAsync(CancellationToken cancellationToken = default)
    {
        using var document = await SendAsync(
            HttpMethod.Post, "/v1/codex/prepare", new { }, 90_000, cancellationToken);
        var root = document.RootElement;
        return new LocalCodexPrepareResult(
            GetBool(root, "profilePrepared"),
            GetBool(root, "sandboxVerified"),
            GetString(root, "message"));
    }

    public async Task<string> StartCodexLoginAsync(CancellationToken cancellationToken = default)
    {
        using var document = await SendAsync(
            HttpMethod.Post, "/v1/codex/login", null, 12_000, cancellationToken);
        return GetString(document.RootElement, "message");
    }

    public async Task<string> InterpretDesktopInstructionAsync(
        string instruction,
        CancellationToken cancellationToken = default)
    {
        var cleanInstruction = (instruction ?? string.Empty).Trim();
        if (cleanInstruction.Length == 0 || cleanInstruction.Length > 4_000)
            throw new ArgumentException("Speak or type an instruction between 1 and 4,000 characters.");

        const string systemPrompt = """
You translate a user's natural-language desktop request into a proposal for AURIX.
Return exactly one raw JSON object and no Markdown or code fence.

Allowed response formats:
{"type":"answer","message":"A brief response when no supported desktop action is requested."}
{"type":"desktop_plan","summary":"A short description","steps":[
  {"kind":"launch_application","app":"Calculator"},
  {"kind":"inspect_windows"},
  {"kind":"inspect_controls","app":"Notepad"},
  {"kind":"click_button","app":"Notepad","button":"Save"},
  {"kind":"type_text","app":"Notepad","control":"Text Editor","text":"Hello"}
]}

Only these exact step kinds and fields are permitted. Use only these supported app names:
Notepad, Calculator, Paint, File Explorer, Microsoft Edge, Google Chrome, Windows Terminal, Discord, Spotify.
Use 1 to 5 steps. If the request cannot be represented exactly with these actions, return type "answer" and explain the limitation.
Do not invent buttons or controls; use the exact names supplied by the user. Do not propose password, PIN, payment, recovery-code or secret fields. Do not propose delete, remove, erase, format, wipe, uninstall or reset actions. Do not propose shell commands, scripts, arbitrary file access, network access, browser navigation, purchases, payments, message sending, publishing, or account changes.
This is a proposal only. AURIX independently validates every field and asks the user before carrying out any AI-proposed plan. Never claim that an action has already happened.
""";

        var payload = new
        {
            messages = new[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = cleanInstruction }
            }
        };

        using var document = await SendAsync(
            HttpMethod.Post, "/v1/codex/chat", payload, 135_000, cancellationToken);
        var root = document.RootElement;
        if (!GetBool(root, "ok"))
            throw new InvalidOperationException("The local Codex service did not confirm a successful response.");
        var content = GetString(root, "content");
        if (string.IsNullOrWhiteSpace(content))
            throw new InvalidOperationException("Codex returned an empty response.");
        return content;
    }

    private async Task<JsonDocument> SendAsync(
        HttpMethod method,
        string route,
        object? payload,
        int timeoutMs,
        CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(timeoutMs);

        using var request = new HttpRequestMessage(method, new Uri(_baseUri, route));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (payload is not null)
        {
            request.Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json");
        }

        HttpResponseMessage response;
        try
        {
            response = await Http.SendAsync(
                request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("The local AURIX companion did not respond before the time limit.");
        }
        catch (HttpRequestException)
        {
            throw new InvalidOperationException("Could not reach the local AURIX companion. Check that it is running on this computer.");
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync(timeout.Token);
            JsonDocument document;
            try { document = JsonDocument.Parse(body); }
            catch
            {
                throw new InvalidOperationException("The local AURIX companion returned an invalid response.");
            }

            if (!response.IsSuccessStatusCode)
            {
                var message = GetString(document.RootElement, "message");
                var code = GetString(document.RootElement, "error");
                document.Dispose();
                if (response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == HttpStatusCode.Forbidden)
                    throw new InvalidOperationException("The companion rejected the pairing token. Check the token and allowed origin.");
                throw new InvalidOperationException(
                    string.IsNullOrWhiteSpace(message)
                        ? "The local Codex request was not accepted (" + (string.IsNullOrWhiteSpace(code) ? ((int)response.StatusCode).ToString() : code) + ")."
                        : message);
            }

            return document;
        }
    }

    private static string GetString(JsonElement element, string name)
        => element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;

    private static bool GetBool(JsonElement element, string name)
        => element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;

    private static int GetInt(JsonElement element, string name)
        => element.TryGetProperty(name, out var value) && value.TryGetInt32(out var number) ? number : 0;
}
