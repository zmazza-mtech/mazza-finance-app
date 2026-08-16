export type DetectStatus = 'idle' | 'success' | 'none' | 'error';

interface ScanResultMessageProps {
  status: DetectStatus;
  detected: number;
  expired: number;
}

/**
 * Feedback line under the Recurring header after a pattern scan.
 *
 * Success is sage, an empty result is stone, a failure is the error color and
 * is announced as an alert. Nothing renders before a scan has run.
 */
export function ScanResultMessage({ status, detected, expired }: ScanResultMessageProps) {
  if (status === 'idle') return null;

  if (status === 'error') {
    return (
      <p role="alert" className="mb-5 text-sm text-error">
        Scan failed — try again.
      </p>
    );
  }

  if (status === 'none') {
    return (
      <p role="status" className="mb-5 text-sm text-stone">
        No new patterns detected.
      </p>
    );
  }

  const parts: string[] = [];
  if (detected > 0) {
    parts.push(`Found ${detected} new pattern${detected === 1 ? '' : 's'}.`);
  }
  if (expired > 0) {
    parts.push(`Ended ${expired} stale series.`);
  }

  return (
    <p role="status" className="mb-5 text-sm text-sage-dark">
      {parts.join(' ')}
    </p>
  );
}
