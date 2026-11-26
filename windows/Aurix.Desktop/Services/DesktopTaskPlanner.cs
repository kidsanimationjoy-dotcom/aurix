using System.Text.RegularExpressions;

namespace Aurix.Desktop.Services;

public enum DesktopTaskStepKind
{
    LaunchApplication,
    InspectWindows,
    InspectControls,
    ClickButton,
    TypeText
}

public sealed record DesktopTaskStep(
    DesktopTaskStepKind Kind,
    string Description,
    string? Executable = null,
    string? TargetApp = null,
    string? TargetName = null,
    string? InputText = null);

public sealed record DesktopTaskPlan(
    bool IsValid,
    string Summary,
    IReadOnlyList<DesktopTaskStep> Steps,
    string? Error = null);

public static class DesktopTaskPlanner
{
    private static readonly Dictionary<string, (string DisplayName, string Executable, string[] ProcessNames)> Applications =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["notepad"] = ("Notepad", "notepad.exe", new[] { "notepad" }),
            ["calculator"] = ("Calculator", "calc.exe", new[] { "CalculatorApp", "calc" }),
            ["calc"] = ("Calculator", "calc.exe", new[] { "CalculatorApp", "calc" }),
            ["paint"] = ("Paint", "mspaint.exe", new[] { "mspaint" }),
            ["mspaint"] = ("Paint", "mspaint.exe", new[] { "mspaint" }),
            ["file explorer"] = ("File Explorer", "explorer.exe", new[] { "explorer" }),
            ["explorer"] = ("File Explorer", "explorer.exe", new[] { "explorer" }),
            ["edge"] = ("Microsoft Edge", "msedge.exe", new[] { "msedge" }),
            ["microsoft edge"] = ("Microsoft Edge", "msedge.exe", new[] { "msedge" }),
            ["chrome"] = ("Google Chrome", "chrome.exe", new[] { "chrome" }),
            ["google chrome"] = ("Google Chrome", "chrome.exe", new[] { "chrome" }),
            ["terminal"] = ("Windows Terminal", "wt.exe", new[] { "WindowsTerminal", "wt" }),
            ["windows terminal"] = ("Windows Terminal", "wt.exe", new[] { "WindowsTerminal", "wt" }),
            ["discord"] = ("Discord", "Discord.exe", new[] { "Discord" }),
            ["spotify"] = ("Spotify", "Spotify.exe", new[] { "Spotify" })
        };

    public static DesktopTaskPlan CreatePlan(string? userText)
    {
        var command = (userText ?? string.Empty).Trim();
        if (command.Length == 0)
            return Invalid("Type or say a task first.");

        var normalized = Regex.Replace(command, @"\s+", " ").Trim();

        if (Regex.IsMatch(normalized,
            @"^(show|list|inspect)( me)? (the )?(open )?(windows|apps|applications)$",
            RegexOptions.IgnoreCase)
            || Regex.IsMatch(normalized, @"^what (apps|windows|applications) are open\??$",
                RegexOptions.IgnoreCase))
        {
            return Valid(
                "Read-only inspection: list the titles of visible open windows on this PC.",
                new DesktopTaskStep(DesktopTaskStepKind.InspectWindows, "Inspect visible open windows"));
        }

        var inspectMatch = Regex.Match(normalized, @"^inspect controls in (?<app>.+)$", RegexOptions.IgnoreCase);
        if (inspectMatch.Success)
        {
            if (!TryGetApplication(inspectMatch.Groups["app"].Value, out var inspectApp))
                return Invalid("Choose an app AURIX supports, such as Notepad, Edge, Chrome, Paint, Calculator, Discord or Spotify.");

            return Valid(
                $"Read-only inspection: list accessible control names in {inspectApp.DisplayName}. Field values and password controls are not read.",
                new DesktopTaskStep(DesktopTaskStepKind.InspectControls, $"Inspect controls in {inspectApp.DisplayName}", TargetApp: inspectApp.DisplayName));
        }

        var clickMatch = Regex.Match(
            normalized,
            @"^click button ""(?<button>[^""]+)"" in (?<app>.+)$",
            RegexOptions.IgnoreCase);
        if (clickMatch.Success)
        {
            var buttonName = clickMatch.Groups["button"].Value.Trim();
            if (buttonName.Length == 0)
                return Invalid("Name the button you want AURIX to click.");

            if (!TryGetApplication(clickMatch.Groups["app"].Value, out var clickApp))
                return Invalid("Choose a supported target app, such as Notepad, Edge, Chrome, Paint, Calculator, Discord or Spotify.");

            return Valid(
                $"AURIX will locate the exact visible button “{buttonName}” in {clickApp.DisplayName}. It will ask for your approval before clicking.",
                new DesktopTaskStep(
                    DesktopTaskStepKind.ClickButton,
                    $"Click button “{buttonName}” in {clickApp.DisplayName}",
                    TargetApp: clickApp.DisplayName,
                    TargetName: buttonName));
        }

        var typeMatch = Regex.Match(
            normalized,
            @"^type ""(?<text>[^""]*)"" into ""(?<control>[^""]+)"" in (?<app>.+)$",
            RegexOptions.IgnoreCase);
        if (typeMatch.Success)
        {
            var inputText = typeMatch.Groups["text"].Value;
            var controlName = typeMatch.Groups["control"].Value.Trim();
            if (controlName.Length == 0 || inputText.Length == 0)
                return Invalid("Include both the text and the exact field name.");

            if (!TryGetApplication(typeMatch.Groups["app"].Value, out var typeApp))
                return Invalid("Choose a supported target app, such as Notepad, Edge, Chrome, Paint, Calculator, Discord or Spotify.");

            return Valid(
                $"AURIX will locate the editable field “{controlName}” in {typeApp.DisplayName}, show you the text and ask for approval before replacing the field value.",
                new DesktopTaskStep(
                    DesktopTaskStepKind.TypeText,
                    $"Type text into “{controlName}” in {typeApp.DisplayName}",
                    TargetApp: typeApp.DisplayName,
                    TargetName: controlName,
                    InputText: inputText));
        }

        var launchText = Regex.Replace(
            normalized,
            @"^(please\s+)?(open|launch|start)\s+",
            string.Empty,
            RegexOptions.IgnoreCase);

        if (string.Equals(launchText, normalized, StringComparison.OrdinalIgnoreCase))
            return Invalid("Try “Open Calculator and Notepad”, “Show open windows”, “Inspect controls in Notepad”, “Click button \"Save\" in Notepad”, or “Type \"Hello\" into \"Text Editor\" in Notepad”.");

        var parts = Regex.Split(launchText, @"\s*(?:,|;|\band then\b|\bthen\b|\band\b)\s*",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        var steps = new List<DesktopTaskStep>();
        foreach (var rawPart in parts)
        {
            var appName = rawPart.Trim().Trim('.', '!', '?');
            appName = Regex.Replace(appName, @"^(the|a|an)\s+", string.Empty, RegexOptions.IgnoreCase);

            if (!TryGetApplication(appName, out var app))
                return Invalid($"I don't have an approved launcher for “{appName}”. Available apps: Notepad, Calculator, Paint, File Explorer, Edge, Chrome, Windows Terminal, Discord and Spotify.");

            steps.Add(new DesktopTaskStep(
                DesktopTaskStepKind.LaunchApplication,
                $"Open {app.DisplayName}",
                app.Executable));
        }

        return steps.Count == 0
            ? Invalid("I couldn't find an application to open.")
            : Valid(
                "AURIX will run these local steps:\n" +
                string.Join("\n", steps.Select((step, index) => $"{index + 1}. {step.Description}")) +
                "\n\nOnly the listed applications will be launched. No shell command or model-generated script will run.",
                steps.ToArray());
    }

    private static bool TryGetApplication(
        string name,
        out (string DisplayName, string Executable, string[] ProcessNames) app)
    {
        var normalized = Regex.Replace(name.Trim(), @"^(the|a|an)\s+", string.Empty, RegexOptions.IgnoreCase);
        return Applications.TryGetValue(normalized, out app);
    }

    private static DesktopTaskPlan Valid(string summary, params DesktopTaskStep[] steps)
        => new(true, summary, steps);

    private static DesktopTaskPlan Invalid(string message)
        => new(false, "No task plan created.", Array.Empty<DesktopTaskStep>(), message);
}
