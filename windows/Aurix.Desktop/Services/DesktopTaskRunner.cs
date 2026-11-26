using System.Diagnostics;

namespace Aurix.Desktop.Services;

public sealed record DesktopTaskResult(bool Success, bool Cancelled, string Output);

public static class DesktopTaskRunner
{
    public static DesktopTaskResult Execute(
        DesktopTaskPlan plan,
        CancellationToken cancellationToken,
        Action<string>? progress = null)
    {
        var output = new List<string>();

        foreach (var step in plan.Steps)
        {
            if (cancellationToken.IsCancellationRequested)
                return new DesktopTaskResult(false, true, Join(output, "Stopped before the next step."));

            try
            {
                if (step.Kind == DesktopTaskStepKind.InspectWindows)
                {
                    progress?.Invoke("Inspecting visible windows…");
                    var windows = DesktopWindowInspector.GetVisibleWindows();

                    if (windows.Count == 0)
                        output.Add("No visible application windows were found.");
                    else
                    {
                        output.Add("Visible open windows:");
                        output.AddRange(windows.Select((window, index) =>
                            $"{index + 1}. {window.Title}  —  {window.ProcessName}"));
                    }
                }
                else if (step.Kind == DesktopTaskStepKind.LaunchApplication)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    if (string.IsNullOrWhiteSpace(step.Executable))
                    {
                        output.Add($"Skipped {step.Description}: no executable was configured.");
                        continue;
                    }

                    progress?.Invoke(step.Description + "…");
                    var process = Process.Start(new ProcessStartInfo
                    {
                        FileName = step.Executable,
                        UseShellExecute = true
                    });

                    output.Add(process is null
                        ? $"{step.Description}: Windows did not return a process handle."
                        : $"{step.Description}: launch request sent to Windows.");
                }
            }
            catch (OperationCanceledException)
            {
                return new DesktopTaskResult(false, true, Join(output, "Task stopped."));
            }
            catch (Exception ex)
            {
                output.Add($"{step.Description}: failed — {ex.Message}");
            }
        }

        return new DesktopTaskResult(
            output.Count > 0 && output.All(line => !line.Contains("failed", StringComparison.OrdinalIgnoreCase)),
            false,
            Join(output, "Task finished."));
    }

    private static string Join(IEnumerable<string> lines, string fallback)
    {
        var result = string.Join(Environment.NewLine, lines);
        return string.IsNullOrWhiteSpace(result) ? fallback : result;
    }
}
