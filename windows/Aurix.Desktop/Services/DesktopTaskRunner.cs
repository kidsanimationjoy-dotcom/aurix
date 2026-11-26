using System.Diagnostics;

namespace Aurix.Desktop.Services;

public sealed record DesktopTaskResult(bool Success, bool Cancelled, string Output);

public static class DesktopTaskRunner
{
    public static DesktopTaskResult Execute(
        DesktopTaskPlan plan,
        CancellationToken cancellationToken,
        Action<string>? progress = null,
        Func<string, bool>? requestApproval = null)
    {
        var output = new List<string>();
        var hasFailure = false;

        foreach (var step in plan.Steps)
        {
            if (cancellationToken.IsCancellationRequested)
                return new DesktopTaskResult(false, true, Join(output, "Stopped before the next step."));

            try
            {
                switch (step.Kind)
                {
                    case DesktopTaskStepKind.InspectWindows:
                        progress?.Invoke("Inspecting visible windows…");
                        var windows = DesktopWindowInspector.GetVisibleWindows();
                        if (windows.Count == 0)
                            output.Add("No visible application windows were found.");
                        else
                        {
                            output.Add("Visible open windows:");
                            output.AddRange(windows.Select((window, index) =>
                                $"{index + 1}. {window.Title} — {window.ProcessName}"));
                        }
                        break;

                    case DesktopTaskStepKind.InspectControls:
                        progress?.Invoke(step.Description + "…");
                        var inspection = DesktopInteractionService.InspectControls(
                            step.TargetApp ?? string.Empty, cancellationToken);
                        output.Add(inspection.Message);
                        hasFailure |= !inspection.Success;
                        break;

                    case DesktopTaskStepKind.ClickButton:
                        progress?.Invoke("Locating the requested button…");
                        var click = DesktopInteractionService.ClickButton(
                            step.TargetApp ?? string.Empty,
                            step.TargetName ?? string.Empty,
                            requestApproval,
                            cancellationToken);
                        output.Add(click.Message);
                        hasFailure |= !click.Success;
                        break;

                    case DesktopTaskStepKind.TypeText:
                        progress?.Invoke("Locating the requested text field…");
                        var type = DesktopInteractionService.TypeText(
                            step.TargetApp ?? string.Empty,
                            step.TargetName ?? string.Empty,
                            step.InputText ?? string.Empty,
                            requestApproval,
                            cancellationToken);
                        output.Add(type.Message);
                        hasFailure |= !type.Success;
                        break;

                    case DesktopTaskStepKind.LaunchApplication:
                        cancellationToken.ThrowIfCancellationRequested();
                        if (string.IsNullOrWhiteSpace(step.Executable))
                        {
                            output.Add($"Skipped {step.Description}: no executable was configured.");
                            hasFailure = true;
                            continue;
                        }

                        progress?.Invoke(step.Description + "…");
                        var process = Process.Start(new ProcessStartInfo
                        {
                            FileName = step.Executable,
                            UseShellExecute = true
                        });

                        if (process is null)
                        {
                            output.Add($"{step.Description}: Windows did not return a process handle.");
                            hasFailure = true;
                        }
                        else
                        {
                            output.Add($"{step.Description}: launch request sent to Windows.");
                            process.Dispose();
                        }
                        break;
                }
            }
            catch (OperationCanceledException)
            {
                return new DesktopTaskResult(false, true, Join(output, "Task stopped."));
            }
            catch (Exception ex)
            {
                output.Add($"{step.Description}: failed — {ex.Message}");
                hasFailure = true;
            }
        }

        return new DesktopTaskResult(!hasFailure, false, Join(output, "Task finished."));
    }

    private static string Join(IEnumerable<string> lines, string fallback)
    {
        var result = string.Join(Environment.NewLine, lines);
        return string.IsNullOrWhiteSpace(result) ? fallback : result;
    }
}
