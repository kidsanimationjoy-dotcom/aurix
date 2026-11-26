using System.Text.RegularExpressions;

namespace Aurix.Desktop.Services;

public enum DesktopTaskStepKind
{
    LaunchApplication,
    InspectWindows
}

public sealed record DesktopTaskStep(
    DesktopTaskStepKind Kind,
    string Description,
    string? Executable = null);

public sealed record DesktopTaskPlan(
    bool IsValid,
    string Summary,
    IReadOnlyList<DesktopTaskStep> Steps,
    string? Error = null);

public static class DesktopTaskPlanner
{
    private static readonly Dictionary<string, (string DisplayName, string Executable)> Applications =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["notepad"] = ("Notepad", "notepad.exe"),
            ["calculator"] = ("Calculator", "calc.exe"),
            ["calc"] = ("Calculator", "calc.exe"),
            ["paint"] = ("Paint", "mspaint.exe"),
            ["mspaint"] = ("Paint", "mspaint.exe"),
            ["file explorer"] = ("File Explorer", "explorer.exe"),
            ["explorer"] = ("File Explorer", "explorer.exe"),
            ["edge"] = ("Microsoft Edge", "msedge.exe"),
            ["microsoft edge"] = ("Microsoft Edge", "msedge.exe"),
            ["chrome"] = ("Google Chrome", "chrome.exe"),
            ["google chrome"] = ("Google Chrome", "chrome.exe"),
            ["terminal"] = ("Windows Terminal", "wt.exe"),
            ["windows terminal"] = ("Windows Terminal", "wt.exe"),
            ["discord"] = ("Discord", "Discord.exe"),
            ["spotify"] = ("Spotify", "Spotify.exe")
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
            return new DesktopTaskPlan(
                true,
                "Read-only inspection: list the titles of visible open windows on this PC.",
                new[] { new DesktopTaskStep(DesktopTaskStepKind.InspectWindows, "Inspect visible open windows") });
        }

        var launchText = Regex.Replace(
            normalized,
            @"^(please\s+)?(open|launch|start)\s+",
            string.Empty,
            RegexOptions.IgnoreCase);

        if (string.Equals(launchText, normalized, StringComparison.OrdinalIgnoreCase))
            return Invalid("For this first build, try “Open Calculator and Notepad” or “Show open windows”.");

        var parts = Regex.Split(launchText, @"\s*(?:,|;|\band then\b|\bthen\b|\band\b)\s*",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        var steps = new List<DesktopTaskStep>();
        foreach (var rawPart in parts)
        {
            var appName = rawPart.Trim().Trim('.', '!', '?');
            appName = Regex.Replace(appName, @"^(the|a|an)\s+", string.Empty, RegexOptions.IgnoreCase);

            if (!Applications.TryGetValue(appName, out var app))
                return Invalid($"I don't have an approved launcher for “{appName}”. Available apps: Notepad, Calculator, Paint, File Explorer, Edge, Chrome, Windows Terminal, Discord and Spotify.");

            steps.Add(new DesktopTaskStep(
                DesktopTaskStepKind.LaunchApplication,
                $"Open {app.DisplayName}",
                app.Executable));
        }

        if (steps.Count == 0)
            return Invalid("I couldn't find an application to open.");

        var summary = "AURIX will run these local steps:\n" +
            string.Join("\n", steps.Select((step, index) => $"{index + 1}. {step.Description}")) +
            "\n\nOnly the listed applications will be launched. No shell command or model-generated script will run.";

        return new DesktopTaskPlan(true, summary, steps);
    }

    private static DesktopTaskPlan Invalid(string message)
        => new(false, "No task plan created.", Array.Empty<DesktopTaskStep>(), message);
}
