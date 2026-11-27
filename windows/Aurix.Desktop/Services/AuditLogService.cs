using System.IO;
using System.Text;
using System.Text.Json;

namespace Aurix.Desktop.Services;

/// <summary>
/// Records task execution metadata locally. It deliberately excludes spoken
/// instructions, typed field contents, window titles and exception messages.
/// </summary>
public static class AuditLogService
{
    private const long MaxLogBytes = 2 * 1024 * 1024;
    private static readonly object Gate = new();

    public static string LogDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "AURIX",
        "Desktop");

    public static string LogPath => Path.Combine(LogDirectory, "task-audit.jsonl");

    public static bool TryRecord(DesktopTaskStep step, string result)
    {
        lock (Gate)
        {
            try
            {
                Directory.CreateDirectory(LogDirectory);

                var resultCode = result switch
                {
                    "started" => "started",
                    "succeeded" => "succeeded",
                    "failed" => "failed",
                    "cancelled" => "cancelled",
                    "not_completed" => "not_completed",
                    _ => "unknown"
                };

                var application = step.TargetApp;
                if (string.IsNullOrWhiteSpace(application))
                    application = Path.GetFileNameWithoutExtension(step.Executable ?? "unknown");

                application = new string(application
                    .Where(character => char.IsLetterOrDigit(character) || character is ' ' or '-' or '_')
                    .Take(40)
                    .ToArray());

                var entry = new
                {
                    timestampUtc = DateTimeOffset.UtcNow,
                    action = step.Kind.ToString(),
                    application,
                    result = resultCode
                };

                var line = JsonSerializer.Serialize(entry) + Environment.NewLine;
                var currentSize = File.Exists(LogPath) ? new FileInfo(LogPath).Length : 0;

                if (currentSize + Encoding.UTF8.GetByteCount(line) > MaxLogBytes)
                {
                    var previousLog = LogPath + ".1";
                    if (File.Exists(previousLog))
                        File.Delete(previousLog);
                    if (File.Exists(LogPath))
                        File.Move(LogPath, previousLog);
                }

                File.AppendAllText(LogPath, line, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
                return true;
            }
            catch
            {
                // A task is not allowed to proceed when its start cannot be audited.
                return false;
            }
        }
    }
}
