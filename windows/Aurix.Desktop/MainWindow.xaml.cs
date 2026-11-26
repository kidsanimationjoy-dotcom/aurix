using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using Aurix.Desktop.Services;

namespace Aurix.Desktop;

public partial class MainWindow : Window
{
    public bool AllowClose { get; set; }

    private SpeechInputService? _speechInput;
    private CancellationTokenSource? _taskCancellation;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) => await RefreshDefenderStatusAsync();
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

    private void ListenButton_Click(object sender, RoutedEventArgs e)
    {
        if (_speechInput is not null)
        {
            StopVoiceListening();
            return;
        }

        try
        {
            _speechInput = new SpeechInputService();
            _speechInput.PhraseRecognized += SpeechInput_PhraseRecognized;
            _speechInput.StartListening();

            ListenButton.Content = "Stop voice listening";
            ListeningStatusText.Text = "MICROPHONE ACTIVE — listening locally. Press Stop voice listening to turn it off.";
            ListeningStatusText.Foreground = System.Windows.Media.Brushes.LightGreen;
        }
        catch (Exception ex)
        {
            _speechInput?.Dispose();
            _speechInput = null;
            ListenButton.Content = "Start voice listening";
            ListeningStatusText.Text = $"Voice input unavailable: {ex.Message}";
            ListeningStatusText.Foreground = System.Windows.Media.Brushes.Orange;
        }
    }

    private void SpeechInput_PhraseRecognized(object? sender, string phrase)
    {
        Dispatcher.BeginInvoke(new Action(() =>
        {
            CommandInput.Text = phrase;
            CommandInput.CaretIndex = CommandInput.Text.Length;
            ListeningStatusText.Text = $"Heard: “{phrase}” — review it, then press Run task.";
        }));
    }

    private void StopVoiceListening()
    {
        _speechInput?.Dispose();
        _speechInput = null;
        ListenButton.Content = "Start voice listening";
        ListeningStatusText.Text = "Microphone off.";
        ListeningStatusText.Foreground = System.Windows.Media.Brushes.LightGray;
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
                message => Dispatcher.Invoke(() => TaskOutputText.Text = message)), token);

            TaskOutputText.Text = result.Output;
            ListeningStatusText.Text = result.Cancelled
                ? "Task stopped. Already completed actions are not undone."
                : result.Success ? "Task completed." : "Task finished with an issue.";
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
        MessageBox.Show(
            result.Message,
            result.Success ? "AURIX startup" : "Startup not enabled",
            System.Windows.MessageBoxButton.OK,
            result.Success ? System.Windows.MessageBoxImage.Information : System.Windows.MessageBoxImage.Warning);
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (!AllowClose)
        {
            StopVoiceListening();
            _taskCancellation?.Cancel();
            e.Cancel = true;
            Hide();
            return;
        }

        StopVoiceListening();
        _taskCancellation?.Cancel();
        _taskCancellation?.Dispose();
        _taskCancellation = null;
    }
}
