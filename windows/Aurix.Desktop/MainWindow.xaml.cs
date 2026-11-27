using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Speech.Synthesis;
using System.Windows;
using System.Windows.Input;
using Aurix.Desktop.Services;

namespace Aurix.Desktop;

public partial class MainWindow : Window
{
    public bool AllowClose { get; set; }

    private HandsFreeVoiceService? _handsFreeVoice;
    private CancellationTokenSource? _taskCancellation;
    private readonly LocalCodexChatService _localCodexChat = new();
    private SpeechSynthesizer? _speechSynthesizer;
    private string _companionToken = string.Empty;
    private bool _codexReady;
    private readonly List<LocalCodexMessage> _voiceConversation = new();

    public event Action<bool>? UpdateTrayWakeState;

    public MainWindow()
    {
        InitializeComponent();
        _companionToken = CompanionSettingsStore.LoadToken();
        CompanionTokenBox.Password = _companionToken;
        AiConnectionStatusText.Text = string.IsNullOrEmpty(_companionToken)
            ? "Optional: connect the local AURIX companion for read-only AI conversation."
            : "Saved pairing token found. Connect to check the local AI engine.";
        try { _speechSynthesizer = new SpeechSynthesizer(); }
        catch { _speechSynthesizer = null; }
        Loaded += async (_, _) =>
        {
            UpdateStartupButton();
            await RefreshDefenderStatusAsync();
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

    private string CurrentCompanionToken()
        => string.IsNullOrWhiteSpace(CompanionTokenBox.Password)
            ? _companionToken
            : CompanionTokenBox.Password.Trim();

    private async void PairCompanionButton_Click(object sender, RoutedEventArgs e)
    {
        var token = CurrentCompanionToken();
        PairCompanionButton.IsEnabled = false;
        AiConnectionStatusText.Text = "Checking the authenticated local AURIX companion…";
        try
        {
            var status = await _localCodexChat.CheckAsync(token);
            CompanionSettingsStore.SaveToken(token);
            _companionToken = token;
            UpdateCodexStatus(status);
        }
        catch (Exception ex)
        {
            _codexReady = false;
            AiConnectionStatusText.Text = ex.Message;
        }
        finally
        {
            PairCompanionButton.IsEnabled = true;
        }
    }

    private async void PrepareCodexButton_Click(object sender, RoutedEventArgs e)
    {
        var token = CurrentCompanionToken();
        PrepareCodexButton.IsEnabled = false;
        AiConnectionStatusText.Text = "Preparing the separate AURIX Codex profile and verifying its OS sandbox…";
        try
        {
            var status = await _localCodexChat.PrepareAsync(token);
            CompanionSettingsStore.SaveToken(token);
            _companionToken = token;
            UpdateCodexStatus(status);
        }
        catch (Exception ex)
        {
            _codexReady = false;
            AiConnectionStatusText.Text = ex.Message;
        }
        finally
        {
            PrepareCodexButton.IsEnabled = true;
        }
    }

    private async void CodexLoginButton_Click(object sender, RoutedEventArgs e)
    {
        var token = CurrentCompanionToken();
        CodexLoginButton.IsEnabled = false;
        try
        {
            var message = await _localCodexChat.StartLoginAsync(token);
            AiConnectionStatusText.Text = message;
        }
        catch (Exception ex)
        {
            AiConnectionStatusText.Text = ex.Message;
        }
        finally
        {
            CodexLoginButton.IsEnabled = true;
        }
    }

    private void ClearVoiceChatButton_Click(object sender, RoutedEventArgs e)
    {
        _voiceConversation.Clear();
        TaskOutputText.Text = "Voice conversation cleared from this session's memory.";
    }

    private void UpdateCodexStatus(LocalCodexStatus status)
    {
        _codexReady = status.CanChat;
        AiConnectionStatusText.Text = status.CanChat
            ? "AI READY — local Codex is signed in and the read-only sandbox is verified. Voice questions can now receive AI answers."
            : $"Companion connected. Codex installed: {status.Installed}; signed in: {status.SignedIn}; profile prepared: {status.ProfilePrepared}; sandbox verified: {status.SandboxVerified}. {status.Message}";
    }

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
        PlanText.Text = plan.Summary;

        if (!plan.IsValid)
        {
            await RunAiChatAsync(command);
            return;
        }

        _taskCancellation?.Cancel();
        _taskCancellation?.Dispose();
        _taskCancellation = new CancellationTokenSource();
        var token = _taskCancellation.Token;

        RunTaskButton.IsEnabled = false;
        EmergencyStopButton.IsEnabled = true;
        TaskOutputText.Text = "Working…";

        try
        {
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
        }
        finally
        {
            RunTaskButton.IsEnabled = true;
            EmergencyStopButton.IsEnabled = false;
        }
    }

    private async Task RunAiChatAsync(string prompt)
    {
        var token = CurrentCompanionToken();
        PlanText.Text = "READ-ONLY AI CHAT\nAURIX will ask the connected local Codex CLI for a text response. This does not authorise desktop actions.";
        if (string.IsNullOrWhiteSpace(token))
        {
            TaskOutputText.Text = "Connect the local AURIX companion and verify the Codex sandbox before using AI conversation. Typed local commands remain available without AI.";
            return;
        }

        _taskCancellation?.Cancel();
        _taskCancellation?.Dispose();
        _taskCancellation = new CancellationTokenSource();
        var cancellationToken = _taskCancellation.Token;
        RunTaskButton.IsEnabled = false;
        EmergencyStopButton.IsEnabled = true;
        TaskOutputText.Text = "Checking the local AI connection…";

        try
        {
            var status = await _localCodexChat.CheckAsync(token, cancellationToken);
            UpdateCodexStatus(status);
            if (!status.CanChat)
            {
                TaskOutputText.Text = "AI chat is not ready. Pair the companion, prepare and verify the sandbox, and complete official Codex sign-in. No prompt was sent.";
                return;
            }

            _voiceConversation.Add(new LocalCodexMessage("user", prompt));
            TaskOutputText.Text = "AURIX is thinking…";
            var answer = await _localCodexChat.ChatAsync(token, _voiceConversation, cancellationToken);
            _voiceConversation.Add(new LocalCodexMessage("assistant", answer.Length > 4_000 ? answer[..4_000] : answer));
            while (_voiceConversation.Count > 12)
                _voiceConversation.RemoveAt(0);
            TaskOutputText.Text = answer;
            ListeningStatusText.Text = "AI response ready. Say “AURIX” for another instruction.";
            SpeakAnswer(answer);
        }
        catch (OperationCanceledException)
        {
            if (_voiceConversation.Count > 0 && _voiceConversation[^1].Role == "user" && _voiceConversation[^1].Content == prompt)
                _voiceConversation.RemoveAt(_voiceConversation.Count - 1);
            TaskOutputText.Text = "AI request stopped. No further response will be requested.";
            ListeningStatusText.Text = "Emergency stop activated.";
        }
        catch (Exception ex)
        {
            if (_voiceConversation.Count > 0 && _voiceConversation[^1].Role == "user" && _voiceConversation[^1].Content == prompt)
                _voiceConversation.RemoveAt(_voiceConversation.Count - 1);
            TaskOutputText.Text = $"AI chat could not complete: {ex.Message}";
        }
        finally
        {
            RunTaskButton.IsEnabled = true;
            EmergencyStopButton.IsEnabled = false;
            _taskCancellation?.Dispose();
            _taskCancellation = null;
        }
    }

    private void SpeakAnswer(string answer)
    {
        if (_speechSynthesizer is null || string.IsNullOrWhiteSpace(answer))
            return;

        try
        {
            _speechSynthesizer.SpeakAsyncCancelAll();
            var spoken = answer.Length > 1800 ? answer[..1800] + ". The rest of the answer is shown on screen." : answer;
            _speechSynthesizer.SpeakAsync(spoken);
        }
        catch
        {
            // Text remains available even if Windows has no usable speech voice.
        }
    }

    private void EmergencyStopButton_Click(object sender, RoutedEventArgs e)
    {
        _taskCancellation?.Cancel();
        _speechSynthesizer?.SpeakAsyncCancelAll();
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
        _speechSynthesizer?.SpeakAsyncCancelAll();
        _speechSynthesizer?.Dispose();
        _speechSynthesizer = null;
    }
}
