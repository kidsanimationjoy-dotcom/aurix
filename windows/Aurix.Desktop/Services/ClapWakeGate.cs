using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Aurix.Desktop.Services;

/// <summary>
/// Locally detects a short, sharp clap transient and opens a five-second
/// one-use window in which the AURIX wake phrase can be accepted. Audio
/// buffers are analysed in memory only; no audio is saved or transmitted.
/// </summary>
public sealed class ClapWakeGate : IDisposable
{
    private readonly object _gate = new();
    private WasapiCapture? _capture;
    private DateTime _armedUntilUtc = DateTime.MinValue;
    private DateTime _lastClapUtc = DateTime.MinValue;
    private bool _disposed;

    public event Action? ClapDetected;
    public event Action<string>? Faulted;

    public void Start()
    {
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (_capture is not null)
                return;

            var capture = new WasapiCapture();
            capture.DataAvailable += OnDataAvailable;
            capture.RecordingStopped += OnRecordingStopped;

            try
            {
                // WasapiCapture defaults to shared mode, so Windows can share
                // the input endpoint with the speech recognizer.
                capture.StartRecording();
                _capture = capture;
            }
            catch
            {
                capture.DataAvailable -= OnDataAvailable;
                capture.RecordingStopped -= OnRecordingStopped;
                capture.Dispose();
                throw;
            }
        }
    }

    public bool ConsumeWakeAuthorization()
    {
        lock (_gate)
        {
            if (_disposed || DateTime.UtcNow > _armedUntilUtc)
            {
                _armedUntilUtc = DateTime.MinValue;
                return false;
            }

            _armedUntilUtc = DateTime.MinValue;
            return true;
        }
    }

    public void Disarm()
    {
        lock (_gate)
            _armedUntilUtc = DateTime.MinValue;
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        WasapiCapture? capture;
        lock (_gate)
        {
            if (_disposed)
                return;
            capture = _capture;
        }

        // The capture callback can arrive before Start assigns _capture.
        var format = (sender as WasapiCapture)?.WaveFormat ?? capture?.WaveFormat;
        if (format is null || !TryMeasure(e.Buffer, e.BytesRecorded, format, out var peak, out var rms))
            return;
        if (!ClapDetectionPolicy.IsClap(peak, rms))
            return;

        var now = DateTime.UtcNow;
        lock (_gate)
        {
            if (_disposed || now - _lastClapUtc < TimeSpan.FromMilliseconds(900) ||
                now < _armedUntilUtc)
                return;

            _lastClapUtc = now;
            _armedUntilUtc = now.AddSeconds(5);
        }

        ClapDetected?.Invoke();
    }

    private static bool TryMeasure(
        byte[] buffer,
        int bytesRecorded,
        WaveFormat format,
        out double peak,
        out double rms)
    {
        peak = 0;
        rms = 0;
        var bits = format.BitsPerSample;
        var bytesPerSample = bits / 8;
        if (bytesPerSample is < 1 or > 4 || bytesRecorded < bytesPerSample)
            return false;

        var sumSquares = 0d;
        var count = 0;
        for (var offset = 0; offset + bytesPerSample <= bytesRecorded; offset += bytesPerSample)
        {
            double sample;
            if (format.Encoding == WaveFormatEncoding.IeeeFloat && bits == 32)
            {
                sample = BitConverter.ToSingle(buffer, offset);
            }
            else if (format.Encoding == WaveFormatEncoding.Pcm && bits == 8)
            {
                sample = (buffer[offset] - 128) / 128d;
            }
            else if (format.Encoding == WaveFormatEncoding.Pcm && bits == 16)
            {
                sample = BitConverter.ToInt16(buffer, offset) / 32768d;
            }
            else if (format.Encoding == WaveFormatEncoding.Pcm && bits == 24)
            {
                var value = buffer[offset] | (buffer[offset + 1] << 8) |
                            (buffer[offset + 2] << 16);
                if ((value & 0x800000) != 0)
                    value |= unchecked((int)0xFF000000);
                sample = value / 8388608d;
            }
            else if (format.Encoding == WaveFormatEncoding.Pcm && bits == 32)
            {
                sample = BitConverter.ToInt32(buffer, offset) / 2147483648d;
            }
            else
            {
                return false;
            }

            if (!double.IsFinite(sample))
                continue;

            var magnitude = Math.Abs(sample);
            peak = Math.Max(peak, magnitude);
            sumSquares += sample * sample;
            count++;
        }

        if (count == 0)
            return false;

        rms = Math.Sqrt(sumSquares / count);
        return true;
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs e)
    {
        if (e.Exception is not null)
            Faulted?.Invoke("Windows audio capture stopped: " + e.Exception.Message);
    }

    public void Dispose()
    {
        WasapiCapture? capture;
        lock (_gate)
        {
            if (_disposed)
                return;
            _disposed = true;
            _armedUntilUtc = DateTime.MinValue;
            capture = _capture;
            _capture = null;
        }

        if (capture is null)
            return;

        capture.DataAvailable -= OnDataAvailable;
        capture.RecordingStopped -= OnRecordingStopped;
        try { capture.StopRecording(); } catch { }
        capture.Dispose();
    }
}

/// <summary>Pure, testable thresholds for a short acoustic clap transient.</summary>
public static class ClapDetectionPolicy
{
    public static bool IsClap(double peakAmplitude, double rmsAmplitude)
    {
        return double.IsFinite(peakAmplitude) &&
               double.IsFinite(rmsAmplitude) &&
               peakAmplitude >= 0.42 &&
               rmsAmplitude >= 0.025 &&
               peakAmplitude >= rmsAmplitude * 3.0;
    }
}
