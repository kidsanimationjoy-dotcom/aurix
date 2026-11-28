using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Windows.Automation;

namespace Aurix.Desktop.Services;

public sealed record DesktopUiActionResult(bool Success, string Message);

public sealed record DesktopUiControlInfo(
    string Name,
    string ControlType,
    string AutomationId,
    bool Enabled);

public static class DesktopInteractionService
{
    private sealed record TargetWindow(AutomationElement Element, string Title, string ProcessName, int ProcessId);

    private static readonly Dictionary<string, string[]> ProcessNames =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["Notepad"] = new[] { "notepad" },
            ["Calculator"] = new[] { "CalculatorApp", "calc" },
            ["Paint"] = new[] { "mspaint" },
            ["File Explorer"] = new[] { "explorer" },
            ["Microsoft Edge"] = new[] { "msedge" },
            ["Google Chrome"] = new[] { "chrome" },
            ["Windows Terminal"] = new[] { "WindowsTerminal", "wt" },
            ["Discord"] = new[] { "Discord" },
            ["Spotify"] = new[] { "Spotify" }
        };

    private static readonly Regex DestructiveButton = new(
        @"\b(delete|remove|erase|format|wipe|uninstall|factory reset|reset device|disable protection)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex ExternalImpactButton = new(
        @"\b(send|submit|publish|post|share|pay|purchase|buy|transfer|checkout|order|subscribe|confirm)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex SensitiveField = new(
        @"\b(password|passcode|pin|security code|cvv|cvc|card number|one[- ]time|otp|token|secret|recovery code)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static DesktopUiActionResult InspectControls(string appName, CancellationToken cancellationToken)
    {
        var targetResult = FindTargetWindow(appName);
        if (!targetResult.Success || targetResult.Window is null)
            return new(false, targetResult.Message);

        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            var descendants = targetResult.Window.Element.FindAll(TreeScope.Descendants, Condition.TrueCondition);
            var lines = new List<string>();
            var skippedPasswordFields = 0;

            for (var index = 0; index < descendants.Count && lines.Count < 100; index++)
            {
                cancellationToken.ThrowIfCancellationRequested();

                try
                {
                    var element = descendants[index];
                    var current = element.Current;
                    if (!current.IsControlElement || current.IsOffscreen)
                        continue;

                    if (current.IsPassword)
                    {
                        skippedPasswordFields++;
                        continue;
                    }

                    var name = current.Name?.Trim();
                    if (string.IsNullOrWhiteSpace(name))
                        continue;

                    var controlType = current.ControlType.ProgrammaticName.Replace("ControlType.", string.Empty);
                    if (!IsUsefulControlType(current.ControlType))
                        continue;

                    var enabled = current.IsEnabled ? "enabled" : "disabled";
                    var automationId = string.IsNullOrWhiteSpace(current.AutomationId)
                        ? string.Empty
                        : $" [id: {current.AutomationId}]";

                    lines.Add($"• {controlType}: {name} ({enabled}){automationId}");
                }
                catch (ElementNotAvailableException)
                {
                    // Ignore controls that disappeared while the tree was inspected.
                }
                catch (InvalidOperationException)
                {
                    // Ignore inaccessible controls and continue with the rest.
                }
            }

            if (lines.Count == 0)
                return new(true, $"AURIX found no named, visible controls in {targetResult.Window.Title}. No field values were read.");

            var summary = $"Accessible controls in {targetResult.Window.Title} ({targetResult.Window.ProcessName}):\n" +
                          string.Join("\n", lines);
            if (skippedPasswordFields > 0)
                summary += $"\n\n{skippedPasswordFields} password field(s) were skipped.";
            if (lines.Count == 100)
                summary += "\n\nShowing the first 100 controls only.";

            return new(true, summary);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            return new(false, $"AURIX could not inspect controls in {appName}: {ex.Message}");
        }
    }

    public static DesktopUiActionResult CloseApplication(
        string appName,
        Func<string, bool>? requestApproval,
        CancellationToken cancellationToken)
    {
        if (appName is not ("Notepad" or "Paint" or "Calculator"))
            return new(false, "AURIX can only request a graceful close of Notepad, Paint or Calculator in this preview.");

        var targetResult = FindTargetWindow(appName);
        if (!targetResult.Success || targetResult.Window is null)
            return new(false, targetResult.Message);

        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            var prompt = $"Approve a normal close request?\\n\\nApplication: {appName}\\nWindow: {targetResult.Window.Title}\\n\\nAURIX will ask Windows to close the app normally. The app may show its own save prompt. AURIX will not force-terminate it.";
            if (requestApproval is null || !requestApproval(prompt))
                return new(false, $"Close cancelled. {appName} remains open.");

            cancellationToken.ThrowIfCancellationRequested();
            var refreshedTarget = FindTargetWindow(appName);
            if (!refreshedTarget.Success || refreshedTarget.Window is null ||
                refreshedTarget.Window.ProcessId != targetResult.Window.ProcessId ||
                !string.Equals(refreshedTarget.Window.Title, targetResult.Window.Title, StringComparison.Ordinal))
                return new(false, "The approved app window changed before AURIX could close it. No close request was sent.");

            using var process = Process.GetProcessById(refreshedTarget.Window.ProcessId);
            if (process.HasExited || process.MainWindowHandle == IntPtr.Zero)
                return new(false, "The approved app no longer has an open main window. No close request was sent.");

            var accepted = process.CloseMainWindow();
            return accepted
                ? new(true, $"Windows accepted a normal close request for {appName}. The app may still ask you to save changes; AURIX did not force-close it.")
                : new(false, $"Windows did not accept a normal close request for {appName}. The app was not force-terminated.");
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (ArgumentException)
        {
            return new(false, $"The {appName} process ended before AURIX could send the close request.");
        }
        catch (InvalidOperationException ex)
        {
            return new(false, $"AURIX could not request a normal close for {appName}: {ex.Message}");
        }
    }
    public static DesktopUiActionResult ClickButton(
        string appName,
        string buttonName,
        Func<string, bool>? requestApproval,
        CancellationToken cancellationToken)
    {
        var targetResult = FindTargetWindow(appName);
        if (!targetResult.Success || targetResult.Window is null)
            return new(false, targetResult.Message);

        try
        {
            cancellationToken.ThrowIfCancellationRequested();

            var matches = FindNamedControls(
                targetResult.Window.Element,
                ControlType.Button,
                buttonName,
                cancellationToken);

            if (matches.Count == 0)
                return new(false, $"No visible enabled button named “{buttonName}” was found in {targetResult.Window.Title}.");

            if (matches.Count > 1)
                return new(false, $"More than one button named “{buttonName}” exists in {targetResult.Window.Title}. AURIX will not guess which one to click.");

            var button = matches[0];
            if (DestructiveButton.IsMatch(button.Current.Name))
            {
                return new(false, $"AURIX blocked the “{button.Current.Name}” control because it appears destructive. This build does not activate delete, remove, erase, format, uninstall or reset controls.");
            }

            var isExternalImpact = ExternalImpactButton.IsMatch(button.Current.Name);
            var warning = isExternalImpact
                ? "\n\nThis button name suggests an external action (such as sending, sharing, purchasing or publishing). Check the target and consequences carefully."
                : string.Empty;

            var prompt = $"Approve this AURIX action?\n\nApplication: {targetResult.Window.ProcessName}\nWindow: {targetResult.Window.Title}\nAction: Click the exact button “{button.Current.Name}”.{warning}\n\nAURIX will not click if you choose No.";
            if (requestApproval is null || !requestApproval(prompt))
                return new(false, $"Click cancelled. The “{buttonName}” button was not activated.");

            cancellationToken.ThrowIfCancellationRequested();

            // Re-resolve the exact window and control after the approval dialog. UI Automation
            // elements can become stale, or the user can switch/replace the target while deciding.
            var refreshedTarget = FindTargetWindow(appName);
            if (!refreshedTarget.Success || refreshedTarget.Window is null ||
                refreshedTarget.Window.ProcessId != targetResult.Window.ProcessId ||
                !string.Equals(refreshedTarget.Window.Title, targetResult.Window.Title, StringComparison.Ordinal))
            {
                return new(false, "The approved target window changed before AURIX could click. No action was taken.");
            }

            var refreshedMatches = FindNamedControls(
                refreshedTarget.Window.Element, ControlType.Button, buttonName, cancellationToken);
            if (refreshedMatches.Count != 1)
                return new(false, "The approved button is no longer a unique visible target. No action was taken.");

            var refreshedButton = refreshedMatches[0];
            if (DestructiveButton.IsMatch(refreshedButton.Current.Name))
                return new(false, "The refreshed button now matches a blocked destructive action. No action was taken.");

            if (!refreshedButton.TryGetCurrentPattern(InvokePattern.Pattern, out var pattern) ||
                pattern is not InvokePattern invokePattern)
            {
                return new(false, $"The “{buttonName}” control does not expose a supported button action. AURIX did not use coordinate clicks as a fallback.");
            }

            invokePattern.Invoke();
            return new(true, $"Windows accepted the click request for “{buttonName}” in {refreshedTarget.Window.Title}. AURIX has not independently verified the resulting application state.");
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (ElementNotAvailableException)
        {
            return new(false, $"The “{buttonName}” button or its window changed before AURIX could activate it.");
        }
        catch (InvalidOperationException ex)
        {
            return new(false, $"AURIX could not safely activate “{buttonName}”: {ex.Message}");
        }
    }

    public static DesktopUiActionResult TypeText(
        string appName,
        string controlName,
        string inputText,
        Func<string, bool>? requestApproval,
        CancellationToken cancellationToken)
    {
        if (inputText.Length > 4000)
            return new(false, "AURIX limits one text-entry action to 4,000 characters.");

        if (SensitiveField.IsMatch(controlName))
            return new(false, "AURIX will not enter text into a field whose name suggests a password, PIN, payment code, token or secret.");

        var targetResult = FindTargetWindow(appName);
        if (!targetResult.Success || targetResult.Window is null)
            return new(false, targetResult.Message);

        try
        {
            cancellationToken.ThrowIfCancellationRequested();

            var candidates = FindNamedControls(
                targetResult.Window.Element,
                ControlType.Edit,
                controlName,
                cancellationToken);

            if (candidates.Count == 0)
                return new(false, $"No visible editable field named “{controlName}” was found in {targetResult.Window.Title}. Password fields are never included.");

            if (candidates.Count > 1)
                return new(false, $"More than one editable field named “{controlName}” exists in {targetResult.Window.Title}. AURIX will not guess which one to change.");

            var field = candidates[0];
            if (field.Current.IsPassword)
                return new(false, "AURIX will not enter text into a password field.");

            if (!field.TryGetCurrentPattern(ValuePattern.Pattern, out var pattern) ||
                pattern is not ValuePattern valuePattern ||
                valuePattern.Current.IsReadOnly)
            {
                return new(false, $"The “{controlName}” field is not an editable UI Automation value field. AURIX will not simulate keyboard input as a fallback.");
            }

            var preview = inputText.Length > 300 ? inputText[..300] + "…" : inputText;
            var prompt = $"Approve text entry?\n\nApplication: {targetResult.Window.ProcessName}\nWindow: {targetResult.Window.Title}\nField: {controlName}\n\nAURIX will replace the field's current value with:\n\n“{preview}”\n\nNo message or form will be submitted by this action.";
            if (requestApproval is null || !requestApproval(prompt))
                return new(false, $"Text entry into “{controlName}” was cancelled.");

            cancellationToken.ThrowIfCancellationRequested();

            // Re-resolve after approval so a changed window or field cannot receive the text.
            var refreshedTarget = FindTargetWindow(appName);
            if (!refreshedTarget.Success || refreshedTarget.Window is null ||
                refreshedTarget.Window.ProcessId != targetResult.Window.ProcessId ||
                !string.Equals(refreshedTarget.Window.Title, targetResult.Window.Title, StringComparison.Ordinal))
            {
                return new(false, "The approved target window changed before AURIX could enter text. No text was entered.");
            }

            var refreshedFields = FindNamedControls(
                refreshedTarget.Window.Element, ControlType.Edit, controlName, cancellationToken);
            if (refreshedFields.Count != 1)
                return new(false, "The approved text field is no longer a unique visible target. No text was entered.");

            var refreshedField = refreshedFields[0];
            if (refreshedField.Current.IsPassword ||
                !refreshedField.TryGetCurrentPattern(ValuePattern.Pattern, out var refreshedPattern) ||
                refreshedPattern is not ValuePattern refreshedValuePattern ||
                refreshedValuePattern.Current.IsReadOnly)
            {
                return new(false, "The approved field changed or is no longer a supported non-sensitive editable field. No text was entered.");
            }

            refreshedValuePattern.SetValue(inputText);
            var confirmedValue = refreshedValuePattern.Current.Value;
            if (!string.Equals(confirmedValue, inputText, StringComparison.Ordinal))
                return new(false, "Windows did not confirm that the requested field value was applied. The field was not submitted.");

            return new(true, $"Windows confirmed the approved text in “{controlName}” in {refreshedTarget.Window.Title}. The field was not submitted.");
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (ElementNotAvailableException)
        {
            return new(false, $"The “{controlName}” field or its window changed before AURIX could update it.");
        }
        catch (InvalidOperationException ex)
        {
            return new(false, $"AURIX could not safely update “{controlName}”: {ex.Message}");
        }
    }

    private static (bool Success, string Message, TargetWindow? Window) FindTargetWindow(string appName)
    {
        if (!ProcessNames.TryGetValue(appName, out var allowedProcesses))
            return (false, $"“{appName}” is not in AURIX's supported application list.", null);

        try
        {
            var windows = AutomationElement.RootElement.FindAll(
                TreeScope.Children,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window));

            var matches = new List<TargetWindow>();
            foreach (AutomationElement element in windows)
            {
                try
                {
                    var current = element.Current;
                    if (current.IsOffscreen)
                        continue;

                    using var process = Process.GetProcessById(current.ProcessId);
                    var processName = process.ProcessName;
                    if (!allowedProcesses.Contains(processName, StringComparer.OrdinalIgnoreCase))
                        continue;

                    matches.Add(new TargetWindow(element, current.Name ?? processName, processName, current.ProcessId));
                }
                catch (ArgumentException)
                {
                    // The window's process ended during enumeration.
                }
                catch (InvalidOperationException)
                {
                    // Ignore windows that became inaccessible.
                }
                catch (ElementNotAvailableException)
                {
                    // Ignore windows that closed during enumeration.
                }
            }

            if (matches.Count == 0)
                return (false, $"AURIX could not find an open, visible {appName} window. Open the app first and try again.", null);

            if (matches.Count > 1)
            {
                var titles = string.Join(", ", matches.Take(5).Select(item => $"“{item.Title}”"));
                return (false, $"AURIX found multiple visible {appName} windows ({titles}). Close or minimise the extras so it can target one window safely.", null);
            }

            return (true, string.Empty, matches[0]);
        }
        catch (Exception ex)
        {
            return (false, $"AURIX could not locate the {appName} window: {ex.Message}", null);
        }
    }

    private static List<AutomationElement> FindNamedControls(
        AutomationElement window,
        ControlType controlType,
        string requestedName,
        CancellationToken cancellationToken)
    {
        var condition = new AndCondition(
            new PropertyCondition(AutomationElement.ControlTypeProperty, controlType),
            new PropertyCondition(AutomationElement.NameProperty, requestedName),
            new PropertyCondition(AutomationElement.IsEnabledProperty, true),
            new PropertyCondition(AutomationElement.IsOffscreenProperty, false));

        var elements = window.FindAll(TreeScope.Descendants, condition);
        var matches = new List<AutomationElement>();

        for (var index = 0; index < elements.Count; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var element = elements[index];
                if (element.Current.IsPassword)
                    continue;
                matches.Add(element);
            }
            catch (ElementNotAvailableException)
            {
                // Ignore controls that disappeared during the search.
            }
        }

        return matches;
    }

    private static bool IsUsefulControlType(ControlType type)
        => type == ControlType.Button
           || type == ControlType.Edit
           || type == ControlType.ComboBox
           || type == ControlType.CheckBox
           || type == ControlType.RadioButton
           || type == ControlType.Hyperlink
           || type == ControlType.MenuItem
           || type == ControlType.TabItem
           || type == ControlType.ListItem
           || type == ControlType.Document
           || type == ControlType.Group;
}
