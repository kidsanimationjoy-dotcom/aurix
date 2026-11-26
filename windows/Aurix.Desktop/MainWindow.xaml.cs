using System.ComponentModel;
using System.Windows;
using Aurix.Desktop.Services;

namespace Aurix.Desktop;

public partial class MainWindow : Window
{
    public bool AllowClose { get; set; }

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
        var confirm = MessageBox.Show(
            "Start a Microsoft Defender quick scan now? The scan may use system resources while it runs.",
            "Confirm security scan",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (confirm != MessageBoxResult.Yes) return;

        ScanButton.IsEnabled = false;
        ActivityText.Text = "Requesting a Microsoft Defender quick scan…";
        try
        {
            var result = await DefenderService.StartQuickScanAsync();
            ActivityText.Text = result.Success
                ? "Microsoft Defender accepted the quick-scan request. Check Windows Security for scan progress and detections."
                : $"The scan request could not be started: {result.Error}";
        }
        catch (Exception ex)
        {
            ActivityText.Text = $"The scan request failed: {ex.Message}";
        }
        finally
        {
            ScanButton.IsEnabled = true;
        }
    }

    private void StartupButton_Click(object sender, RoutedEventArgs e)
    {
        var result = StartupRegistration.Enable();
        MessageBox.Show(
            result.Message,
            result.Success ? "AURIX startup" : "Startup not enabled",
            MessageBoxButton.OK,
            result.Success ? MessageBoxImage.Information : MessageBoxImage.Warning);
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (AllowClose) return;
        e.Cancel = true;
        Hide();
    }
}
