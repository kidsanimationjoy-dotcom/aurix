using System.Globalization;
using System.Speech.Recognition;

namespace Aurix.Desktop.Services;

/// <summary>
/// Optional on-device dictation. Audio is read only while the user has explicitly
/// enabled listening; this class does not write recordings or send audio to a server.
/// </summary>
public sealed class SpeechInputService : IDisposable
{
    private SpeechRecognitionEngine? _engine;

    public event EventHandler<string>? PhraseRecognized;

    public bool IsListening => _engine is not null;

    public void StartListening()
    {
        if (_engine is not null) return;

        var recognizers = SpeechRecognitionEngine.InstalledRecognizers();
        if (recognizers.Count == 0)
        {
            throw new InvalidOperationException(
                "No Windows speech recognition language is installed. Add a supported Windows speech language or use typed commands.");
        }

        var preferred = recognizers.FirstOrDefault(item =>
            item.Culture.Name.Equals("en-US", StringComparison.OrdinalIgnoreCase))
            ?? recognizers.FirstOrDefault(item =>
                item.Culture.TwoLetterISOLanguageName.Equals("en", StringComparison.OrdinalIgnoreCase))
            ?? recognizers[0];

        var engine = new SpeechRecognitionEngine(preferred);

        try
        {
            engine.LoadGrammar(new DictationGrammar());
            engine.SetInputToDefaultAudioDevice();
            engine.SpeechRecognized += OnSpeechRecognized;
            engine.RecognizeAsync(RecognizeMode.Multiple);
            _engine = engine;
        }
        catch
        {
            engine.Dispose();
            throw;
        }
    }

    private void OnSpeechRecognized(object? sender, SpeechRecognizedEventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(e.Result?.Text) && e.Result.Confidence >= 0.60)
        {
            PhraseRecognized?.Invoke(this, e.Result.Text.Trim());
        }
    }

    public void StopListening()
    {
        var engine = _engine;
        _engine = null;
        if (engine is null) return;

        engine.SpeechRecognized -= OnSpeechRecognized;

        try { engine.RecognizeAsyncCancel(); } catch { /* The recognizer may already be idle. */ }
        try { engine.SetInputToNull(); } catch { /* The input may already be closed. */ }
        engine.Dispose();
    }

    public void Dispose() => StopListening();
}
