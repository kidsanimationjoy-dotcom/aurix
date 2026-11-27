using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Input;
using Aurix.Desktop.Services;

namespace Aurix.Desktop;

public partial class MainWindow : Window
{
    public bool AllowClose { get; set; }

    private HandsFreeVoiceService? _handsFreeVoice;
    private CancellationTokenSource? _taskCancellation;
    private LocalCodexClient? _localCodexClient;

    public event Action<bool>? UpdateTrayWakeState;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) =>
        {
            UpdateStartupButton();
            await RefreshDefenderStatusAsync();
            await RefreshLocalCodexStatusAsync();
        };
    }

    public void InitializeVoiceFromSavedPreference()
    {
        if (WakeWordSettings.IsEnabled)
            StartHandsFreeListening(savePreference: false);
        else
            UpdateHandsFreeUi(false, "Hands-free is off. The microphone is not in use.");
    }

    public void ToggleHandsFreeFromTray()
    {
        if (_handsFreeVoice?.IsRunning == true)
            StopHandsFreeListening(savePreference: true);
        else
            StartHandsFreeListening(savePreference: true);
    }

    private void HandsFreeButton_Click(object sender, RoutedEventArgs e)
        => ToggleHandsFreeFromTray();

    private void StartHandsFreeListening(bool savePreference)
    {
        if (_handsFreeVoice?.IsRunning == true)
            return;

        var voice = new HandsFreeVoiceService();
        voice.StatusChanged += HandsFreeVoice_StatusChanged;
        voice.CommandRecognized += HandsFreeVoice_CommandRecognized;
        _handsFreeVoice = voice;

        try
        {
            voice.Start();

            if (savePreference && !WakeWordSettings.SetEnabled(true))
            {
                voice.Dispose();
                _handsFreeVoice = null;
                UpdateHandsFreeUi(false, "AURIX could not save your hands-free preference. Try again.");
                return;
            }

            UpdateHandsFreeUi(
                true,
                "HANDS-FREE ACTIVE — say “AURIX”, pause briefly, then speak your instruction.");
        }
        catch (Exception ex)
        {
            voice.Dispose();
            _handsFreeVoice = null;

            if (savePreference)
                WakeWordSettings.SetEnabled(false);

            UpdateHandsFreeUi(
                false,
                $"Hands-free could not start: {ex.Message}");
        }
    }

    private void StopHandsFreeListening(bool savePreference)
    {
        var voice = _handsFreeVoice;
        _handsFreeVoice = null;
        voice?.Dispose();

        if (savePreference && !WakeWordSettings.SetEnabled(false))
        {
            UpdateHandsFreeUi(false,
                "Wake-word listening stopped for this session, but Windows could not save the paused setting.");
            return;
        }

        UpdateHandsFreeUi(false,
            "Hands-free is off. The microphone is no longer in use.");
    }

    private void UpdateHandsFreeUi(bool active, string message)
    {
        HandsFreeButton.Content = active ? "Pause hands-free" : "Enable hands-free";
        ListeningStatusText.Text = message;
        ListeningStatusText.Foreground = active
            ? System.Windows.Media.Brushes.LightGreen
            : System.Windows.Media.Brushes.LightGray;
        UpdateTrayWakeState?.Invoke(active);
    }

    private void HandsFreeVoice_StatusChanged(string message)
    {
        Dispatcher.BeginInvoke(new Action(() =>
        {
            var active = _handsFreeVoice?.IsRunning == true;
            ListeningStatusText.Text = message;
            ListeningStatusText.Foreground = active
                ? System.Windows.Media.Brushes.LightGreen
                : System.Windows.Media.Brushes.Orange;
            UpdateTrayWakeState?.Invoke(active);
        }));
    }

    private void HandsFreeVoice_CommandRecognized(string command)
    {
        Dispatcher.BeginInvoke(new Action(() =>
        {
            CommandInput.Text = command;
            CommandInput.CaretIndex = CommandInput.Text.Length;
            ListeningStatusText.Text = $"AURIX heard your instruction: “{command}”. Working on it…";
            _ = RunCommandAsync(command);
        }));
    }

    public void ShutdownHandsFree()
    {
        var voice = _handsFreeVoice;
        _handsFreeVoice = null;
        voice?.Dispose();
        UpdateTrayWakeState?.Invoke(false);
    }


    private bool TryLoadSavedCodexClient(out LocalCodexClient? client, out string error)
    {
        client = null;
        error = string.Empty;
        if (!LocalCompanionSettings.TryLoad(out var url, out var token, out error))
            return false;
        return LocalCodexClient.TryCreate(url, token, out client, out error);
    }

    private async Task RefreshLocalCodexStatusAsync()
    {
        if (!TryLoadSavedCodexClient(out var client, out var error) || client is null)
        {
            _localCodexClient = null;
            LocalCodexStatusText.Text = string.IsNullOrWhiteSpace(error)
                ? "AI reasoning is not paired. Exact supported commands still work locally."
                : error;
            LocalCodexStatusText.Foreground = System.Windows.Media.Brushes.Orange;
            return;
        }

        _localCodexClient = client;
        LocalCodexStatusText.Text = "Checking the local companion and Codex readiness…";
        try
        {
            var health = await client.CheckHealthAsync();
            var status = await client.GetCodexStatusAsync();
            var chatAvailable = health.Capabilities.Contains("cli.codex.chat", StringComparer.Ordinal);
            var ready = chatAvailable && status.Installed && status.SignedIn && status.SandboxVerified;
            LocalCodexStatusText.Text = ready
                ? "LOCAL AI READY — Codex is signed in and the local sandbox is verified. Unrecognised instructions can be interpreted into approved AURIX actions."
                : !chatAvailable
                    ? "The paired companion does not advertise read-only Codex chat. Update the local companion."
                    : "Companion connected · " + status.Message +
                      (status.SignedIn && !status.SandboxVerified ? " Run Prepare / verify Codex before using AI reasoning." : string.Empty);
            LocalCodexStatusText.Foreground = ready
                ? System.Windows.Media.Brushes.LightGreen
                : System.Windows.Media.Brushes.Orange;
        }
        catch (Exception ex)
        {
            LocalCodexStatusText.Text = "Local companion unavailable: " + ex.Message;
            LocalCodexStatusText.Foreground = System.Windows.Media.Brushes.Orange;
        }
    }

    private async void ConnectLocalCompanionButton_Click(object sender, RoutedEventArgs e)
    {
        ConnectLocalCompanionButton.IsEnabled = false;
        try
        {
            LocalCodexClient? client;
            if (!string.IsNullOrWhiteSpace(LocalCompanionTokenInput.Password))
            {
                if (!LocalCodexClient.TryCreate(
                    LocalCompanionUrlInput.Text,
                    LocalCompanionTokenInput.Password,
                    out client,
                    out var createError) || client is null)
                    throw new InvalidOperationException(createError);

                var health = await client.CheckHealthAsync();
                if (!health.Capabilities.Contains("cli.codex.chat", StringComparer.Ordinal))
                    throw new InvalidOperationException("This companion does not support read-only Codex chat. Update it before pairing.");

                if (!LocalCompanionSettings.TrySave(
                    LocalCompanionUrlInput.Text,
                    LocalCompanionTokenInput.Password,
                    out var saveError))
                    throw new InvalidOperationException(saveError);
                LocalCompanionTokenInput.Clear();
            }
            else if (!TryLoadSavedCodexClient(out client, out var loadError) || client is null)
            {
                throw new InvalidOperationException(
                    string.IsNullOrWhiteSpace(loadError) ? "Enter the pairing token printed by the local companion." : loadError);
            }

            _localCodexClient = client;
            LocalCodexStatusText.Text = "Pairing accepted. Checking Codex sign-in and sandbox status…";
            await RefreshLocalCodexStatusAsync();
        }
        catch (Exception ex)
        {
            LocalCodexStatusText.Text = ex.Message;
            LocalCodexStatusText.Foreground = System.Windows.Media.Brushes.Orange;
        }
        finally
        {
            ConnectLocalCompanionButton.IsEnabled = true;
        }
    }

    private async void PrepareCodexButton_Click(object sender, RoutedEventArgs e)
    {
        if (_localCodexClient is null)
        {
            LocalCodexStatusText.Text = "Pair the local companion first.";
            return;
        }

        PrepareCodexButton.IsEnabled = false;
        LocalCodexStatusText.Text = "Preparing the separate AURIX Codex profile and checking the operating-system sandbox…";
        try
        {
            var result = await _localCodexClient.PrepareCodexAsync();
            LocalCodexStatusText.Text = result.Message;
            LocalCodexStatusText.Foreground = result.SandboxVerified
                ? System.Windows.Media.Brushes.LightGreen
                : System.Windows.Media.Brushes.Orange;
            await RefreshLocalCodexStatusAsync();
        }
        catch (Exception ex)
        {
            LocalCodexStatusText.Text = "Codex preparation failed: " + ex.Message;
            LocalCodexStatusText.Foreground = System.Windows.Media.Brushes.Orange;
        }
        finally
        {
            PrepareCodexButton.IsEnabled = true;
        }
    }

    private async void SignInCodexButton_Click(object sender, RoutedEventArgs e)
    {
        if (_localCodexClient is null)
        {
            LocalCodexStatusText.Text = "Pair the local companion first.";
            return;
        }

        SignInCodexButton.IsEnabled = false;
        try
        {
            var message = await _localCodexClient.StartCodexLoginAsync();
            LocalCodexStatusText.Text = message + " Complete the official sign-in in the companion terminal, then press Pair / refresh status.";
            LocalCodexStatusText.Foreground = System.Windows.Media.Brushes.LightGreen;
        }
        catch (Exception ex)
        {
            LocalCodexStatusText.Text = "Could not start Codex sign-in: " + ex.Message;
            LocalCodexStatusText.Foreground = System.Windows.Media.Brushes.Orange;
        }
        finally
        {
            SignInCodexButton.IsEnabled = true;
        }
    }

    private async Task RefreshDefenderStatusAsync()
    {
        RefreshButton.IsEnabled = false;
        ScanButton.IsEnabled = false;
        DefenderStatusText.Text = "Checking Microsoft Defender…";

        try
        {
            var result = await DefenderService.GetStatusAsync();
            DefenderStatusText.Text = result.Success ? result.Summary : "Status unavailable";
            DefenderDetailsText.Text = result.Success
                ? result.Details
                : result.Error ?? "Microsoft Defender status could not be read.";
        }
        catch (Exception ex)
        {
            DefenderStatusText.Text = "Status unavailable";
            DefenderDetailsText.Text = ex.Message;
        }
        finally
        {
            RefreshButton.IsEnabled = true;
            ScanButton.IsEnabled = true;
        }
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e)
        => await RefreshDefenderStatusAsync();

    private async void ScanButton_Click(object sender, RoutedEventArgs e)
    {
        var confirm = System.Windows.MessageBox.Show(
            "Start a Microsoft Defender quick scan now? The scan may use system resources while it runs.",
            "Confirm security scan",
            System.Windows.MessageBoxButton.YesNo,
            System.Windows.MessageBoxImage.Question);

        if (confirm != System.Windows.MessageBoxResult.Yes) return;

        ScanButton.IsEnabled = false;
        DefenderDetailsText.Text = "Requesting a Microsoft Defender quick scan…";

        try
        {
            var result = await DefenderService.StartQuickScanAsync();
            DefenderDetailsText.Text = result.Success
                ? "Microsoft Defender accepted the quick-scan request. Check Windows Security for scan progress and detections."
                : $"The scan request could not be started: {result.Error}";
        }
        catch (Exception ex)
        {
            DefenderDetailsText.Text = $"The scan request failed: {ex.Message}";
        }
        finally
        {
            ScanButton.IsEnabled = true;
        }
    }

    private async void RunTaskButton_Click(object sender, RoutedEventArgs e)
        => await RunCommandAsync(CommandInput.Text);

    private async void CommandInput_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key != Key.Enter) return;
        e.Handled = true;
        await RunCommandAsync(CommandInput.Text);
    }

    private async void InspectWindowsButton_Click(object sender, RoutedEventArgs e)
        => await RunCommandAsync("show open windows");

    private async Task RunCommandAsync(string command)
    {
        var plan = DesktopTaskPlanner.CreatePlan(command);

        _taskCancellation?.Cancel();
        _taskCancellation?.Dispose();
        _taskCancellation = new CancellationTokenSource();
        var token = _taskCancellation.Token;

        RunTaskButton.IsEnabled = false;
        EmergencyStopButton.IsEnabled = true;
        TaskOutputText.Text = "Preparing your request…";

        try
        {
            var aiProposedPlan = false;
            if (!plan.IsValid)
            {
                if (_localCodexClient is null)
                {
                    if (!TryLoadSavedCodexClient(out var savedClient, out var pairingError) || savedClient is null)
                    {
                        TaskOutputText.Text = plan.Error ??
                            "AURIX could not create a safe local plan. Pair the local Codex companion to interpret natural-language instructions.";
                        if (!string.IsNullOrWhiteSpace(pairingError))
                            LocalCodexStatusText.Text = pairingError;
                        return;
                    }
                    _localCodexClient = savedClient;
                }

                TaskOutputText.Text = "Checking local Codex readiness…";
                var health = await _localCodexClient.CheckHealthAsync(token);
                var status = await _localCodexClient.GetCodexStatusAsync(token);
                if (!health.Capabilities.Contains("cli.codex.chat", StringComparer.Ordinal) ||
                    !status.Installed || !status.SignedIn || !status.SandboxVerified)
                {
                    LocalCodexStatusText.Text = status.Message +
                        (status.SignedIn && !status.SandboxVerified
                            ? " Run Prepare / verify Codex before using AI reasoning."
                            : " Complete local Codex setup in the connection panel.");
                    throw new InvalidOperationException("Local Codex is not ready. No desktop action was proposed or executed.");
                }

                TaskOutputText.Text = "Asking local Codex to interpret your instruction…";
                var response = await _localCodexClient.InterpretDesktopInstructionAsync(command, token);
                var interpretation = AiDesktopCommandParser.Parse(response);
                if (!interpretation.IsPlan || interpretation.Plan is null)
                {
                    PlanText.Text = "No desktop action proposed.";
                    TaskOutputText.Text = interpretation.Message;
                    ListeningStatusText.Text = "AURIX received a local Codex response. Say “AURIX” for another instruction.";
                    return;
                }

                plan = interpretation.Plan;
                aiProposedPlan = true;
            }

            PlanText.Text = plan.Summary;
            if (!plan.IsValid || plan.Steps.Count == 0)
                throw new InvalidOperationException("AURIX refused an empty or invalid desktop plan.");

            if (aiProposedPlan)
            {
                var approval = System.Windows.MessageBox.Show(
                    "Review the exact actions proposed by local Codex:\n\n" + plan.Summary +
                    "\n\nAURIX will run only these listed allowlisted actions. Individual UI changes still require their own approval.",
                    "Approve AI-proposed desktop plan",
                    System.Windows.MessageBoxButton.YesNo,
                    System.Windows.MessageBoxImage.Warning);
                if (approval != System.Windows.MessageBoxResult.Yes)
                {
                    TaskOutputText.Text = "AI-proposed plan declined. No desktop action was taken.";
                    ListeningStatusText.Text = "Plan declined.";
                    return;
                }
            }

            TaskOutputText.Text = aiProposedPlan ? "Running your approved AI-proposed plan…" : "Working…";
            var result = await Task.Run(() => DesktopTaskRunner.Execute(
                plan,
                token,
                message => Dispatcher.Invoke(() => TaskOutputText.Text = message),
                prompt => Dispatcher.Invoke(() => System.Windows.MessageBox.Show(
                    prompt,
                    "Approve AURIX action",
                    System.Windows.MessageBoxButton.YesNo,
                    System.Windows.MessageBoxImage.Warning) == System.Windows.MessageBoxResult.Yes)), token);

            TaskOutputText.Text = result.Output;
            ListeningStatusText.Text = result.Cancelled
                ? "Task stopped. Already completed actions are not undone."
                : result.Success ? "Task completed. Say “AURIX” for another instruction." : "Task finished with an issue. Say “AURIX” when ready.";
        }
        catch (OperationCanceledException)
        {
            TaskOutputText.Text = "Task stopped. Already completed actions are not undone.";
            ListeningStatusText.Text = "Emergency stop activated.";
        }
        catch (Exception ex)
        {
            TaskOutputText.Text = $"Task failed safely: {ex.Message}";
            ListeningStatusText.Text = "Task finished with an issue. Say “AURIX” when ready.";
        }
        finally
        {
            RunTaskButton.IsEnabled = true;
            EmergencyStopButton.IsEnabled = false;
        }
    }

    private void EmergencyStopButton_Click(object sender, RoutedEventArgs e)
    {
        _taskCancellation?.Cancel();
        TaskOutputText.Text = "Stopping remaining task steps…";
        ListeningStatusText.Text = "Emergency stop requested.";
    }

    private void UpdateStartupButton()
    {
        StartupButton.Content = StartupRegistration.IsEnabled
            ? "Disable start with Windows"
            : "Enable start with Windows";
    }

    private void StartupButton_Click(object sender, RoutedEventArgs e)
    {
        var result = StartupRegistration.IsEnabled
            ? StartupRegistration.Disable()
            : StartupRegistration.Enable();

        System.Windows.MessageBox.Show(
            result.Message,
            result.Success ? "AURIX startup" : "Startup setting not changed",
            System.Windows.MessageBoxButton.OK,
            result.Success ? System.Windows.MessageBoxImage.Information : System.Windows.MessageBoxImage.Warning);
        UpdateStartupButton();
    }

    private void OpenAuditLogButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Directory.CreateDirectory(AuditLogService.LogDirectory);
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"\"{AuditLogService.LogDirectory}\"",
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show(
                $"Could not open the local task log folder: {ex.Message}",
                "AURIX task log",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Warning);
        }
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (!AllowClose)
        {
            _taskCancellation?.Cancel();
            e.Cancel = true;
            Hide();
            return;
        }

        ShutdownHandsFree();
        _taskCancellation?.Cancel();
        _taskCancellation?.Dispose();
        _taskCancellation = null;
    }
}
