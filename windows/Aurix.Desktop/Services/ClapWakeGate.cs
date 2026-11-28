using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Aurix.Desktop.Services;

/// <summary>
/// Locally detects short, sharp clap transients and opens a eight-second
/// one-use window in which the AURIX wake phrase can be accepted. Audio is
/// analysed in short in-memory windows and is never saved or transmitted.
/// </summary>
public sealed class ClapWakeGate : IDisposable
{
    private readonly object _gate = new();
    private WasapiCapture? _capture;
    private MMDevice? _captureDevice;
    private MMDeviceEnumerator? _deviceEnumerator;
    private DateTime _armedUntilUtc = DateTime.MinValue;
    private DateTime _lastClapUtc = DateTime.MinValue;
    private DateTime _lastInputLevelUtc = DateTime.MinValue;
    private bool _disposed;

    public event Action? ClapDetected;
    public event Action<int>? InputLevelChanged;
    public event Action<string>? Faulted;

    public string CaptureDeviceName { get; private set; } = "Windows default microphone";

    public void Start()
    {
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (_capture is not null)
                return;

            var enumerator = new MMDeviceEnumerator();
            Exception? lastError = null;

            // System.Speech normally follows the Windows multimedia default.
            // Try that endpoint first, then Windows' console and communications
            // defaults in case the machine has different role assignments.
            foreach (var role in new[] { Role.Multimedia, Role.Console, Role.Communications })
            {
                MMDevice? device = null;
                WasapiCapture? capture = null;
                try
                {
                    device = enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, role);
                    capture = new WasapiCapture(device, useEventSync: false, audioBufferMillisecondsLength: 20);
                    capture.DataAvailable += OnDataAvailable;
                    capture.RecordingStopped += OnRecordingStopped;

                    // Publish the references before starting so the first audio
                    // callback always has a complete capture context.
                    _deviceEnumerator = enumerator;
                    _captureDevice = device;
                    _capture = capture;
                    CaptureDeviceName = device.FriendlyName;

                    capture.StartRecording();
                    return;
                }
                catch (Exception ex)
                {
                    lastError = ex;
                    if (capture is not null)
                    {
                        capture.DataAvailable -= OnDataAvailable;
                        capture.RecordingStopped -= OnRecordingStopped;
                        try { capture.Dispose(); } catch { }
                    }
                    try { device?.Dispose(); } catch { }

                    _capture = null;
                    _captureDevice = null;
                    _deviceEnumerator = null;
                }
            }

            enumerator.Dispose();
            throw new InvalidOperationException(
                "AURIX could not open a Windows microphone input. Check Settings > System > Sound > Input and Windows microphone privacy permissions.",
                lastError);
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

        var format = (sender as WasapiCapture)?.WaveFormat ?? capture?.WaveFormat;
        if (format is null ||
            !TryAnalyzeBuffer(e.Buffer, e.BytesRecorded, format,
                out var peak, out _, out var clapDetected))
            return;

        ReportInputLevel(peak);
        if (!clapDetected)
            return;

        var now = DateTime.UtcNow;
        lock (_gate)
        {
            if (_disposed || now - _lastClapUtc < TimeSpan.FromMilliseconds(500) ||
                now < _armedUntilUtc)
                return;

            _lastClapUtc = now;
            _armedUntilUtc = now.AddSeconds(8);
        }

