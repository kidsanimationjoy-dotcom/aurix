using System.Speech.Recognition;

namespace Aurix.Desktop.Services;

internal sealed record MicrophoneTestReport(bool Success, string Message);

/// <summary>
/// Runs a short, user-initiated local speech test against the default Windows
/// microphone. The recognizer returns text to the UI only; no audio or transcript
/// is written to disk or sent over the network.
/// </summary>
internal static class MicrophoneTestService
{
    private static readonly TimeSpan ListenWindow = TimeSpan.FromSeconds(7);

    public static Task<MicrophoneTestReport> RunAsync(CancellationToken cancellationToken = default)
        => Task.Run(() => Run(cancellationToken), cancellationToken);

    private static MicrophoneTestReport Run(CancellationToken cancellationToken)
    {
        try
        {
            var recognizer = SpeechRecognitionEngine.InstalledRecognizers()
                .Where(item => item.Culture.TwoLetterISOLanguageName.Equals("en", StringComparison.OrdinalIgnoreCase))
                .OrderBy(item => item.Culture.Name.Equals("en-US", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
                .FirstOrDefault();

            if (recognizer is null)
            {
                return new MicrophoneTestReport(false,
                    "MICROPHONE TEST FAILED: No local English Windows speech recognizer is installed. Install an English speech-recognition language in Windows Settings, then try again.");
            }

            using var engine = new SpeechRecognitionEngine(recognizer);
            using var completed = new ManualResetEventSlim(false);
            var gate = new object();
            RecognitionResult? recognised = null;
            Exception? recognitionError = null;
            var peakAudioLevel = 0;

            engine.AudioLevelUpdated += (_, e) =>
            {
                lock (gate)
                    peakAudioLevel = Math.Max(peakAudioLevel, e.AudioLevel);
            };
            engine.SpeechRecognized += (_, e) =>
            {
                lock (gate)
                {
                    if (recognised is null || e.Result.Confidence > recognised.Confidence)
                        recognised = e.Result;
                }
            };
            engine.RecognizeCompleted += (_, e) =>
            {
                lock (gate)
                {
                    if (e.Result is not null)
                        recognised = e.Result;
                    recognitionError = e.Error;
                }
                completed.Set();
            };

            engine.LoadGrammar(new DictationGrammar { Name = "AURIX microphone test" });
            engine.InitialSilenceTimeout = TimeSpan.FromSeconds(5);
            engine.BabbleTimeout = TimeSpan.FromSeconds(3);
            engine.EndSilenceTimeout = TimeSpan.FromMilliseconds(900);
            engine.SetInputToDefaultAudioDevice();
            engine.RecognizeAsync(RecognizeMode.Single);

            var finished = completed.Wait(ListenWindow, cancellationToken);
            if (!finished)
            {
                try { engine.RecognizeAsyncCancel(); } catch { }
                return new MicrophoneTestReport(false,
                    "MICROPHONE TEST TIMED OUT: Windows did not finish the 7-second speech test. Check the selected input device and microphone privacy permission, then try again.");
            }

            lock (gate)
            {
                if (recognitionError is not null)
                {
                    return new MicrophoneTestReport(false,
                        $"MICROPHONE TEST FAILED: Windows speech recognition reported {recognitionError.GetType().Name}: {recognitionError.Message}");
                }

                var spokenText = recognised?.Text?.Trim();
                if (!string.IsNullOrWhiteSpace(spokenText))
                {
                    return new MicrophoneTestReport(true,
                        $"MICROPHONE TEST PASSED. AURIX heard: “{spokenText}” (recognition confidence {recognised!.Confidence:P0}). Peak microphone level: {peakAudioLevel}%. The test was processed locally and was not saved.");
                }

                return peakAudioLevel == 0
                    ? new MicrophoneTestReport(false,
                        "NO MICROPHONE SOUND DETECTED. Windows reported a 0% input level during the test. Check Settings > System > Sound > Input, select the correct microphone, and check Settings > Privacy & security > Microphone.")
                    : new MicrophoneTestReport(false,
                        $"MICROPHONE SOUND DETECTED, BUT SPEECH WAS NOT TRANSCRIBED. Peak input level: {peakAudioLevel}%. Check the selected English speech-recognition language, microphone volume and input device, then try speaking a short sentence clearly.");
            }
        }
        catch (OperationCanceledException)
        {
            return new MicrophoneTestReport(false, "MICROPHONE TEST CANCELLED. No audio was saved.");
        }
        catch (Exception ex)
        {
            return new MicrophoneTestReport(false,
                $"MICROPHONE TEST COULD NOT START: {ex.GetType().Name}: {ex.Message}. Check Settings > System > Sound > Input and microphone privacy permission.");
        }
    }
}
