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
        WaitingForGreeting,
        ListeningForCommand,
        SwitchingToWakeWord
    }

    private readonly object _gate = new();
    private SpeechRecognitionEngine? _engine;
    private Grammar? _wakeGrammar;
    private bool _disposed;
    private DateTime _lastHypothesisStatusAt = DateTime.MinValue;
    private ListeningState _state = ListeningState.Stopped;

    public event Action<string>? StatusChanged;
    public event Action<string>? CommandRecognized;
    public event Action? WakePhraseAccepted;

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
                // Wake-word mode is always available while hands-free is enabled; no clap is required.

                var builder = new GrammarBuilder { Culture = recognizer.Culture };
                builder.Append(new Choices("AURIX", "Hey AURIX"));

                _wakeGrammar = new Grammar(builder) { Name = "AURIX wake phrase" };
                engine.LoadGrammar(_wakeGrammar);
                engine.SetInputToDefaultAudioDevice();

                // Wake mode accepts only the short wake grammar. It is not dictation.
                engine.InitialSilenceTimeout = TimeSpan.FromSeconds(30);
                engine.BabbleTimeout = TimeSpan.FromSeconds(5);
                engine.SpeechRecognized += OnSpeechRecognized;
                engine.SpeechHypothesized += OnSpeechHypothesized;
                engine.RecognizeCompleted += OnRecognizeCompleted;

                _engine = engine;
                _disposed = false;
                _state = ListeningState.WaitingForWakeWord;
                engine.RecognizeAsync(RecognizeMode.Multiple);
            }
            catch
            {
                engine.SpeechRecognized -= OnSpeechRecognized;
                engine.SpeechHypothesized -= OnSpeechHypothesized;
                engine.RecognizeCompleted -= OnRecognizeCompleted;
                try { engine.SetInputToNull(); } catch { }
                engine.Dispose();
                _engine = null;
                _wakeGrammar = null;
                _state = ListeningState.Stopped;
                throw;
            }
        }

        StatusChanged?.Invoke("HANDS-FREE ACTIVE — say “AURIX” or “Hey AURIX” whenever you need me.");
    }

    private void OnSpeechRecognized(object? sender, SpeechRecognizedEventArgs e)
    {
        SpeechRecognitionEngine? engine;
        var wakeAccepted = false;
        string phrase = e.Result?.Text?.Trim() ?? string.Empty;

        lock (_gate)
        {
            if (_disposed || _state != ListeningState.WaitingForWakeWord)
                return;

            // Wake recognition is direct: no clap or other physical trigger is required.
            if (!WakePhrasePolicy.IsAccepted(phrase, e.Result.Confidence))
                return;

            wakeAccepted = true;
            _state = ListeningState.SwitchingToCommand;
            engine = _engine;
        }

        if (!wakeAccepted)
            return;

        try
        {
            engine?.RecognizeAsyncCancel();
        }
        catch (InvalidOperationException ex)
        {
            // A failed transition must never leave the UI claiming that a
            // microphone listener is healthy when the recognizer is not.
            StopAfterRecognitionFailure(engine, $"AURIX could not switch into command mode: {ex.Message}");
        }
    }

    private void OnSpeechHypothesized(object? sender, SpeechHypothesizedEventArgs e)
    {
        var hypothesis = e.Result?.Text?.Trim();
        if (string.IsNullOrWhiteSpace(hypothesis))
            return;

        string statusPrefix;
        lock (_gate)
        {
            if (_disposed)
                return;

            statusPrefix = _state switch
            {
                ListeningState.WaitingForWakeWord => "Checking wake phrase",
                ListeningState.ListeningForCommand => "Hearing",
                _ => string.Empty
            };
            if (string.IsNullOrEmpty(statusPrefix))
                return;

            // Avoid flooding the UI while the recognizer revises its partial transcript.
            var now = DateTime.UtcNow;
            if (now - _lastHypothesisStatusAt < TimeSpan.FromMilliseconds(300))
                return;
            _lastHypothesisStatusAt = now;
        }

        // During wake mode this is only a partial hypothesis, not an accepted
        // wake phrase, so it updates the status text but does not show the orb.
        StatusChanged?.Invoke($"{statusPrefix}: {hypothesis}");
    }

    private void OnRecognizeCompleted(object? sender, RecognizeCompletedEventArgs e)
    {
        string? command = null;
        string? status = null;
        var wakePhraseAccepted = false;
        SpeechRecognitionEngine? engineToDispose = null;

        lock (_gate)
        {
            if (_disposed || _engine is null)
                return;

            try
            {
                // RecognizeAsyncCancel is expected only for the deliberate
                // wake-word -> one-command transition. Device/driver failures
                // or any other cancellation stop hands-free and release audio.
                if (e.Error is not null)
                    throw new InvalidOperationException($"Windows speech recognition failed: {e.Error.Message}", e.Error);

                if (e.Cancelled && _state != ListeningState.SwitchingToCommand)
                    throw new InvalidOperationException("Windows speech recognition was interrupted. Check the microphone connection and enable hands-free again.");

                if (_state == ListeningState.WaitingForWakeWord && !e.Cancelled)
                {
                    // Recover from a recognizer cycle that completed after prolonged silence.
                    _engine.RecognizeAsync(RecognizeMode.Multiple);
                    status = "Wake listener is active. Say “AURIX” or “Hey AURIX” whenever you need me.";
                }
                else if (_state == ListeningState.SwitchingToCommand)
                {
                    // Pause recognition while AURIX speaks its greeting. The
                    // microphone is not in dictation mode until that greeting ends.
                    _state = ListeningState.WaitingForGreeting;
                    status = "Yes, boss. What would you like me to do?";
                    wakePhraseAccepted = true;
                }
                else if (_state == ListeningState.ListeningForCommand)
                {
                    var recognitionResult = e.Result;
                    if (recognitionResult is not null && recognitionResult.Confidence >= 0.30)
                        command = recognitionResult.Text?.Trim();

                    // Return to the always-available wake grammar immediately after one command.
                    _engine.UnloadAllGrammars();
                    if (_wakeGrammar is null)
                        throw new InvalidOperationException("The AURIX wake phrase grammar is unavailable.");

                    _engine.LoadGrammar(_wakeGrammar);
                    _engine.InitialSilenceTimeout = TimeSpan.FromSeconds(30);
                    _state = ListeningState.WaitingForWakeWord;
                    _engine.RecognizeAsync(RecognizeMode.Multiple);

                    status = string.IsNullOrWhiteSpace(command)
                        ? recognitionResult is null
                            ? "No speech detected within 6 seconds. The orb is closing. Say “AURIX” when you're ready to try again."
                            : "I heard speech, but couldn't recognise the instruction clearly. The orb is closing. Say “AURIX” when you're ready to try again."
                        : $"I heard: “{command}”. Say “AURIX” again whenever you need me.";
                }
            }
            catch (Exception ex)
            {
                _state = ListeningState.Stopped;
                _disposed = true;
                engineToDispose = _engine;
                _engine = null;
                _wakeGrammar = null;
                status = $"Hands-free voice stopped and the microphone was released: {ex.Message}";
            }
        }

        if (engineToDispose is not null)
            DisposeEngine(engineToDispose);

        if (!string.IsNullOrWhiteSpace(status))
            StatusChanged?.Invoke(status);

        if (wakePhraseAccepted)
            WakePhraseAccepted?.Invoke();

        if (!string.IsNullOrWhiteSpace(command))
            CommandRecognized?.Invoke(command);
    }

    public void BeginCommandListeningAfterGreeting()
    {
        string? failure = null;
        lock (_gate)
        {
            if (_disposed || _engine is null || _state != ListeningState.WaitingForGreeting)
                return;

            try
            {
                _engine.UnloadAllGrammars();
                var dictation = new DictationGrammar { Name = "AURIX one-command dictation" };
                _engine.LoadGrammar(dictation);
                _engine.InitialSilenceTimeout = TimeSpan.FromSeconds(6);
                _engine.BabbleTimeout = TimeSpan.FromSeconds(4);
                _engine.EndSilenceTimeout = TimeSpan.FromMilliseconds(900);
                _engine.EndSilenceTimeoutAmbiguous = TimeSpan.FromMilliseconds(1300);
                _engine.MaxAlternates = 3;
                _state = ListeningState.ListeningForCommand;
                _engine.RecognizeAsync(RecognizeMode.Single);
            }
            catch (Exception ex)
            {
                failure = "AURIX could not start command listening: " + ex.Message;
            }
        }

        if (failure is not null)
            StopAfterRecognitionFailure(_engine, failure);
        else
            StatusChanged?.Invoke("AURIX is listening for one instruction…");
    }
    private void StopAfterRecognitionFailure(SpeechRecognitionEngine? expectedEngine, string message)
    {
        SpeechRecognitionEngine? engineToDispose = null;

        lock (_gate)
        {
            if (!_disposed && _engine is not null &&
                (expectedEngine is null || ReferenceEquals(_engine, expectedEngine)))
            {
                _disposed = true;
                _state = ListeningState.Stopped;
                engineToDispose = _engine;
                _engine = null;
                _wakeGrammar = null;
            }
        }

        if (engineToDispose is not null)
            DisposeEngine(engineToDispose);

        StatusChanged?.Invoke(engineToDispose is null
            ? "AURIX voice state changed during a microphone transition. Check the listening indicator."
            : $"Hands-free voice stopped and the microphone was released: {message}");
    }

    private void DisposeEngine(SpeechRecognitionEngine engine)
    {
        engine.SpeechRecognized -= OnSpeechRecognized;
        engine.SpeechHypothesized -= OnSpeechHypothesized;
        engine.RecognizeCompleted -= OnRecognizeCompleted;
        try { engine.RecognizeAsyncCancel(); } catch { }
        try { engine.SetInputToNull(); } catch { }
        engine.Dispose();
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
            DisposeEngine(engine);

        StatusChanged?.Invoke("AURIX wake-word listening is paused. The microphone is no longer in use.");
    }
}
