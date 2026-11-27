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

    public static AiDesktopInterpretation Parse(string response, string userPrompt)
    {
        if (string.IsNullOrWhiteSpace(userPrompt) || userPrompt.Length > 4_000)
            throw new InvalidOperationException("The original user instruction is empty or oversized. No desktop action was taken.");

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
                steps.Add(ParseStep(stepElement, userPrompt));

            var planSummary = "AI proposal — " + summary + Environment.NewLine +
                string.Join(Environment.NewLine, steps.Select((step, index) => $"{index + 1}. {step.Description}")) +
                Environment.NewLine + Environment.NewLine +
                "Only these validated AURIX actions are eligible to run. Review and approve the complete plan first.";
            return new AiDesktopInterpretation(true, string.Empty, new DesktopTaskPlan(true, planSummary, steps));
        }
    }



    private static string[] GetApplicationAliases(string displayName)
        => displayName switch
        {
            "Notepad" => new[] { "Notepad" },
            "Calculator" => new[] { "Calculator", "Calc" },
            "Paint" => new[] { "Paint" },
            "File Explorer" => new[] { "File Explorer", "Explorer" },
            "Microsoft Edge" => new[] { "Microsoft Edge", "Edge" },
            "Google Chrome" => new[] { "Google Chrome", "Chrome" },
            "Windows Terminal" => new[] { "Windows Terminal", "Terminal" },
            "Discord" => new[] { "Discord" },
            "Spotify" => new[] { "Spotify" },
            _ => Array.Empty<string>()
        };

    private static bool HasNegationBeforeAction(string userPrompt, int actionIndex)
    {
        var clauseStart = userPrompt.LastIndexOfAny(new[] { '.', '!', '?', ';', '\r', '\n' },
            Math.Max(0, actionIndex - 1));
        var prefix = userPrompt[(clauseStart + 1)..actionIndex];
        return Regex.IsMatch(prefix,
            @"\b(?:don't|do not|never|avoid|shouldn't|should not|can't|cannot|must not|not)\b[\s\S]{0,40}$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    private static bool ExplicitlyRequestedAppLaunch(string displayName, string userPrompt)
    {
        foreach (var alias in GetApplicationAliases(displayName))
        {
            var escapedAlias = Regex.Escape(alias);
            var pattern = @"\b(?:open|launch|start)\b(?<between>[^.!?;\r\n]{0,72})(?<![\p{L}\p{N}_])" +
                escapedAlias + @"(?![\p{L}\p{N}_])";

            foreach (Match match in Regex.Matches(userPrompt, pattern,
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            {
                if (HasNegationBeforeAction(userPrompt, match.Index))
                    continue;
                if (Regex.IsMatch(match.Groups["between"].Value,
                    @"\b(?:don't|do not|never|avoid|shouldn't|should not|can't|cannot|must not|not)\b",
                    RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
                    continue;
                return true;
            }
        }

        return false;
    }

    private static bool ExplicitlyRequestedWindowInspection(string userPrompt)
    {
        var asked =
            Regex.IsMatch(userPrompt,
                @"\b(?:show|list|inspect)\b[^.!?;\r\n]{0,40}\b(?:open\s+)?(?:windows|apps|applications)\b",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant) ||
            Regex.IsMatch(userPrompt,
                @"\bwhat\s+(?:apps|windows|applications)\s+are\s+(?:currently\s+)?open\b",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        if (!asked)
            return false;

        var action = Regex.Match(userPrompt, @"\b(?:show|list|inspect|what)\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        return action.Success && !HasNegationBeforeAction(userPrompt, action.Index);
    }

    private static bool ExplicitlyRequestedControlInspection(string displayName, string userPrompt)
    {
        foreach (var alias in GetApplicationAliases(displayName))
        {
            var escapedAlias = Regex.Escape(alias);
            var pattern = @"\b(?:inspect|show|list)\b[^.!?;\r\n]{0,48}\b(?:accessible\s+)?(?:controls|buttons|fields)\b" +
                @"[^.!?;\r\n]{0,56}(?<![\p{L}\p{N}_])" + escapedAlias + @"(?![\p{L}\p{N}_])";

            foreach (Match match in Regex.Matches(userPrompt, pattern,
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            {
                var action = Regex.Match(match.Value, @"\b(?:inspect|show|list)\b",
                    RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
                if (!action.Success || HasNegationBeforeAction(userPrompt, match.Index + action.Index))
                    continue;
                return true;
            }
        }

        return false;
    }

    private static bool ExplicitlyRequestedButton(string button, string userPrompt)
    {
        if (!userPrompt.Contains("Notepad", StringComparison.OrdinalIgnoreCase))
            return false;

        // Require an action verb followed by the exact button label. This
        // prevents "open Notepad" from authorizing a click on a button named "Open".
        if (Regex.IsMatch(userPrompt,
            @"\b(?:don't|do not|never|avoid|shouldn't|should not|can't|cannot|must not)\b[\s\S]{0,40}\b(?:click|press|select|activate)\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return false;

        var escapedButton = Regex.Escape(button.Trim());
        var pattern = @"\b(?:click|press|select|activate)\b[\s\S]{0,48}(?<![\p{L}\p{N}_])" +
            escapedButton +
            @"(?:[""']?\s*button)?\s+(?:in|on|within|inside)\s+(?:the\s+)?Notepad\b";
        return Regex.IsMatch(userPrompt, pattern,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }


    private static bool ContainsExactTargetLabel(string label, string userPrompt, string allowedContinuation)
    {
        var escapedLabel = Regex.Escape(label.Trim());
        var pattern = @"(?<![\p{L}\p{N}_])" + escapedLabel +
            @"(?=(?:[""']?\s*(?:" + allowedContinuation + @")\b|[""']?\s*(?:[.,!?;:]|$)))";
        return Regex.IsMatch(userPrompt, pattern,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    private static bool ContainsExactTextValue(string text, string userPrompt)
    {
        // The full supplied value must end at a phrase boundary. This rejects
        // model-truncated values such as "Hello" when the user said "Hello World".
        var escapedText = Regex.Escape(text);
        var pattern = @"(?<![\p{L}\p{N}_])" + escapedText +
            @"(?=(?:[""']?\s*(?:into|in|to|inside|within|for|as)\b|[""']?\s*(?:[.,!?;:]|$)))";
        return Regex.IsMatch(userPrompt, pattern, RegexOptions.CultureInvariant);
    }

    private static bool ExplicitlyRequestedTextEntry(string control, string text, string userPrompt)
    {
        if (!userPrompt.Contains("Notepad", StringComparison.OrdinalIgnoreCase) ||
            !ContainsExactTextValue(text, userPrompt))
            return false;

        if (Regex.IsMatch(userPrompt,
            @"\b(?:don't|do not|never|avoid|shouldn't|should not|can't|cannot|must not)\b[\s\S]{0,40}\b(?:type|enter|write|paste|fill|put|insert|replace)\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return false;

        // Require one explicit instruction in which the requested value is
        // the thing being entered into the named Notepad field.
        var valueStart = userPrompt.IndexOf(text, StringComparison.Ordinal);
        if (valueStart < 0)
            return false;

        var beforeValue = userPrompt[..valueStart];
        if (!Regex.IsMatch(beforeValue,
            @"\b(?:type|enter|write|paste|fill|put|insert|replace)\b[\s\S]{0,80}$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return false;

        var afterValue = userPrompt[(valueStart + text.Length)..];
        if (!Regex.IsMatch(afterValue,
            @"^\s*[""']?\s*(?:into|in|to|inside|within)\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return false;

        var escapedControl = Regex.Escape(control.Trim());
        var controlPattern = @"(?<![\p{L}\p{N}_])" + escapedControl +
            @"(?=(?:[""']?\s*(?:field|control|box|in|on|within|at)\b|[""']?\s*(?:[.,!?;:]|$)))";
        var controlMatch = Regex.Match(afterValue, controlPattern,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (!controlMatch.Success || controlMatch.Index > 48)
            return false;

        var afterControl = afterValue[(controlMatch.Index + controlMatch.Length)..];
        return Regex.IsMatch(afterControl,
            @"^\s*[""']?\s*in\b[\s\S]{0,30}\bNotepad\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    private static DesktopTaskStep ParseStep(JsonElement item, string userPrompt)
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
                if (!ExplicitlyRequestedAppLaunch(app.DisplayName, userPrompt))
                    throw new InvalidOperationException("AURIX refuses to launch an app unless the user explicitly asked to open that app in the latest instruction.");
                return new DesktopTaskStep(
                    DesktopTaskStepKind.LaunchApplication,
                    "Open " + app.DisplayName,
                    app.Executable);
            }
            case "inspect_windows":
                RequireOnlyProperties(item, "kind");
                if (!ExplicitlyRequestedWindowInspection(userPrompt))
                    throw new InvalidOperationException("AURIX refuses to inspect open windows unless the user explicitly requested that inspection.");
                return new DesktopTaskStep(
                    DesktopTaskStepKind.InspectWindows,
                    "Inspect visible open windows");
            case "inspect_controls":
            {
                RequireOnlyProperties(item, "kind", "app");
                var app = ResolveApp(RequiredString(item, "app", 1, 80));
                if (!ExplicitlyRequestedControlInspection(app.DisplayName, userPrompt))
                    throw new InvalidOperationException("AURIX refuses to inspect controls unless the user explicitly requested controls in that app.");
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
                if (!ExplicitlyRequestedButton(button, userPrompt))
                    throw new InvalidOperationException("AURIX refuses to click a button unless the user explicitly named that button in the latest instruction.");
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
                if (!ExplicitlyRequestedTextEntry(control, text, userPrompt))
                    throw new InvalidOperationException("AURIX refuses to enter model-invented text or target an unnamed field. The exact text and field must appear in the latest user instruction.");
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