        ClapDetected?.Invoke();
    }

    private void ReportInputLevel(double peak)
    {
        var now = DateTime.UtcNow;
        lock (_gate)
        {
            if (_disposed || now - _lastInputLevelUtc < TimeSpan.FromMilliseconds(500))
                return;
            _lastInputLevelUtc = now;
        }

        var percentage = (int)Math.Round(Math.Clamp(peak * 100d, 0d, 100d));
        InputLevelChanged?.Invoke(percentage);
    }

    private static bool TryAnalyzeBuffer(
        byte[] buffer,
        int bytesRecorded,
        WaveFormat format,
        out double peak,
        out double rms,
        out bool clapDetected)
    {
        peak = 0;
        rms = 0;
        clapDetected = false;

        var bytesPerSample = format.BitsPerSample / 8;
        var channels = format.Channels;
        if (bytesPerSample is < 1 or > 4 || channels < 1 || format.SampleRate < 1)
            return false;

        var bytesPerFrame = bytesPerSample * channels;
        var completeBytes = bytesRecorded - (bytesRecorded % bytesPerFrame);
        if (completeBytes < bytesPerFrame)
            return false;

        // A 5 ms analysis window preserves short, quieter transients instead of
        // averaging them away in a longer capture buffer.
        var framesPerWindow = Math.Max(1, format.SampleRate / 200);
        var windowBytes = Math.Max(bytesPerFrame, framesPerWindow * bytesPerFrame);

        for (var offset = 0; offset < completeBytes; offset += windowBytes)
        {
            var length = Math.Min(windowBytes, completeBytes - offset);
            length -= length % bytesPerFrame;
            if (length < bytesPerFrame)
                continue;

            if (!TryMeasure(buffer, offset, length, format, out var windowPeak, out var windowRms))
                return false;

            peak = Math.Max(peak, windowPeak);
            rms = Math.Max(rms, windowRms);
            if (ClapDetectionPolicy.IsClap(windowPeak, windowRms))
                clapDetected = true;
        }

        return true;
    }

    private static bool TryMeasure(
        byte[] buffer,
        int offset,
        int length,
        WaveFormat format,
        out double peak,
        out double rms)
    {
        peak = 0;
        rms = 0;
        var bits = format.BitsPerSample;
        var bytesPerSample = bits / 8;
        if (bytesPerSample is < 1 or > 4 || length < bytesPerSample)
            return false;

        var end = offset + length;
        var sumSquares = 0d;
        var count = 0;
        for (var sampleOffset = offset; sampleOffset + bytesPerSample <= end; sampleOffset += bytesPerSample)
        {
            double sample;
            if (format.Encoding == WaveFormatEncoding.IeeeFloat && bits == 32)
            {
                sample = BitConverter.ToSingle(buffer, sampleOffset);
            }
            else if (format.Encoding == WaveFormatEncoding.Pcm && bits == 8)
            {
                sample = (buffer[sampleOffset] - 128) / 128d;
            }
            else if (format.Encoding == WaveFormatEncoding.Pcm && bits == 16)
            {
                sample = BitConverter.ToInt16(buffer, sampleOffset) / 32768d;
            }
            else if (format.Encoding == WaveFormatEncoding.Pcm && bits == 24)
            {
                var value = buffer[sampleOffset] | (buffer[sampleOffset + 1] << 8) |
                            (buffer[sampleOffset + 2] << 16);
                if ((value & 0x800000) != 0)
                    value |= unchecked((int)0xFF000000);
                sample = value / 8388608d;
            }
            else if (format.Encoding == WaveFormatEncoding.Pcm && bits == 32)
            {
                sample = BitConverter.ToInt32(buffer, sampleOffset) / 2147483648d;
            }
            else
            {
                return false;
            }

            if (!double.IsFinite(sample))
                continue;

            // Apply a modest local pre-amplification before measuring. This
            // raises quiet signal levels for the detector without changing the
            // Windows microphone volume for other apps.
            sample = Math.Clamp(sample * ClapDetectionPolicy.SoftwareSignalBoost, -1d, 1d);
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
        bool report;
        lock (_gate)
            report = !_disposed;

        if (!report)
            return;

        var reason = e.Exception is null
            ? "Windows stopped delivering microphone audio unexpectedly."
            : "Windows audio capture stopped: " + e.Exception.Message;
        Faulted?.Invoke(reason);
    }

    public void Dispose()
    {
        WasapiCapture? capture;
        MMDevice? device;
        MMDeviceEnumerator? enumerator;
        lock (_gate)
        {
            if (_disposed)
                return;
            _disposed = true;
            _armedUntilUtc = DateTime.MinValue;
            capture = _capture;
            device = _captureDevice;
            enumerator = _deviceEnumerator;
            _capture = null;
            _captureDevice = null;
            _deviceEnumerator = null;
        }

        if (capture is not null)
        {
            capture.DataAvailable -= OnDataAvailable;
            capture.RecordingStopped -= OnRecordingStopped;
            try { capture.StopRecording(); } catch { }
            capture.Dispose();
        }

        device?.Dispose();
        enumerator?.Dispose();
    }
}

/// <summary>High-sensitivity, testable settings for a short acoustic clap transient.</summary>
public static class ClapDetectionPolicy
{
    // This local 2x preamp and lower thresholds help pick up quieter claps.
    // Thresholds are applied to the boosted samples, not raw mic percentages.
    public const double SoftwareSignalBoost = 2.0;
    public const double MinimumPeakAmplitude = 0.035;
    public const double MinimumRmsAmplitude = 0.0015;
    public const double MinimumPeakToRmsRatio = 2.5;

    public static bool IsClap(double peakAmplitude, double rmsAmplitude)
    {
        return double.IsFinite(peakAmplitude) &&
               double.IsFinite(rmsAmplitude) &&
               peakAmplitude >= MinimumPeakAmplitude &&
               rmsAmplitude >= MinimumRmsAmplitude &&
               peakAmplitude >= rmsAmplitude * MinimumPeakToRmsRatio;
    }
}
