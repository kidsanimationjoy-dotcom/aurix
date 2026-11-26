using System.Diagnostics;

namespace Aurix.Desktop.Services;

public sealed record DefenderResult(bool Success, string Summary, string Details, string? Error = null);

public static class DefenderService
{
    // These scripts are constants. Never interpolate user text or model output into PowerShell.
    private const string StatusScript =
        "Get-MpComputerStatus | Select-Object AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureLastUpdated | ConvertTo-Json -Compress";

    private const string QuickScanScript = "Start-MpScan -ScanType QuickScan";

    public static async Task<DefenderResult> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        var run = await RunPowerShellAsync(StatusScript, cancellationToken);
        if (run.ExitCode != 0)
            return new(false, "Status unavailable", "Microsoft Defender status could not be queried.", run.StandardError);

        var output = run.StandardOutput;
        var enabled = output.Contains("\"AntivirusEnabled\":true", StringComparison.OrdinalIgnoreCase);
        var realtime = output.Contains("\"RealTimeProtectionEnabled\":true", StringComparison.OrdinalIgnoreCase);
        var service = output.Contains("\"AMServiceEnabled\":true", StringComparison.OrdinalIgnoreCase);

        var summary = enabled && realtime && service
            ? "Microsoft Defender protection is enabled"
            : "Microsoft Defender needs attention";

        var details = $"Antivirus: {(enabled ? "On" : "Off or unknown")} · " +
                      $"Real-time protection: {(realtime ? "On" : "Off or unknown")} · " +
                      $"Defender service: {(service ? "Running" : "Off or unknown")}";
        return new(true, summary, details);
    }

    public static async Task<DefenderResult> StartQuickScanAsync(CancellationToken cancellationToken = default)
    {
        var run = await RunPowerShellAsync(QuickScanScript, cancellationToken);
        return run.ExitCode == 0
            ? new(true, "Quick scan requested", "Microsoft Defender accepted the quick-scan request.")
            : new(false, "Quick scan failed", "Windows did not confirm that the scan started.", run.StandardError);
    }

    private static async Task<(int ExitCode, string StandardOutput, string StandardError)> RunPowerShellAsync(
        string fixedScript,
        CancellationToken cancellationToken)
    {
        var systemDirectory = Environment.GetFolderPath(Environment.SpecialFolder.System);
        var powershellPath = Path.Combine(
            systemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
        if (!File.Exists(powershellPath))
            throw new FileNotFoundException("Windows PowerShell was not found in the Windows system directory.");

        var start = new ProcessStartInfo
        {
            FileName = powershellPath,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        start.ArgumentList.Add("-NoLogo");
        start.ArgumentList.Add("-NoProfile");
        start.ArgumentList.Add("-NonInteractive");
        start.ArgumentList.Add("-Command");
        start.ArgumentList.Add(fixedScript);

        using var process = new Process { StartInfo = start };
        process.Start();

        // Always drain both pipes so the child cannot block on a full output buffer.
        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        using var cancellationRegistration = cancellationToken.Register(() =>
        {
            try
            {
                if (!process.HasExited)
                    process.Kill(entireProcessTree: true);
            }
            catch (InvalidOperationException) { }
            catch (System.ComponentModel.Win32Exception) { }
        });

        try
        {
            await process.WaitForExitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            try
            {
                if (!process.HasExited)
                    process.Kill(entireProcessTree: true);
            }
            catch (InvalidOperationException) { }
            catch (System.ComponentModel.Win32Exception) { }

            await process.WaitForExitAsync(CancellationToken.None);
            throw;
        }

        return (process.ExitCode, await stdoutTask, await stderrTask);
    }
}
