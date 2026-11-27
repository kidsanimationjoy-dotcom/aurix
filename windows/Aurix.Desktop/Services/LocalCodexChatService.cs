using System.Net.Http;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Aurix.Desktop.Services;

public sealed record LocalCodexMessage(string Role, string Content);

public sealed record LocalCodexStatus(
    bool CompanionConnected,
    bool Installed,
    bool SignedIn,
    bool ProfilePrepared,
    bool SandboxVerified,
    string Message)
{
    public bool CanChat => CompanionConnected && Installed && SignedIn && ProfilePrepared && SandboxVerified;
}

/// <summary>
/// Uses only the authenticated loopback AURIX companion and its read-only Codex chat route.
/// It never invokes a shell, exposes provider credentials, or grants desktop-control access.
/// </summary>
public sealed class LocalCodexChatService
{
    private const string BaseUrl = "http://127.0.0.1:4317";
    private static readonly HttpClient Client = new()
    {
        Timeout = TimeSpan.FromSeconds(130)
    };

    public async Task<LocalCodexStatus> CheckAsync(string token, CancellationToken cancellationToken = default)
    {
        ValidateToken(token);
        using var health = await SendAsync(HttpMethod.Get, "/v1/health", token, null, cancellationToken);
        using var healthDocument = await JsonDocument.ParseAsync(await health.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var root = healthDocument.RootElement;
        if (!root.TryGetProperty("service", out var service) || service.GetString() != "aurix-companion" ||
            !root.TryGetProperty("apiVersion", out var version) || version.GetInt32() != 1)
            throw new InvalidOperationException("The local service is not a compatible AURIX companion.");

        var supportsChat = root.TryGetProperty("capabilities", out var capabilities) &&
            capabilities.ValueKind == JsonValueKind.Array &&
            capabilities.EnumerateArray().Any(value =>
                value.ValueKind == JsonValueKind.String && value.GetString() == "cli.codex.chat");
        if (!supportsChat)
            throw new InvalidOperationException("This local companion does not advertise the required read-only Codex chat capability. Update the companion first.");

        using var status = await SendAsync(HttpMethod.Get, "/v1/codex/status", token, null, cancellationToken);
        using var statusDocument = await JsonDocument.ParseAsync(await status.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var value = statusDocument.RootElement;
        var installed = ReadBool(value, "installed");
        var signedIn = ReadBool(value, "signedIn");
        var prepared = ReadBool(value, "profilePrepared");
        var sandbox = ReadBool(value, "sandboxVerified");
        var message = ReadString(value, "message") ?? "Local Codex status checked.";
        return new LocalCodexStatus(true, installed, signedIn, prepared, sandbox, message);
    }

    public async Task<LocalCodexStatus> PrepareAsync(string token, CancellationToken cancellationToken = default)
    {
        ValidateToken(token);
        using var response = await SendAsync(
            HttpMethod.Post,
            "/v1/codex/prepare",
            token,
            new { },
            cancellationToken,
            timeout: TimeSpan.FromSeconds(120));
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var value = document.RootElement;
        if (!ReadBool(value, "profilePrepared") || !ReadBool(value, "sandboxVerified"))
            throw new InvalidOperationException(ReadString(value, "message") ?? "AURIX could not verify the local Codex sandbox.");
        return await CheckAsync(token, cancellationToken);
    }

    public async Task<string> StartLoginAsync(string token, CancellationToken cancellationToken = default)
    {
        ValidateToken(token);
        using var response = await SendAsync(HttpMethod.Post, "/v1/codex/login", token, new { }, cancellationToken);
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        return ReadString(document.RootElement, "message") ?? "Complete the official Codex sign-in in the local companion terminal.";
    }

    public async Task<string> ChatAsync(string token, IReadOnlyList<LocalCodexMessage> messages, CancellationToken cancellationToken = default)
    {
        ValidateToken(token);
        if (messages.Count == 0)
            throw new ArgumentException("Add a voice chat message before sending.", nameof(messages));

        var boundedInput = messages.TakeLast(12)
            .Where(message => (message.Role == "system" || message.Role == "user" || message.Role == "assistant") &&
                !string.IsNullOrWhiteSpace(message.Content))
            .Select(message => new LocalCodexMessage(message.Role, message.Content.Trim()))
            .ToList();
        var systemContext = boundedInput.Where(message => message.Role == "system").TakeLast(1).ToList();
        var dialogue = boundedInput.Where(message => message.Role != "system").ToList();
        var totalCharacters = systemContext.Sum(message => message.Content.Length) +
            dialogue.Sum(message => message.Content.Length);
        while (dialogue.Count > 1 && totalCharacters > 5_000)
        {
            totalCharacters -= dialogue[0].Content.Length;
            dialogue.RemoveAt(0);
        }
        if (dialogue.Count == 0 || dialogue[^1].Content.Length > 5_000 ||
            totalCharacters > 5_000 || dialogue[^1].Role != "user")
            throw new ArgumentException("The final voice chat message must be a user request, and the request plus context must be 5,000 characters or fewer.", nameof(messages));
        var bounded = systemContext.Concat(dialogue).ToList();

        using var response = await SendAsync(
            HttpMethod.Post,
            "/v1/codex/chat",
            token,
            new { messages = bounded.Select(message => new { role = message.Role, content = message.Content }).ToArray() },
            cancellationToken,
            timeout: TimeSpan.FromSeconds(130));
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var content = ReadString(document.RootElement, "content");
        if (string.IsNullOrWhiteSpace(content))
            throw new InvalidOperationException("Codex returned an empty response.");
        return content.Length > 20_000 ? content[..20_000] : content;
    }

    private static async Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        string route,
        string token,
        object? body,
        CancellationToken cancellationToken,
        TimeSpan? timeout = null)
    {
        using var request = new HttpRequestMessage(method, BaseUrl + route);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.Trim());
        if (body is not null)
            request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

        using var timeoutSource = timeout is null ? null : new CancellationTokenSource(timeout.Value);
        using var linked = timeoutSource is null
            ? CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, CancellationToken.None)
            : CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutSource.Token);
        HttpResponseMessage response;
        try
        {
            response = await Client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, linked.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("The local AURIX companion did not respond in time.");
        }
        catch (HttpRequestException)
        {
            throw new InvalidOperationException("Could not reach AURIX at 127.0.0.1:4317. Start the local companion and check its pairing token.");
        }

        if (response.IsSuccessStatusCode)
            return response;

        var message = $"Local AURIX request failed (HTTP {(int)response.StatusCode}).";
        try
        {
            using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            message = ReadString(document.RootElement, "message") ?? message;
        }
        catch
        {
            // Keep the safe status-only fallback.
        }
        response.Dispose();
        if (response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == HttpStatusCode.Forbidden)
            throw new UnauthorizedAccessException("The local companion rejected the pairing token. Pair AURIX again.");
        throw new InvalidOperationException(message);
    }

    private static void ValidateToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 512)
            throw new ArgumentException("Enter the pairing token printed by the local AURIX companion.", nameof(token));
    }

    private static bool ReadBool(JsonElement value, string name)
        => value.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.True;

    private static string? ReadString(JsonElement value, string name)
        => value.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;
}
