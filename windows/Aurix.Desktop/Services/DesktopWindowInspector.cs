using System.Diagnostics;
using System.Windows.Automation;

namespace Aurix.Desktop.Services;

public sealed record DesktopWindowInfo(string Title, string ProcessName);

public static class DesktopWindowInspector
{
    /// <summary>
    /// Reads only top-level visible window titles and process names. It does not
    /// capture screenshots, read document contents, or interact with the windows.
    /// </summary>
    public static IReadOnlyList<DesktopWindowInfo> GetVisibleWindows()
    {
        var results = new List<DesktopWindowInfo>();

        try
        {
            var root = AutomationElement.RootElement;
            var condition = new PropertyCondition(
                AutomationElement.ControlTypeProperty,
                ControlType.Window);

            var elements = root.FindAll(TreeScope.Children, condition);
            foreach (AutomationElement element in elements)
            {
                try
                {
                    var current = element.Current;
                    if (current.IsOffscreen || string.IsNullOrWhiteSpace(current.Name))
                        continue;

                    var processName = "Unknown process";
                    try
                    {
                        using var process = Process.GetProcessById(current.ProcessId);
                        processName = process.ProcessName;
                    }
                    catch
                    {
                        // The window can disappear while it is being inspected.
                    }

                    results.Add(new DesktopWindowInfo(current.Name.Trim(), processName));
                }
                catch (ElementNotAvailableException)
                {
                    // Ignore a window that closed during enumeration.
                }
                catch (InvalidOperationException)
                {
                    // Ignore an inaccessible or transient UI Automation element.
                }
            }
        }
        catch (ElementNotAvailableException)
        {
            // The desktop tree may change while it is being queried.
        }

        return results
            .GroupBy(item => item.ProcessName + "\\0" + item.Title, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(item => item.ProcessName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.Title, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}
