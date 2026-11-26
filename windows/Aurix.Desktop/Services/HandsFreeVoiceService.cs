using System.Speech.Recognition;

namespace Aurix.Desktop.Services;

/// <summary>
/// Keeps a narrow local wake-phrase grammar active. Full dictation is enabled
/// only after "AURIX" or "Hey AURIX" is recognised, then returns to wake mode
/// after one spoken command. No audio is written to disk or sent to a service.
/// </summary>
public sealed class HandsFreeVoiceService : IDisposable
{
    private enum ListeningState
    {
        Stopped,
        WaitingForWakeWord,
        SwitchingToCommand,
        ListeningForCommand,
        SwitchingToWakeWord
    }

    private readonly object _gate = new();
    private SpeechRecognitionEngine? _engine;
    private Grammar? _wakeGrammar;
    private bool _disposed;
    private ListeningState _state = ListeningState.Stopped;

    public event Action<string>? StatusChanged;
    public event Action<string>? CommandRecognized;

    public bool IsRunning
    {
        get
        {
            lock (_gate)
                return _engine is not null && !_disposed;
        }
    }

    public void Start()
    {
        lock (_gate)
        {
            if (_engine is not null)
                return;

            var recognizer = SpeechRecognitionEngine.InstalledRecognizers()
                .Where(item => item.Culture.TwoLetterISOLanguageName.Equals("en", StringComparison.OrdinalIgnoreCase))
                .OrderBy(item => item.Culture.Name.Equals("en-US", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
                .FirstOrDefault();

            if (recognizer is null)
            {
                throw new InvalidOperationException(
                    "A local English Windows speech recognizer is not installed. Install an English speech recognition language in Windows Settings, then enable AURIX hands-free again.");
            }

            var engine = new SpeechRecognitionEngine(recognizer);
            try
            {
                var builder = new GrammarBuilder { Culture = recognizer.Culture };
                builder.Append(new Choices("AURIX", "Hey AURIX"));

                _wakeGrammar = new Grammar(builder) { Name = "AURIX wake phrase" };
                engine.LoadGrammar(_wakeGrammar);
                engine.SetInputToDefaultAudioDevice();

                // Wake mode accepts only the short wake grammar. It is not dictation.
                engine.InitialSilenceTimeout = TimeSpan.FromSeconds(30);
                engine.BabbleTimeout = TimeSpan.FromSeconds(5);
                engine.SpeechRecognized += OnSpeechRecognized;
                engine.RecognizeCompleted += OnRecognizeCompleted;

                _engine = engine;
                _disposed = false;
                _state = ListeningState.WaitingForWakeWord;
                engine.RecognizeAsync(RecognizeMode.Multiple);
            }
            catch
            {
                engine.SpeechRecognized -= OnSpeechRecognized;
                engine.RecognizeCompleted -= OnRecognizeCompleted;
                try { engine.SetInputToNull(); } catch { }
                engine.Dispose();
                _engine = null;
                _wakeGrammar = null;
                _state = ListeningState.Stopped;
                throw;
            }
        }

        StatusChanged?.Invoke("HANDS-FREE ACTIVE — say “AURIX”, pause briefly, then speak your instruction. Wake-word detection stays local.");
    }

    private void OnSpeechRecognized(object? sender, SpeechRecognizedEventArgs e)
    {
        SpeechRecognitionEngine? engine;
        string phrase = e.Result?.Text?.Trim() ?? string.Empty;

        lock (_gate)
        {
            if (_disposed || _state != ListeningState.WaitingForWakeWord)
                return;

            var isWakePhrase =
                phrase.Equals("AURIX", StringComparison.OrdinalIgnoreCase) ||
                phrase.Equals("Hey AURIX", StringComparison.OrdinalIgnoreCase);

            if (!isWakePhrase || e.Result.Confidence < 0.68)
                return;

            _state = ListeningState.SwitchingToCommand;
            engine = _engine;
        }

        StatusChanged?.Invoke("AURIX heard you. Listening for your instruction…");

        try
        {
            engine?.RecognizeAsyncCancel();
        }
        catch (InvalidOperationException)
        {
            StatusChanged?.Invoke("AURIX could not switch into command mode. Say “AURIX” again.");
        }
    }

    private void OnRecognizeCompleted(object? sender, RecognizeCompletedEventArgs e)
    {
        string? command = null;
        string? status = null;

        lock (_gate)
        {
            if (_disposed || _engine is null)
                return;

            try
            {
                if (_state == ListeningState.SwitchingToCommand)
                {
                    // The wake grammar has stopped. Dictation is enabled only now.
                    _engine.UnloadAllGrammars();
                    var dictation = new DictationGrammar { Name = "AURIX one-command dictation" };
                    _engine.LoadGrammar(dictation);
                    _engine.InitialSilenceTimeout = TimeSpan.FromSeconds(8);
                    _engine.EndSilenceTimeout = TimeSpan.FromMilliseconds(1100);
                    _engine.EndSilenceTimeoutAmbiguous = TimeSpan.FromMilliseconds(1600);
                    _state = ListeningState.ListeningForCommand;
                    _engine.RecognizeAsync(RecognizeMode.Single);
                    status = "AURIX is listening for one instruction…";
                }
                else if (_state == ListeningState.ListeningForCommand)
                {
                    if (e.Result is not null && e.Result.Confidence >= 0.42)
                        command = e.Result.Text?.Trim();

                    // Return to the narrow wake grammar immediately after one command.
                    _engine.UnloadAllGrammars();
                    if (_wakeGrammar is null)
                        throw new InvalidOperationException("The AURIX wake phrase grammar is unavailable.");

                    _engine.LoadGrammar(_wakeGrammar);
                    _engine.InitialSilenceTimeout = TimeSpan.FromSeconds(30);
                    _state = ListeningState.WaitingForWakeWord;
                    _engine.RecognizeAsync(RecognizeMode.Multiple);

                    status = string.IsNullOrWhiteSpace(command)
                        ? "I didn't catch that instruction. Say “AURIX” when you're ready to try again."
                        : $"I heard: “{command}”. Say “AURIX” again whenever you need me.";
                }
            }
            catch (Exception ex)
            {
                _state = ListeningState.Stopped;
                _disposed = true;
                status = $"Hands-free voice stopped: {ex.Message}";
                try { _engine.RecognizeAsyncCancel(); } catch { }
            }
        }

        if (!string.IsNullOrWhiteSpace(status))
            StatusChanged?.Invoke(status);

        if (!string.IsNullOrWhiteSpace(command))
            CommandRecognized?.Invoke(command);
    }

    public void Dispose()
    {
        SpeechRecognitionEngine? engine;

        lock (_gate)
        {
            if (_disposed && _engine is null)
                return;

            _disposed = true;
            _state = ListeningState.Stopped;
            engine = _engine;
            _engine = null;
            _wakeGrammar = null;
        }

        if (engine is not null)
        {
            engine.SpeechRecognized -= OnSpeechRecognized;
            engine.RecognizeCompleted -= OnRecognizeCompleted;
            try { engine.RecognizeAsyncCancel(); } catch { }
            try { engine.SetInputToNull(); } catch { }
            engine.Dispose();
        }

        StatusChanged?.Invoke("AURIX wake-word listening is paused. The microphone is no longer in use.");
    }
}
