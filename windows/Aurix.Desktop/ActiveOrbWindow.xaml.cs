using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace Aurix.Desktop;

public partial class ActiveOrbWindow : Window
{
    private readonly DispatcherTimer _animationTimer;
    private readonly ScaleTransform _coreScale = new(1, 1);
    private readonly RotateTransform _ringRotation = new();
    private readonly ScaleTransform _flowAScale = new(1, 1);
    private readonly RotateTransform _flowARotation = new();
    private readonly TranslateTransform _flowATranslation = new();
    private readonly ScaleTransform _flowBScale = new(1, 1);
    private readonly RotateTransform _flowBRotation = new();
    private readonly TranslateTransform _flowBTranslation = new();
    private DateTime _animationStart = DateTime.UtcNow;
    private string _state = "Listening";

    public ActiveOrbWindow()
    {
        InitializeComponent();

        Core.RenderTransformOrigin = new System.Windows.Point(0.5, 0.5);
        Core.RenderTransform = _coreScale;

        Ring.RenderTransformOrigin = new System.Windows.Point(0.5, 0.5);
        Ring.RenderTransform = _ringRotation;

        FlowA.RenderTransformOrigin = new System.Windows.Point(0.5, 0.5);
        FlowA.RenderTransform = CreateTransformGroup(_flowARotation, _flowAScale, _flowATranslation);

        FlowB.RenderTransformOrigin = new System.Windows.Point(0.5, 0.5);
        FlowB.RenderTransform = CreateTransformGroup(_flowBRotation, _flowBScale, _flowBTranslation);

        _animationTimer = new DispatcherTimer(DispatcherPriority.Render)
        {
            Interval = TimeSpan.FromMilliseconds(33)
        };
        _animationTimer.Tick += AnimateOrb;
        Loaded += (_, _) => PositionOrb();
        Closed += (_, _) => _animationTimer.Stop();
    }

    private static TransformGroup CreateTransformGroup(
        RotateTransform rotation,
        ScaleTransform scale,
        TranslateTransform translation)
    {
        var group = new TransformGroup();
        group.Children.Add(rotation);
        group.Children.Add(scale);
        group.Children.Add(translation);
        return group;
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
        Left = Math.Max(0, (SystemParameters.PrimaryScreenWidth - Width) / 2);
        Top = Math.Max(0, SystemParameters.PrimaryScreenHeight - Height - 54);
    }

    private void AnimateOrb(object? sender, EventArgs e)
    {
        var elapsed = (DateTime.UtcNow - _animationStart).TotalSeconds;
        var speed = _state switch
        {
            "Thinking" => 3.4,
            "Speaking" => 5.0,
            _ => 1.65
        };
        var phase = elapsed * speed * Math.PI * 2;
        var pulse = 1.0 + Math.Sin(phase) * (_state == "Thinking" ? 0.095 : 0.06);

        _coreScale.ScaleX = pulse;
        _coreScale.ScaleY = pulse * (1.0 + Math.Sin(phase * 0.5) * 0.018);
        OuterGlow.Opacity = 0.25 + (Math.Sin(phase) + 1) * 0.16;
        Ring.Opacity = 0.56 + (Math.Sin(phase + 1) + 1) * 0.20;
        _ringRotation.Angle = (elapsed * (_state == "Thinking" ? 48 : 24)) % 360;

        // Two translucent, blurred light layers drift across the sphere at
        // different rates, creating a soft liquid-glass effect instead of a
        // single static gradient.
        _flowAScale.ScaleX = 0.96 + (Math.Sin(phase * 0.73) + 1) * 0.09;
        _flowAScale.ScaleY = 0.90 + (Math.Cos(phase * 0.61) + 1) * 0.10;
        _flowARotation.Angle = Math.Sin(phase * 0.36) * 42;
        _flowATranslation.X = Math.Sin(phase * 0.54) * 10;
        _flowATranslation.Y = Math.Cos(phase * 0.43) * 7;
        FlowA.Opacity = 0.27 + (Math.Sin(phase * 0.6) + 1) * 0.11;

        _flowBScale.ScaleX = 0.92 + (Math.Cos(phase * 0.49) + 1) * 0.12;
        _flowBScale.ScaleY = 0.95 + (Math.Sin(phase * 0.68) + 1) * 0.09;
        _flowBRotation.Angle = Math.Cos(phase * 0.31) * 34;
        _flowBTranslation.X = Math.Cos(phase * 0.46 + 1) * 9;
        _flowBTranslation.Y = Math.Sin(phase * 0.39 + 1) * 8;
        FlowB.Opacity = 0.18 + (Math.Cos(phase * 0.52) + 1) * 0.09;
    }
}
