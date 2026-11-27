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
    private readonly TaskRunCoordinator _taskRuns = new();
    private readonly LocalCodexChatService _localCodexChat = new();
    private readonly LocalOpenJarvisChatService _localOpenJarvisChat = new();
    private readonly LocalOpenJarvisRuntimeService _localOpenJarvisRuntime = new();
    private CancellationTokenSource? _openJarvisStartupCancellation;
    private SpeechSynthesizer? _speechSynthesizer;
    private ActiveOrbWindow? _activeOrb;
    private bool _microphoneTestRunning;
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
            ? "Stanford OpenJarvis is the primary AI. Start its local server or check its status here. Codex is an optional backup."
            : "Stanford OpenJarvis is primary. A saved Codex pairing token is available for backup.";
        try
        {
            _speechSynthesizer = new SpeechSynthesizer();
            _speechSynthesizer.SpeakCompleted += (_, _) => Dispatcher.BeginInvoke(new Action(HideActiveOrb));
        }
        catch { _speechSynthesizer = null; }
        _activeOrb = new ActiveOrbWindow();
        Loaded += async (_, _) =>
        {
            UpdateStartupButton();
            await RefreshDefenderStatusAsync();
        };
    }

    internal bool HasRequiredStartupControls(out string missingControls)
    {
        var required = new (string Name, object? Control)[]
        {
            (nameof(DefenderStatusText), DefenderStatusText),
            (nameof(DefenderDetailsText), DefenderDetailsText),
            (nameof(RefreshButton), RefreshButton),
            (nameof(ScanButton), ScanButton),
            (nameof(HandsFreeButton), HandsFreeButton),
            (nameof(VoiceDiagnosticsButton), VoiceDiagnosticsButton),
            (nameof(TestMicrophoneButton), TestMicrophoneButton),
            (nameof(ListeningStatusText), ListeningStatusText),
            (nameof(AiProviderCombo), AiProviderCombo),
            (nameof(StartOpenJarvisButton), StartOpenJarvisButton),
            (nameof(StopOpenJarvisButton), StopOpenJarvisButton),
            (nameof(CheckOpenJarvisButton), CheckOpenJarvisButton),
            (nameof(OpenJarvisSetupGuideButton), OpenJarvisSetupGuideButton),
            (nameof(CompanionTokenBox), CompanionTokenBox),
            (nameof(AiConnectionStatusText), AiConnectionStatusText),
            (nameof(PairCompanionButton), PairCompanionButton),
            (nameof(DisconnectCompanionButton), DisconnectCompanionButton),
            (nameof(PrepareCodexButton), PrepareCodexButton),
            (nameof(CodexLoginButton), CodexLoginButton),
            (nameof(ClearVoiceChatButton), ClearVoiceChatButton),
            (nameof(CommandInput), CommandInput),
            (nameof(RunTaskButton), RunTaskButton),
            (nameof(InspectWindowsButton), InspectWindowsButton),
            (nameof(EmergencyStopButton), EmergencyStopButton),
            (nameof(PlanText), PlanText),
            (nameof(TaskOutputText), TaskOutputText),
            (nameof(StartupButton), StartupButton)
        };

        var missing = required
            .Where(item => item.Control is null)
            .Select(item => item.Name)
            .ToArray();

        missingControls = string.Join(", ", missing);
        return missing.Length == 0;
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

    private void VoiceDiagnosticsButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var report = WindowsReadinessDiagnostic.CreateReport();
            System.Windows.MessageBox.Show(report, "AURIX Voice Diagnostics",
                System.Windows.MessageBoxButton.OK, System.Windows.MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show(
                $"AURIX could not complete its read-only voice checks: {ex.GetType().Name}: {ex.Message}",
                "AURIX Voice Diagnostics",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Warning);
        }
    }

    private async void TestMicrophoneButton_Click(object sender, RoutedEventArgs e)
    {
        if (_microphoneTestRunning)
            return;

        var resumeHandsFree = _handsFreeVoice?.IsRunning == true;
        _microphoneTestRunning = true;
        TestMicrophoneButton.IsEnabled = false;
        VoiceDiagnosticsButton.IsEnabled = false;

        // The live test opens the default input briefly, so pause AURIX's
        // wake-word engine first to avoid competing for the same microphone.
        if (resumeHandsFree)
            StopHandsFreeListening(savePreference: false);

        ListeningStatusText.Text =
            "MICROPHONE TEST ACTIVE — say a short sentence now. Audio is processed locally and is not saved.";
        ShowActiveOrb("Listening", "Microphone test — speak now");

        try
        {
            var report = await MicrophoneTestService.RunAsync();
            TaskOutputText.Text = report.Message;
            ListeningStatusText.Text = report.Success
                ? "Microphone test passed. AURIX successfully transcribed your speech."
                : "Microphone test did not pass. Read the detailed result below.";
        }
        catch (Exception ex)
        {
            TaskOutputText.Text = $"Microphone test failed safely: {ex.GetType().Name}: {ex.Message}";
            ListeningStatusText.Text = "Microphone test failed. Check the detailed result below.";
        }
        finally
        {
            _microphoneTestRunning = false;
            HideActiveOrb();
            TestMicrophoneButton.IsEnabled = true;
            VoiceDiagnosticsButton.IsEnabled = true;

            if (resumeHandsFree)
                StartHandsFreeListening(savePreference: false);
        }
    }

    private void ShowActiveOrb(string state, string hint)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.BeginInvoke(new Action(() => ShowActiveOrb(state, hint)));
            return;
        }
        _activeOrb ??= new ActiveOrbWindow();
        _activeOrb.SetState(state, hint);
    }

    private void HideActiveOrb()
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.BeginInvoke(new Action(HideActiveOrb));
            return;
        }
        _activeOrb?.HideOrb();
    }

    private string CurrentCompanionToken()
        => string.IsNullOrWhiteSpace(CompanionTokenBox.Password)
            ? _companionToken
            : CompanionTokenBox.Password.Trim();

    private async void PairCompanionButton_Click(object sender, RoutedEventArgs e)
    {
        var token = CurrentCompanionToken();
        SetCompanionActionsEnabled(false);
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
            SetCompanionActionsEnabled(true);
        }
    }

    private async void PrepareCodexButton_Click(object sender, RoutedEventArgs e)
    {
        var token = CurrentCompanionToken();
        SetCompanionActionsEnabled(false);
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
            SetCompanionActionsEnabled(true);
        }
    }

    private async void CodexLoginButton_Click(object sender, RoutedEventArgs e)
    {
        var token = CurrentCompanionToken();
        SetCompanionActionsEnabled(false);
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
            SetCompanionActionsEnabled(true);
        }
    }

    private void SetCompanionActionsEnabled(bool enabled)
    {
        PairCompanionButton.IsEnabled = enabled;
        PrepareCodexButton.IsEnabled = enabled;
        CodexLoginButton.IsEnabled = enabled;
        DisconnectCompanionButton.IsEnabled = enabled;
    }

    private void DisconnectCompanionButton_Click(object sender, RoutedEventArgs e)
    {
        var confirmation = System.Windows.MessageBox.Show(
            "Remove the saved AURIX pairing token from this Windows account? This clears the local credential only; it does not stop or rotate a running companion's token.",
            "Disconnect local AI pairing",
            System.Windows.MessageBoxButton.YesNo,
            System.Windows.MessageBoxImage.Warning);

        if (confirmation != System.Windows.MessageBoxResult.Yes)
            return;

        _taskRuns.CancelCurrent();
        _companionToken = string.Empty;
        CompanionTokenBox.Clear();
        _codexReady = false;

        if (!CompanionSettingsStore.ClearToken())
        {
            AiConnectionStatusText.Text = "AURIX cleared the token from memory, but Windows could not remove every saved token file. Check the local AURIX Desktop settings folder.";
            return;
        }

        AiConnectionStatusText.Text = "Local AI pairing removed. Hands-free wake listening and supported local commands remain available.";
        TaskOutputText.Text = "The saved companion credential has been removed from this Windows account.";
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
            ? "AI READY — local Codex is signed in and the sandbox is verified. Voice requests can receive answers or propose approved plans; AI-generated clicks and text entry are limited to Notepad."
            : $"Companion connected. Codex installed: {status.Installed}; signed in: {status.SignedIn}; profile prepared: {status.ProfilePrepared}; sandbox verified: {status.SandboxVerified}. {status.Message}";
    }

    private async void CheckOpenJarvisButton_Click(object sender, RoutedEventArgs e)
    {
        CheckOpenJarvisButton.IsEnabled = false;
        AiConnectionStatusText.Text = "Checking the local Stanford OpenJarvis service…";
        try
        {
            AiConnectionStatusText.Text = await _localOpenJarvisChat.CheckAsync();
            AiProviderCombo.SelectedIndex = 0;
        }
        catch (Exception ex)
        {
            AiConnectionStatusText.Text = "OpenJarvis is not ready: " + ex.Message;
        }
        finally
        {
            CheckOpenJarvisButton.IsEnabled = true;
            StopOpenJarvisButton.IsEnabled = _localOpenJarvisRuntime.IsServerProcessRunning;
        }
    }

    private async void StartOpenJarvisButton_Click(object sender, RoutedEventArgs e)
    {
        if (_openJarvisStartupCancellation is not null)
            return;

        var startup = new CancellationTokenSource();
        _openJarvisStartupCancellation = startup;
        StartOpenJarvisButton.IsEnabled = false;
        CheckOpenJarvisButton.IsEnabled = false;
        AiConnectionStatusText.Text = "Checking whether the local OpenJarvis API is already running…";

        try
        {
            // Do not start a second API server if one is already responding on the
            // loopback port, even when it was started outside AURIX.
            if (await _localOpenJarvisChat.IsApiServerRespondingAsync(startup.Token))
            {
                AiConnectionStatusText.Text = await _localOpenJarvisChat.CheckAsync(startup.Token);
                AiProviderCombo.SelectedIndex = 0;
                return;
            }

            var launchMessage = _localOpenJarvisRuntime.StartServer();
            StopOpenJarvisButton.IsEnabled = true;
            AiConnectionStatusText.Text = launchMessage + " Waiting for the local model API…";

            for (var attempt = 0; attempt < 60; attempt++)
            {
                await Task.Delay(TimeSpan.FromSeconds(1), startup.Token);

                if (!_localOpenJarvisRuntime.IsServerProcessRunning)
                {
                    var code = _localOpenJarvisRuntime.LastExitCode;
                    throw new InvalidOperationException(
                        code is null
                            ? "The OpenJarvis process exited before its API became ready. Check the official Windows installation requirements and setup guide."
                            : $"The OpenJarvis process exited with code {code} before its API became ready. Check its installation and model setup.");
                }

                if (await _localOpenJarvisChat.IsApiServerRespondingAsync(startup.Token))
                {
                    AiConnectionStatusText.Text = await _localOpenJarvisChat.CheckAsync(startup.Token);
                    AiProviderCombo.SelectedIndex = 0;
                    AiConnectionStatusText.Text += " AURIX started this local server.";
                    return;
                }
            }

            AiConnectionStatusText.Text =
                "OpenJarvis is still running, but its API did not become ready within 60 seconds. Check the model engine setup, then select Check OpenJarvis again.";
        }
        catch (OperationCanceledException) when (startup.IsCancellationRequested)
        {
            AiConnectionStatusText.Text = "OpenJarvis startup was cancelled.";
        }
        catch (Exception ex)
        {
            AiConnectionStatusText.Text = "Could not start OpenJarvis: " + ex.Message;
        }
        finally
        {
            if (ReferenceEquals(_openJarvisStartupCancellation, startup))
                _openJarvisStartupCancellation = null;
            startup.Dispose();
            StartOpenJarvisButton.IsEnabled = true;
            CheckOpenJarvisButton.IsEnabled = true;
            StopOpenJarvisButton.IsEnabled = _localOpenJarvisRuntime.IsServerProcessRunning;
        }
    }

    private void StopOpenJarvisButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            _localOpenJarvisRuntime.StopServer();
            StopOpenJarvisButton.IsEnabled = false;
            AiConnectionStatusText.Text =
                "The OpenJarvis server started by AURIX has been stopped. Other OpenJarvis services started outside AURIX are not changed.";
        }
        catch (Exception ex)
        {
            AiConnectionStatusText.Text = "AURIX could not stop its OpenJarvis process: " + ex.Message;
        }
    }

    private void OpenJarvisSetupGuideButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "https://open-jarvis.github.io/OpenJarvis/getting-started/windows-native/",
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            AiConnectionStatusText.Text = "Could not open the official OpenJarvis Windows setup guide: " + ex.Message;
        }
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
            // Disposing the wake-word listener just before the explicit
            // microphone test raises a queued "paused" event. It must not
            // hide the orb or overwrite the microphone-test status.
            if (_microphoneTestRunning &&
                (message.Contains("stopped", StringComparison.OrdinalIgnoreCase) ||
                 message.Contains("paused", StringComparison.OrdinalIgnoreCase)))
                return;

            switch (VoiceOrbStatusPolicy.Classify(message))
            {
                case VoiceOrbDisposition.Listening:
                    ShowActiveOrb("Listening", message.StartsWith("Hearing:", StringComparison.OrdinalIgnoreCase)
                        ? "Hearing your speech"
                        : "Listening to you");
                    break;
                case VoiceOrbDisposition.Thinking:
                    ShowActiveOrb("Thinking", "Preparing your request");
                    break;
                case VoiceOrbDisposition.Hide:
                    HideActiveOrb();
                    break;
            }
            var active = _handsFreeVoice?.IsRunning == true;
            if (!active && message.Contains("stopped", StringComparison.OrdinalIgnoreCase))
            {
                // Keep the saved opt-in so a later app launch can retry, but
                // make the current UI accurately show that listening has ended.
                _handsFreeVoice = null;
                UpdateHandsFreeUi(false, message);
                return;
            }

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
            ShowActiveOrb("Thinking", "Working on your request");
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
        HideActiveOrb();
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

        var taskRun = _taskRuns.BeginRun();
        var cancellationToken = taskRun.Token;
        RunTaskButton.IsEnabled = false;
        EmergencyStopButton.IsEnabled = true;
        TaskOutputText.Text = "Working…";

        try
        {
            var result = await Task.Run(() => DesktopTaskRunner.Execute(
                plan,
                cancellationToken,
                message => Dispatcher.Invoke(() =>
                {
                    if (_taskRuns.IsCurrent(taskRun))
                        TaskOutputText.Text = message;
                }),
                prompt => Dispatcher.Invoke(() =>
                    _taskRuns.IsCurrent(taskRun) &&
                    !cancellationToken.IsCancellationRequested &&
                    System.Windows.MessageBox.Show(
                        prompt,
                        "Approve AURIX action",
                        System.Windows.MessageBoxButton.YesNo,
                        System.Windows.MessageBoxImage.Warning) == System.Windows.MessageBoxResult.Yes)),
                cancellationToken);

            cancellationToken.ThrowIfCancellationRequested();
            if (!_taskRuns.IsCurrent(taskRun))
                return;

            TaskOutputText.Text = result.Output;
            HideActiveOrb();
            ListeningStatusText.Text = result.Cancelled
                ? "Task stopped. Already completed actions are not undone."
                : result.Success ? "Task completed. Say “AURIX” for another instruction." : "Task finished with an issue. Say “AURIX” when ready.";
        }
        catch (OperationCanceledException)
        {
            if (_taskRuns.IsCurrent(taskRun))
            {
                TaskOutputText.Text = "Task stopped. Already completed actions are not undone.";
                ListeningStatusText.Text = "Emergency stop activated.";
            }
        }
        catch (Exception ex)
        {
            if (_taskRuns.IsCurrent(taskRun))
                TaskOutputText.Text = $"Task failed safely: {ex.Message}";
        }
        finally
        {
            FinishTaskRun(taskRun);
        }
    }

    private void FinishTaskRun(CancellationTokenSource taskRun)
    {
        var wasCurrent = _taskRuns.IsCurrent(taskRun);
        _taskRuns.CompleteRun(taskRun);

        if (wasCurrent)
        {
            RunTaskButton.IsEnabled = true;
            EmergencyStopButton.IsEnabled = false;
            if (_speechSynthesizer?.State != SynthesizerState.Speaking)
                HideActiveOrb();
        }
    }

    private async Task RunAiChatAsync(string prompt)
    {
        var useOpenJarvis = AiProviderCombo.SelectedIndex == 0;
        var providerName = useOpenJarvis ? "Stanford OpenJarvis" : "Codex";
        var token = useOpenJarvis ? string.Empty : CurrentCompanionToken();
        const string actionContract = """
You are translating a user's voice request into either an answer or a proposed AURIX desktop plan.
Return exactly one raw JSON object. Do not use Markdown or code fences.

Supported formats:
{"type":"answer","message":"Your normal conversational answer, or a clear explanation that the request is unsupported."}
{"type":"desktop_plan","summary":"Short description","steps":[
  {"kind":"launch_application","app":"Calculator"},
  {"kind":"inspect_windows"},
  {"kind":"inspect_controls","app":"Notepad"},
  {"kind":"click_button","app":"Notepad","button":"Save"},
  {"kind":"type_text","app":"Notepad","control":"Text Editor","text":"Hello"}
]}

Use only these exact action kinds and fields. Use only these apps:
Notepad, Calculator, Paint, File Explorer, Microsoft Edge, Google Chrome, Windows Terminal, Discord, Spotify.
Application launching and read-only inspection may target any app in that allowlist. AI-proposed button clicks and text entry are restricted to Notepad only; use "answer" when a requested UI change targets any other app.
A plan may contain one to five steps. Use "answer" for anything outside this exact capability set.
Only propose an application launch if the user explicitly asks to open, launch or start that exact app. Only propose open-window inspection when the user asks to show/list/inspect open windows or apps. Only propose control inspection when the user explicitly asks to inspect/show/list controls, buttons or fields in that exact app. Do not add extra apps or inspection steps just because they seem useful or because an app is mentioned in another context.
Only propose a click when the exact button label appears in the user's latest instruction as the target of a click/press/select/activate request. Only propose text entry when the exact text and exact field label both appear in the user's latest instruction together with an affirmative type/enter/write/paste request. Do not infer or invent a button, text value, or field name: AURIX independently checks these values against that latest instruction.
Do not propose shell commands, scripts, arbitrary file access, network access, browser navigation, purchases, payments, message sending, publishing, account changes, password/secret fields, or destructive actions.
AURIX will independently validate your JSON, display the exact plan, ask the user to approve it, and retain its own per-action approval gates. You cannot authorise or execute an action yourself. Never claim that a proposed action has already happened.
""";

        PlanText.Text = $"LOCAL AI REASONING\n{providerName} may answer normally or propose only supported, approval-gated AURIX desktop actions.";
        var taskRun = _taskRuns.BeginRun();
        var cancellationToken = taskRun.Token;
        RunTaskButton.IsEnabled = false;
        EmergencyStopButton.IsEnabled = true;
        TaskOutputText.Text = "Checking the local AI connection…";

        try
        {
            if (useOpenJarvis)
            {
                AiConnectionStatusText.Text = await _localOpenJarvisChat.CheckAsync(cancellationToken);
            }
            else
            {
                if (string.IsNullOrWhiteSpace(token))
                {
                    TaskOutputText.Text = "Connect the local AURIX companion and verify the Codex sandbox before using the backup AI provider. Typed local commands remain available without AI.";
                    return;
                }

                var status = await _localCodexChat.CheckAsync(token, cancellationToken);
                cancellationToken.ThrowIfCancellationRequested();
                if (!_taskRuns.IsCurrent(taskRun))
                    return;
                UpdateCodexStatus(status);
                if (!status.CanChat)
                {
                    TaskOutputText.Text = "Codex backup is not ready. Pair the companion, prepare and verify the sandbox, and complete official Codex sign-in. No prompt was sent.";
                    return;
                }
            }

            var messages = new List<LocalCodexMessage>
            {
                new("system", actionContract)
            };
            messages.AddRange(_voiceConversation.TakeLast(8));
            messages.Add(new LocalCodexMessage("user", prompt));

            TaskOutputText.Text = $"AURIX is asking local {providerName} to understand your request…";
            var rawResponse = useOpenJarvis
                ? await _localOpenJarvisChat.ChatAsync(messages, cancellationToken)
                : await _localCodexChat.ChatAsync(token, messages, cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            if (!_taskRuns.IsCurrent(taskRun))
                return;
            var interpretation = AiDesktopCommandParser.Parse(rawResponse, prompt);

            if (!interpretation.IsPlan || interpretation.Plan is null)
            {
                AddVoiceConversationTurn(prompt, interpretation.Message);
                TaskOutputText.Text = interpretation.Message;
                ListeningStatusText.Text = "AI response ready. Say “AURIX” for another instruction.";
                SpeakAnswer(interpretation.Message);
                return;
            }

            var plan = interpretation.Plan;
            if (!plan.IsValid || plan.Steps.Count == 0)
                throw new InvalidOperationException("AURIX refused an empty or invalid AI-proposed plan.");

            PlanText.Text = plan.Summary;
            var approval = System.Windows.MessageBox.Show(
                "Review the exact desktop actions proposed by local " + providerName + ":\n\n" + plan.Summary +
                "\n\nAURIX will run only these validated actions if you approve. Clicking buttons or entering text will still require separate approval.",
                "Approve AI-proposed desktop plan",
                System.Windows.MessageBoxButton.YesNo,
                System.Windows.MessageBoxImage.Warning);

            cancellationToken.ThrowIfCancellationRequested();
            if (!_taskRuns.IsCurrent(taskRun))
                return;

            if (approval != System.Windows.MessageBoxResult.Yes)
            {
                AddVoiceConversationTurn(prompt, "You declined the proposed desktop plan. No desktop action was taken.");
                TaskOutputText.Text = "Plan declined. No desktop action was taken.";
                ListeningStatusText.Text = "AI-proposed plan declined.";
                return;
            }

            TaskOutputText.Text = "Running your approved desktop plan…";
            var result = await Task.Run(() => DesktopTaskRunner.Execute(
                plan,
                cancellationToken,
                message => Dispatcher.Invoke(() =>
                {
                    if (_taskRuns.IsCurrent(taskRun))
                        TaskOutputText.Text = message;
                }),
                promptText => Dispatcher.Invoke(() =>
                    _taskRuns.IsCurrent(taskRun) &&
                    !cancellationToken.IsCancellationRequested &&
                    System.Windows.MessageBox.Show(
                        promptText,
                        "Approve AURIX action",
                        System.Windows.MessageBoxButton.YesNo,
                        System.Windows.MessageBoxImage.Warning) == System.Windows.MessageBoxResult.Yes)), cancellationToken);

            cancellationToken.ThrowIfCancellationRequested();
            if (!_taskRuns.IsCurrent(taskRun))
                return;

            AddVoiceConversationTurn(prompt, "Approved plan:\n" + plan.Summary + "\nExecution result:\n" + result.Output);
            TaskOutputText.Text = result.Output;
            ListeningStatusText.Text = result.Cancelled
                ? "Task stopped. Already completed actions are not undone."
                : result.Success ? "Approved plan completed. Say “AURIX” for another instruction." : "Plan finished with an issue. Say “AURIX” when ready.";
            SpeakAnswer(result.Output);
        }
        catch (OperationCanceledException)
        {
            if (_taskRuns.IsCurrent(taskRun))
            {
                TaskOutputText.Text = "AI request or desktop task stopped. Already completed actions are not undone.";
                ListeningStatusText.Text = "Emergency stop activated.";
            }
        }
        catch (Exception ex)
        {
            if (_taskRuns.IsCurrent(taskRun))
            {
                TaskOutputText.Text = $"AI request could not complete safely: {ex.Message}";
                ListeningStatusText.Text = "AI request finished with an issue.";
            }
        }
        finally
        {
            FinishTaskRun(taskRun);
        }
    }

    private void AddVoiceConversationTurn(string userPrompt, string assistantResponse)
    {
        _voiceConversation.Add(new LocalCodexMessage("user", userPrompt));
        _voiceConversation.Add(new LocalCodexMessage(
            "assistant",
            assistantResponse.Length > 4_000 ? assistantResponse[..4_000] : assistantResponse));
        while (_voiceConversation.Count > 12)
            _voiceConversation.RemoveAt(0);
    }

    private void SpeakAnswer(string answer)
    {
        if (_speechSynthesizer is null || string.IsNullOrWhiteSpace(answer))
            return;

        try
        {
            _speechSynthesizer.SpeakAsyncCancelAll();
            ShowActiveOrb("Speaking", "AURIX is speaking");
            var spoken = answer.Length > 1800 ? answer[..1800] + ". The rest of the answer is shown on screen." : answer;
            _speechSynthesizer.SpeakAsync(spoken);
        }
        catch
        {
            HideActiveOrb();
            // Text remains available even if Windows has no usable speech voice.
        }
    }

    private void EmergencyStopButton_Click(object sender, RoutedEventArgs e)
    {
        _taskRuns.CancelCurrent();
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
            _taskRuns.CancelCurrent();
            e.Cancel = true;
            Hide();
            return;
        }

        _openJarvisStartupCancellation?.Cancel();
        _localOpenJarvisRuntime.Dispose();
        StopOpenJarvisButton.IsEnabled = false;
        ShutdownHandsFree();
        _taskRuns.CancelCurrent();
        _speechSynthesizer?.SpeakAsyncCancelAll();
        HideActiveOrb();
        _activeOrb?.Close();
        _activeOrb = null;
        _speechSynthesizer?.Dispose();
        _speechSynthesizer = null;
    }
}
