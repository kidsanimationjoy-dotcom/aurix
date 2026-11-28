using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace Aurix.Desktop.Services;

/// <summary>
/// Direct local-only Ollama chat fallback. It uses the OpenAI-compatible
/// loopback endpoint and never sends prompts to a remote host.
/// </summary>
public sealed class LocalOllamaChatService
{
    private static readonly Uri BaseUri = new("http://127.0.0.1:11434/");
    private static readonly HttpClient Client = new()
    {
        Timeout = TimeSpan.FromSeconds(120)
    };

    public async Task<string> CheckAsync(CancellationToken cancellationToken = default)
    {
        var model = await FindModelAsync(cancellationToken);
        return $"Local Ollama is ready. Model: {model}. Prompts stay on this computer.";
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
                "Ollama requires AURIX's system contract, a final user message, and no more than 8,000 characters of recent context.");

        var model = await FindModelAsync(cancellationToken);
        var payload = new
        {
            model,
            messages = new[]
            {
                new
                {
                    role = "system",
                    content = "You are AURIX's local reasoning engine. Follow AURIX's system contract exactly. Return only the requested JSON object. Do not call tools, execute commands, or claim that a desktop action has happened. AURIX independently validates every proposal and asks the user before any supported computer action."
                }
            }.Concat(systemContext).Concat(dialogue).ToArray(),
            temperature = 0.1,
            max_tokens = 1_000,
            stream = false
        };

        using var request = new HttpRequestMessage(
            HttpMethod.Post, new Uri(BaseUri, "v1/chat/completions"));
        request.Content = new StringContent(
            JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await SendAsync(request, cancellationToken);
        using var document = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);

        if (!document.RootElement.TryGetProperty("choices", out var choices) ||
            choices.ValueKind != JsonValueKind.Array || choices.GetArrayLength() == 0 ||
            !choices[0].TryGetProperty("message", out var message) ||
            !message.TryGetProperty("content", out var content) ||
            content.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(content.GetString()))
            throw new InvalidOperationException("Ollama returned an empty or unsupported chat response.");

        var result = content.GetString()!;
        return result.Length > 12_000 ? result[..12_000] : result;
    }

    private static async Task<string> FindModelAsync(CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(BaseUri, "api/tags"));
        using var response = await SendAsync(request, cancellationToken);
        using var document = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);

        if (!document.RootElement.TryGetProperty("models", out var models) ||
            models.ValueKind != JsonValueKind.Array)
            throw new InvalidOperationException("Ollama is responding, but its installed-model list is unavailable.");

        var names = models.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.Object &&
                           item.TryGetProperty("name", out var name) &&
                           name.ValueKind == JsonValueKind.String)
            .Select(item => item.GetProperty("name").GetString())
            .Where(name => !string.IsNullOrWhiteSpace(name) && name!.Length <= 200)
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (names.Length == 0)
            throw new InvalidOperationException(
                "Ollama is running, but no local model is installed. Install a model such as qwen3.5:2b, then try again.");

        return names
            .OrderBy(name => string.Equals(name, "qwen3.5:2b", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
            .ThenBy(name => name, StringComparer.OrdinalIgnoreCase)
            .First();
    }

    private static async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await Client.SendAsync(
                request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (response.IsSuccessStatusCode)
                return response;

            var status = (int)response.StatusCode;
            response.Dispose();
            throw new InvalidOperationException(
                $"Ollama returned HTTP {status}. Check that its local service is running and that the selected model is installed.");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("Ollama did not respond within 120 seconds.");
        }
        catch (HttpRequestException)
        {
            throw new InvalidOperationException(
                "Could not reach local Ollama at 127.0.0.1:11434. Install Ollama for Windows, start its local service and install a model.");
        }
    }
}