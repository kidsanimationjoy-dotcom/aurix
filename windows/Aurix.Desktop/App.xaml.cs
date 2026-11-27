using System.Drawing;
using System.Windows;
using Forms = System.Windows.Forms;

namespace Aurix.Desktop;

public partial class App : System.Windows.Application
{
    private Forms.NotifyIcon? _trayIcon;
    private Forms.ToolStripMenuItem? _wakeToggleItem;
    private MainWindow? _aurixWindow;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // This native read-only check avoids relying on an unsigned downloaded
        // PowerShell script, which RemoteSigned policy can block.
        if (e.Args.Any(argument =>
            argument.Equals("--readiness-check", StringComparison.OrdinalIgnoreCase)))
        {
            try
            {
                System.Windows.MessageBox.Show(
                    Aurix.Desktop.Services.WindowsReadinessDiagnostic.CreateReport(),
                    "AURIX Windows Readiness Check",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                Environment.ExitCode = 1;
                System.Windows.MessageBox.Show(
                    "The readiness check could not complete (" + ex.GetType().Name + "). Review Windows Settings > System > Sound > Input.",
                    "AURIX Windows Readiness Check",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                Shutdown(1);
                return;
            }

            Shutdown(0);
            return;
        }

        // CI startup validation constructs the real WPF window without showing it,
        // starting the tray listener, reading the saved wake-word opt-in, or touching
        // the microphone. This verifies the published single-file app can initialise.
        if (e.Args.Any(argument =>
            argument.Equals("--self-test", StringComparison.OrdinalIgnoreCase)))
        {
            var exitCode = 0;
            try
            {
                _aurixWindow = new MainWindow();
                MainWindow = _aurixWindow;

                if (!_aurixWindow.HasRequiredStartupControls(out var missingControls))
                {
                    Console.Error.WriteLine("AURIX startup self-test failed. Missing controls: " + missingControls);
                    exitCode = 2;
                }
                else
                {
                    Console.WriteLine("AURIX startup self-test passed. WPF window and required controls initialised; microphone was not started.");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("AURIX startup self-test failed: " + ex.GetType().Name);
                exitCode = 1;
            }

            Environment.ExitCode = exitCode;
            Shutdown(exitCode);
            return;
        }

        _aurixWindow = new MainWindow();
        MainWindow = _aurixWindow;

        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("Open AURIX", null, (_, _) => ShowMainWindow());
        menu.Items.Add(new Forms.ToolStripSeparator());

        _wakeToggleItem = new Forms.ToolStripMenuItem();
        _wakeToggleItem.Click += (_, _) =>
        {
            var window = _aurixWindow;
            if (window is not null)
                window.Dispatcher.BeginInvoke(new Action(window.ToggleHandsFreeFromTray));
        };
        menu.Items.Add(_wakeToggleItem);
        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("Exit AURIX", null, (_, _) => ExitApplication());

        _trayIcon = new Forms.NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "AURIX — hands-free off",
            Visible = true,
            ContextMenuStrip = menu
        };

        _trayIcon.DoubleClick += (_, _) => ShowMainWindow();

        _aurixWindow.UpdateTrayWakeState += UpdateTrayWakeState;
        _aurixWindow.InitializeVoiceFromSavedPreference();

        var launchInBackground = e.Args.Any(argument =>
            argument.Equals("--background", StringComparison.OrdinalIgnoreCase));

        if (!launchInBackground)
        {
            _aurixWindow.Show();
            _aurixWindow.Activate();
        }
    }

    private void ShowMainWindow()
    {
        if (_aurixWindow is null) return;
        _aurixWindow.Show();
        if (_aurixWindow.WindowState == WindowState.Minimized)
            _aurixWindow.WindowState = WindowState.Normal;
        _aurixWindow.Activate();
    }

    private void UpdateTrayWakeState(bool active)
    {
        if (_wakeToggleItem is not null)
            _wakeToggleItem.Text = active ? "Pause AURIX wake-word listening" : "Enable AURIX wake-word listening";

        if (_trayIcon is not null)
        {
            _trayIcon.Text = active
                ? "AURIX — listening for its wake word"
                : "AURIX — hands-free paused";
        }
    }

    private void ExitApplication()
    {
        if (_aurixWindow is not null)
            _aurixWindow.AllowClose = true;
        Shutdown();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _aurixWindow?.ShutdownHandsFree();

        if (_trayIcon is not null)
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            _trayIcon = null;
        }

        base.OnExit(e);
    }
}
