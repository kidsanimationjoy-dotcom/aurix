using System.Text.RegularExpressions;

namespace Aurix.Desktop.Services;

/// <summary>
/// Normalizes the two supported local wake phrases. This is deliberately
/// narrow: it does not treat arbitrary speech containing a name as a command.
/// </summary>
public static class WakePhrasePolicy
{
    public static bool IsAccepted(string? recognizedText, double confidence, double minimumConfidence = 0.40)
    {
        if (string.IsNullOrWhiteSpace(recognizedText) ||
            double.IsNaN(confidence) || double.IsInfinity(confidence) ||
            confidence < minimumConfidence || minimumConfidence is < 0 or > 1)
            return false;

        var normalized = Regex.Replace(recognizedText.Trim(), @"[^\p{L}\p{N}\s]", string.Empty);
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();

        return normalized.Equals("AURIX", StringComparison.OrdinalIgnoreCase) ||
               normalized.Equals("HEY AURIX", StringComparison.OrdinalIgnoreCase);
    }
}