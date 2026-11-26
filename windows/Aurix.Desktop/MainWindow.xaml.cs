using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using Aurix.Desktop.Services;

namespace Aurix.Desktop;

public partial class MainWindow : Window
{
    public bool AllowClose { get; set; }

    private HandsFreeVoiceService? _handsFreeVoice;
    private CancellationTokenSource? _taskCancellation;

    public event Action<bool>? UpdateTrayWakeState;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) => await RefreshDefenderStatusAsync();
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
            TaskOutputText.Text = plan.Error ?? "AURIX could not create a safe local plan for that request.";
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

    private void EmergencyStopButton_Click(object sender, RoutedEventArgs e)
    {
        _taskCancellation?.Cancel();
        TaskOutputText.Text = "Stopping remaining task steps…";
        ListeningStatusText.Text = "Emergency stop requested.";
    }

    private void StartupButton_Click(object sender, RoutedEventArgs e)
    {
        var result = StartupRegistration.Enable();
        System.Windows.MessageBox.Show(
            result.Message,
            result.Success ? "AURIX startup" : "Startup not enabled",
            System.Windows.MessageBoxButton.OK,
            result.Success ? System.Windows.MessageBoxImage.Information : System.Windows.MessageBoxImage.Warning);
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
