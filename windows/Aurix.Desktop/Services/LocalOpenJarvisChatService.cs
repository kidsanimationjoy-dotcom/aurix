using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Aurix.Desktop.Services;

/// <summary>
/// Local-only connection to the Stanford OpenJarvis API. This service submits
/// AURIX's constrained reasoning contract and receives text/structured plans;
/// it never exposes desktop tools or executes computer actions.
/// </summary>
public sealed class LocalOpenJarvisChatService
{
    private static readonly Uri BaseUri = new("http://127.0.0.1:8000/");
    private static readonly HttpClient Client = new()
    {
        Timeout = TimeSpan.FromSeconds(90)
    };
    private static readonly HttpClient ProbeClient = new()
    {
        Timeout = TimeSpan.FromSeconds(3)
    };

    /// <summary>
    /// Returns true when something is responding on the local OpenJarvis API
    /// endpoint. Any HTTP response counts as a response; the full health and
    /// model checks remain in CheckAsync.
    /// </summary>
    public async Task<bool> IsApiServerRespondingAsync(CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(BaseUri, "health"));
        var apiKey = Environment.GetEnvironmentVariable("OPENJARVIS_API_KEY");
        if (!string.IsNullOrWhiteSpace(apiKey) && apiKey.Length <= 512)
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey.Trim());

        try
        {
            using var response = await ProbeClient.SendAsync(
                request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            return true;
        }
        catch (HttpRequestException)
        {
            return false;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return false;
        }
    }

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
        var systemContext = messages
            .Where(message => message.Role == "system" && !string.IsNullOrWhiteSpace(message.Content))
            .TakeLast(1)
            .Select(message => new { role = message.Role, content = message.Content.Trim() })
            .ToArray();
        var dialogue = messages
            .Where(message => (message.Role == "user" || message.Role == "assistant") &&
                              !string.IsNullOrWhiteSpace(message.Content))
            .TakeLast(9)
            .Select(message => new { role = message.Role, content = message.Content.Trim() })
            .ToArray();

        var total = systemContext.Sum(message => message.content.Length) +
                    dialogue.Sum(message => message.content.Length);
        if (systemContext.Length != 1 || dialogue.Length == 0 ||
            dialogue[^1].role != "user" || total > 8_000)
            throw new ArgumentException(
                "OpenJarvis requires AURIX's system contract, a final user message, and no more than 8,000 characters of recent context.");

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
                    content = "You are AURIX's primary local reasoning engine, powered by Stanford OpenJarvis. Follow the next AURIX system contract exactly. Return only the requested JSON object. Do not call tools, use built-in agent actions, execute commands, or claim that a desktop action has happened. AURIX independently parses and validates every proposal and asks the user before any supported computer action."
                }
            }.Concat(systemContext).Concat(dialogue).ToArray(),
            temperature = 0.1,
            max_tokens = 1_000,
            stream = false
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
