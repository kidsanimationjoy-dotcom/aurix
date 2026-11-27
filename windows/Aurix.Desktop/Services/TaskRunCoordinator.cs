namespace Aurix.Desktop.Services;

/// <summary>
/// Owns the active desktop task cancellation source. A completed older task
/// must never clear or dispose a newer task's cancellation source.
/// </summary>
public sealed class TaskRunCoordinator
{
    private readonly object _gate = new();
    private CancellationTokenSource? _current;

    public CancellationTokenSource BeginRun()
    {
        var next = new CancellationTokenSource();
        CancellationTokenSource? previous;

        lock (_gate)
        {
            previous = _current;
            _current = next;
        }

        TryCancel(previous);
        return next;
    }

    public bool IsCurrent(CancellationTokenSource run)
    {
        lock (_gate)
            return ReferenceEquals(_current, run);
    }

    public void CancelCurrent()
    {
        CancellationTokenSource? current;
        lock (_gate)
            current = _current;

        TryCancel(current);
    }

    public void CompleteRun(CancellationTokenSource run)
    {
        lock (_gate)
        {
            if (ReferenceEquals(_current, run))
                _current = null;
        }

        run.Dispose();
    }

    private static void TryCancel(CancellationTokenSource? source)
    {
        if (source is null)
            return;

        try
        {
            source.Cancel();
        }
        catch (ObjectDisposedException)
        {
            // The previous run completed between being replaced and cancelled.
        }
        catch (AggregateException)
        {
            // Cancellation has still been requested; one callback must not
            // prevent AURIX from starting or stopping the current task.
        }
    }
}
