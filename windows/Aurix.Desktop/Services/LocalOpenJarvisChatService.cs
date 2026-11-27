using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Aurix.Desktop.Services;

/// <summary>
/// Optional local-only connection to the Stanford OpenJarvis API.
/// This adapter is chat-only: it never exposes desktop tools or executes actions.
/// </summary>
public sealed class LocalOpenJarvisChatService
{
    private static readonly Uri BaseUri = new("http://127.0.0.1:8000/");
    private static readonly HttpClient Client = new()
    {
        Timeout = TimeSpan.FromSeconds(90)
    };

    public async Task<string> CheckAsync(CancellationToken cancellationToken = default)
    {
        using var health = await SendAsync(HttpMethod.Get, "health", null, cancellationToken);
        using var healthDoc = await JsonDocument.ParseAsync(
            await health.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
        if (healthDoc.RootElement.TryGetProperty("status", out var status) &&
            status.ValueKind == JsonValueKind.String &&
            !string.Equals(status.GetString(), "ok", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("OpenJarvis is running but its local inference engine is not healthy.");

        using var models = await SendAsync(HttpMethod.Get, "v1/models", null, cancellationToken);
        using var modelsDoc = await JsonDocument.ParseAsync(
            await models.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
        var model = FindFirstModel(modelsDoc.RootElement);
        if (string.IsNullOrWhiteSpace(model))
            throw new InvalidOperationException("OpenJarvis is responding, but no local model is available. Install or download a model in OpenJarvis first.");

        return $"Stanford OpenJarvis is ready. Local model: {model}. Chat stays on this computer.";
    }

    public async Task<string> ChatAsync(
        IReadOnlyList<LocalCodexMessage> messages,
        CancellationToken cancellationToken = default)
    {
        var dialogue = messages
            .Where(message => (message.Role == "user" || message.Role == "assistant") &&
                              !string.IsNullOrWhiteSpace(message.Content))
            .TakeLast(10)
            .Select(message => new { role = message.Role, content = message.Content.Trim() })
            .ToArray();

        var total = dialogue.Sum(message => message.content.Length);
        if (dialogue.Length == 0 || dialogue[^1].role != "user" || total > 6_000)
            throw new ArgumentException("OpenJarvis chat requires a final user message and no more than 6,000 characters of recent conversation.");

        using var models = await SendAsync(HttpMethod.Get, "v1/models", null, cancellationToken);
        using var modelsDoc = await JsonDocument.ParseAsync(
            await models.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
        var model = FindFirstModel(modelsDoc.RootElement);
        if (string.IsNullOrWhiteSpace(model))
            throw new InvalidOperationException("OpenJarvis has no available local model.");

        var payload = new
        {
            model,
            messages = new[]
            {
                new
                {
                    role = "system",
                    content = "You are AURIX's local conversational assistant powered by Stanford OpenJarvis. Answer questions helpfully. You are chat-only: do not claim to control the computer, do not issue commands, and do not claim that any desktop action has happened. AURIX handles computer actions separately with its own validation and approval controls."
                }
            }.Concat(dialogue).ToArray(),
            temperature = 0.2,
            max_tokens = 700,
            stream = false,
            tools = (object?)null
        };

        using var response = await SendAsync(HttpMethod.Post, "v1/chat/completions", payload, cancellationToken);
        using var document = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
        var content = document.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString();

        if (string.IsNullOrWhiteSpace(content))
            throw new InvalidOperationException("OpenJarvis returned an empty response.");
        return content.Length > 12_000 ? content[..12_000] : content;
    }

    private static string? FindFirstModel(JsonElement root)
    {
        if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
            return null;
        foreach (var item in data.EnumerateArray())
        {
            if (item.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String)
            {
                var value = id.GetString();
                if (!string.IsNullOrWhiteSpace(value) && value.Length <= 200)
                    return value;
            }
        }
        return null;
    }

    private static async Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        string relativePath,
        object? body,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, new Uri(BaseUri, relativePath));
        var apiKey = Environment.GetEnvironmentVariable("OPENJARVIS_API_KEY");
        if (!string.IsNullOrWhiteSpace(apiKey) && apiKey.Length <= 512)
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey.Trim());

        if (body is not null)
            request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

        HttpResponseMessage response;
        try
        {
            response = await Client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("OpenJarvis did not respond within 90 seconds.");
        }
        catch (HttpRequestException)
        {
            throw new InvalidOperationException("Could not reach Stanford OpenJarvis at 127.0.0.1:8000. Start its local API server and make sure it is bound to 127.0.0.1.");
        }

        if (response.IsSuccessStatusCode)
            return response;

        var statusCode = response.StatusCode;
        var message = statusCode == HttpStatusCode.Unauthorized
            ? "OpenJarvis requires an API key. Set OPENJARVIS_API_KEY for AURIX and restart it."
            : $"OpenJarvis returned HTTP {(int)statusCode}. Check its local server log and model status.";
        response.Dispose();
        throw new InvalidOperationException(message);
    }
}
