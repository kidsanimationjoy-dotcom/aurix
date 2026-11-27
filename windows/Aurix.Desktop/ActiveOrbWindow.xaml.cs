using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace Aurix.Desktop;

public partial class ActiveOrbWindow : Window
{
    private readonly DispatcherTimer _animationTimer;
    private DateTime _animationStart = DateTime.UtcNow;
    private string _state = "Listening";

    public ActiveOrbWindow()
    {
        InitializeComponent();
        _animationTimer = new DispatcherTimer(DispatcherPriority.Render)
        {
            Interval = TimeSpan.FromMilliseconds(40)
        };
        _animationTimer.Tick += AnimateOrb;
        Loaded += (_, _) => PositionOrb();
        Closed += (_, _) => _animationTimer.Stop();
    }

    public void SetState(string state, string hint)
    {
        _state = state;
        StateText.Text = "AURIX";
        HintText.Text = hint;
        _animationStart = DateTime.UtcNow;
        if (!IsVisible)
        {
            PositionOrb();
            Show();
        }
        if (!_animationTimer.IsEnabled)
            _animationTimer.Start();
    }

    public void HideOrb()
    {
        _animationTimer.Stop();
        if (IsVisible)
            Hide();
    }

    private void PositionOrb()
    {
        var area = SystemParameters.WorkArea;
        Left = area.Right - Width - 24;
        Top = area.Bottom - Height - 24;
    }

    private void AnimateOrb(object? sender, EventArgs e)
    {
        var elapsed = (DateTime.UtcNow - _animationStart).TotalSeconds;
        var speed = _state switch
        {
            "Thinking" => 2.7,
            "Speaking" => 4.8,
            _ => 2.0
        };
        var amplitude = _state == "Thinking" ? 0.085 : 0.055;
        var pulse = 1.0 + Math.Sin(elapsed * speed * Math.PI * 2) * amplitude;
        Core.RenderTransformOrigin = new System.Windows.Point(0.5, 0.5);
        Core.RenderTransform = new ScaleTransform(pulse, pulse);
        OuterGlow.Opacity = 0.28 + (Math.Sin(elapsed * speed * Math.PI * 2) + 1) * 0.13;
        Ring.Opacity = 0.58 + (Math.Sin(elapsed * speed * Math.PI * 2 + 1) + 1) * 0.18;
    }
}