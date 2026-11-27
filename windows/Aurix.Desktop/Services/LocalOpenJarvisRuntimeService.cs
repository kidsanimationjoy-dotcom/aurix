using System.Diagnostics;
using System.IO;

namespace Aurix.Desktop.Services;

/// <summary>
/// Starts and stops only the OpenJarvis API process that AURIX launches.
/// It never installs software, executes a downloaded script, or changes
/// Windows startup tasks. OpenJarvis must first be installed by the user.
/// </summary>
public sealed class LocalOpenJarvisRuntimeService : IDisposable
{
    private Process? _serverProcess;

    public bool IsServerProcessRunning
    {
        get
        {
            try
            {
                return _serverProcess is not null && !_serverProcess.HasExited;
            }
            catch
            {
                return false;
            }
        }
    }

    public int? LastExitCode
    {
        get
        {
            try
            {
                return _serverProcess is { HasExited: true } process ? process.ExitCode : null;
            }
            catch
            {
                return null;
            }
        }
    }

    public string StartServer()
    {
        if (IsServerProcessRunning)
            return $"AURIX's OpenJarvis server is already starting (process {_serverProcess!.Id}).";

        _serverProcess?.Dispose();
        _serverProcess = null;

        var installRoot = Environment.GetEnvironmentVariable("OPENJARVIS_HOME");
        if (string.IsNullOrWhiteSpace(installRoot))
            installRoot = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "OpenJarvis");

        var sourceDirectory = Path.GetFullPath(Path.Combine(installRoot, "src"));
        if (!File.Exists(Path.Combine(sourceDirectory, "pyproject.toml")))
        {
            throw new InvalidOperationException(
                $"A native OpenJarvis CLI installation was not found at '{sourceDirectory}'. " +
                "Select OpenJarvis setup guide, complete Stanford's official Windows installation, then restart AURIX.");
        }

        var uvExecutable = FindUvExecutable();
        if (uvExecutable is null)
        {
            throw new InvalidOperationException(
                "AURIX could not find uv.exe. Complete the official OpenJarvis Windows installation, then close and reopen AURIX so it can read the updated Windows PATH.");
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = uvExecutable,
            WorkingDirectory = sourceDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        };

        // Fixed arguments only. No user-provided command text is ever passed
        // to the process, and the API binds to loopback only.
        startInfo.ArgumentList.Add("run");
        startInfo.ArgumentList.Add("--project");
        startInfo.ArgumentList.Add(sourceDirectory);
        startInfo.ArgumentList.Add("jarvis");
        startInfo.ArgumentList.Add("serve");
        startInfo.ArgumentList.Add("--host");
        startInfo.ArgumentList.Add("127.0.0.1");
        startInfo.ArgumentList.Add("--port");
        startInfo.ArgumentList.Add("8000");
        startInfo.ArgumentList.Add("--agent");
        startInfo.ArgumentList.Add("simple");

        try
        {
            _serverProcess = Process.Start(startInfo)
                ?? throw new InvalidOperationException("Windows did not create the OpenJarvis server process.");
        }
        catch (Exception ex) when (ex is not InvalidOperationException)
        {
            throw new InvalidOperationException(
                "Windows could not launch the installed OpenJarvis runtime. Check the official installation and uv setup.",
                ex);
        }

        return $"Started the local OpenJarvis API on 127.0.0.1:8000 (process {_serverProcess.Id}).";
    }

    public void StopServer()
    {
        var process = _serverProcess;
        _serverProcess = null;
        if (process is null)
            return;

        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                if (!process.WaitForExit(5_000))
                    throw new InvalidOperationException("The OpenJarvis process did not stop within five seconds.");
            }
        }
        finally
        {
            process.Dispose();
        }
    }

    private static string? FindUvExecutable()
    {
        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var userLocalCandidate = Path.Combine(userProfile, ".local", "bin", "uv.exe");
        if (File.Exists(userLocalCandidate))
            return userLocalCandidate;

        var path = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrWhiteSpace(path))
            return null;

        foreach (var directory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                var candidate = Path.Combine(directory.Trim().Trim('"'), "uv.exe");
                if (File.Exists(candidate))
                    return candidate;
            }
            catch
            {
                // Ignore invalid PATH entries and continue with the remaining paths.
            }
        }

        return null;
    }

    public void Dispose()
    {
        try
        {
            StopServer();
        }
        catch
        {
            // Process cleanup must not prevent AURIX from closing.
        }
    }
}
