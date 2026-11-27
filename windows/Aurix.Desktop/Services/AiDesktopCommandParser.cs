using System.Text.Json;
using System.Text.RegularExpressions;

namespace Aurix.Desktop.Services;

public sealed record AiDesktopInterpretation(bool IsPlan, string Message, DesktopTaskPlan? Plan);

/// <summary>
/// Strictly validates the JSON proposal returned by local Codex. Only the
/// native desktop planner's allowlisted actions and application names survive.
/// </summary>
public static class AiDesktopCommandParser
{
    private const int MaxSteps = 5;
    private static readonly Regex ExternalImpactButton = new(
        @"\b(send|submit|publish|post|share|pay|purchase|buy|transfer|checkout|order|subscribe|confirm)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static AiDesktopInterpretation Parse(string response)
    {
        if (string.IsNullOrWhiteSpace(response) || response.Length > 20_000)
            throw new InvalidOperationException("Codex returned an empty or oversized desktop proposal.");

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(response, new JsonDocumentOptions { MaxDepth = 12 });
        }
        catch (JsonException)
        {
            throw new InvalidOperationException("Codex did not return the required plain JSON proposal. No desktop action was taken.");
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("type", out var typeElement) ||
                typeElement.ValueKind != JsonValueKind.String)
                throw new InvalidOperationException("The Codex proposal has an invalid format. No desktop action was taken.");

            var type = typeElement.GetString();
            if (type == "answer")
            {
                RequireOnlyProperties(root, "type", "message");
                var message = RequiredString(root, "message", 1, 5_000).Trim();
                return new AiDesktopInterpretation(false, message, null);
            }

            if (type != "desktop_plan")
                throw new InvalidOperationException("Codex proposed an unsupported response type. No desktop action was taken.");

            RequireOnlyProperties(root, "type", "summary", "steps");
            var summary = RequiredString(root, "summary", 1, 500).Trim();
            if (summary.Length == 0)
                throw new InvalidOperationException("The desktop proposal summary cannot be blank.");
            if (!root.TryGetProperty("steps", out var stepsElement) ||
                stepsElement.ValueKind != JsonValueKind.Array ||
                stepsElement.GetArrayLength() is < 1 or > MaxSteps)
                throw new InvalidOperationException("A desktop proposal must contain between one and five supported steps.");

            var steps = new List<DesktopTaskStep>();
            foreach (var stepElement in stepsElement.EnumerateArray())
                steps.Add(ParseStep(stepElement));

            var planSummary = "AI proposal — " + summary + Environment.NewLine +
                string.Join(Environment.NewLine, steps.Select((step, index) => $"{index + 1}. {step.Description}")) +
                Environment.NewLine + Environment.NewLine +
                "Only these validated AURIX actions are eligible to run. Review and approve the complete plan first.";
            return new AiDesktopInterpretation(true, string.Empty, new DesktopTaskPlan(true, planSummary, steps));
        }
    }

    private static DesktopTaskStep ParseStep(JsonElement item)
    {
        if (item.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException("A proposed desktop step is not an object.");

        var kind = RequiredString(item, "kind", 1, 40);
        switch (kind)
        {
            case "launch_application":
            {
                RequireOnlyProperties(item, "kind", "app");
                var app = ResolveApp(RequiredString(item, "app", 1, 80));
                return new DesktopTaskStep(
                    DesktopTaskStepKind.LaunchApplication,
                    "Open " + app.DisplayName,
                    app.Executable);
            }
            case "inspect_windows":
                RequireOnlyProperties(item, "kind");
                return new DesktopTaskStep(
                    DesktopTaskStepKind.InspectWindows,
                    "Inspect visible open windows");
            case "inspect_controls":
            {
                RequireOnlyProperties(item, "kind", "app");
                var app = ResolveApp(RequiredString(item, "app", 1, 80));
                return new DesktopTaskStep(
                    DesktopTaskStepKind.InspectControls,
                    "Inspect controls in " + app.DisplayName,
                    TargetApp: app.DisplayName);
            }
            case "click_button":
            {
                RequireOnlyProperties(item, "kind", "app", "button");
                var app = ResolveUiApp(RequiredString(item, "app", 1, 80), "click buttons");
                var button = RequiredString(item, "button", 1, 100).Trim();
                if (button.Length == 0)
                    throw new InvalidOperationException("The proposed button name cannot be blank.");
                if (ExternalImpactButton.IsMatch(button))
                    throw new InvalidOperationException("AURIX refuses AI-proposed buttons that could send, publish, share, pay, purchase, transfer, order, subscribe or confirm an external action.");
                return new DesktopTaskStep(
                    DesktopTaskStepKind.ClickButton,
                    "Click button “" + button + "” in " + app.DisplayName,
                    TargetApp: app.DisplayName,
                    TargetName: button);
            }
            case "type_text":
            {
                RequireOnlyProperties(item, "kind", "app", "control", "text");
                var app = ResolveUiApp(RequiredString(item, "app", 1, 80), "enter text");
                var control = RequiredString(item, "control", 1, 100).Trim();
                var text = RequiredString(item, "text", 1, 1_000);
                if (control.Length == 0)
                    throw new InvalidOperationException("The proposed editable field name cannot be blank.");
                return new DesktopTaskStep(
                    DesktopTaskStepKind.TypeText,
                    "Type approved text into “" + control + "” in " + app.DisplayName,
                    TargetApp: app.DisplayName,
                    TargetName: control,
                    InputText: text);
            }
            default:
                throw new InvalidOperationException("Codex proposed an unsupported desktop action: " + kind + ".");
        }
    }


    private static (string DisplayName, string Executable, string[] ProcessNames) ResolveUiApp(string name, string action)
    {
        var app = ResolveApp(name);
        // AI-proposed UI mutations are restricted to Notepad in this release.
        // Browser and messaging clients can navigate, submit forms, or transmit
        // content through controls that are difficult to classify safely.
        if (!string.Equals(app.DisplayName, "Notepad", StringComparison.Ordinal))
            throw new InvalidOperationException("AI-proposed UI actions are currently limited to Notepad. " +
                "AURIX will not " + action + " in browsers, messaging apps, or other connected applications.");
        return app;
    }

    private static (string DisplayName, string Executable, string[] ProcessNames) ResolveApp(string name)
    {
        if (DesktopTaskPlanner.TryGetApplication(name, out var app))
            return app;
        throw new InvalidOperationException("Codex proposed an app that AURIX does not support: " + name + ".");
    }

    private static string RequiredString(JsonElement element, string name, int minLength, int maxLength)
    {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
            throw new InvalidOperationException("The Codex proposal is missing the required " + name + " field.");
        var text = value.GetString() ?? string.Empty;
        var hasForbiddenControl = text.Any(character =>
            char.IsControl(character) &&
            !(name == "text" && (character == '\r' || character == '\n' || character == '\t')));
        if (text.Length < minLength || text.Length > maxLength || hasForbiddenControl)
            throw new InvalidOperationException("The Codex proposal contains an invalid " + name + " field.");
        return text;
    }

    private static void RequireOnlyProperties(JsonElement element, params string[] allowed)
    {
        var set = new HashSet<string>(allowed, StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            if (!set.Contains(property.Name))
                throw new InvalidOperationException("The Codex proposal contains an unexpected field. No desktop action was taken.");
            if (!seen.Add(property.Name))
                throw new InvalidOperationException("The Codex proposal contains a duplicate field. No desktop action was taken.");
        }
        foreach (var name in allowed)
        {
            if (name != "type" && !element.TryGetProperty(name, out _))
                throw new InvalidOperationException("The Codex proposal is missing the required " + name + " field.");
        }
    }
}
