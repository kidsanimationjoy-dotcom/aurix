using System.Drawing;
using System.Windows;
using Forms = System.Windows.Forms;

namespace Aurix.Desktop;

public partial class App : System.Windows.Application
{
    private Forms.NotifyIcon? _trayIcon;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _trayIcon = new Forms.NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "AURIX Desktop",
            Visible = true,
            ContextMenuStrip = new Forms.ContextMenuStrip()
        };

        _trayIcon.ContextMenuStrip.Items.Add("Open AURIX", null, (_, _) => ShowMainWindow());
        _trayIcon.ContextMenuStrip.Items.Add("Exit AURIX", null, (_, _) => ExitApplication());
        _trayIcon.DoubleClick += (_, _) => ShowMainWindow();
    }

    private void ShowMainWindow()
    {
        if (MainWindow is null) return;
        MainWindow.Show();
        MainWindow.WindowState = WindowState.Normal;
        MainWindow.Activate();
    }

    private void ExitApplication()
    {
        if (MainWindow is MainWindow window)
            window.AllowClose = true;
        Shutdown();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        if (_trayIcon is not null)
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            _trayIcon = null;
        }
        base.OnExit(e);
    }
}
