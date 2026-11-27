namespace Aurix.Desktop.Services;

public enum VoiceOrbDisposition
{
    None,
    Listening,
    Thinking,
    Hide
}

/// <summary>
/// Maps local voice-recognition status messages to the visible orb state.
/// Timeout and no-speech messages always close the orb.
/// </summary>
public static class VoiceOrbStatusPolicy
{
    public static VoiceOrbDisposition Classify(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return VoiceOrbDisposition.None;

        if (message.StartsWith("Hearing:", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("AURIX heard you", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("What would you like me to do, boss", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("listening for your instruction", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("listening for one instruction", StringComparison.OrdinalIgnoreCase))
            return VoiceOrbDisposition.Listening;

        if (message.StartsWith("I heard:", StringComparison.OrdinalIgnoreCase))
            return VoiceOrbDisposition.Thinking;

        if (message.Contains("no speech detected", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("didn't catch", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("couldn't recognise", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("could not recognize", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("couldn't understand", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("timed out", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("stopped", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("paused", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("microphone was released", StringComparison.OrdinalIgnoreCase))
            return VoiceOrbDisposition.Hide;

        return VoiceOrbDisposition.None;
    }
}
