import { useMemo, useState, useRef } from 'react';
import { getBalanceHealth } from '@/lib/balance';
import type { ForecastDay } from '@/api/types';

const DISMISS_KEY = 'mazza-alert-dismissed';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SCAN_DAYS = 30;

interface BalanceAlertBannerProps {
  forecastDays: ForecastDay[];
  greenThreshold: string;
  criticalThreshold: string;
  onViewDate: (date: string) => void;
}

/**
 * Fixed banner below the nav header. Scans the next 30 days for the first day
 * the running balance enters warning or critical territory.
 *
 * Dismissal is stored in localStorage with a 7-day cooldown.
 * The dismissed state resets if the condition clears and then reappears.
 */
export function BalanceAlertBanner({
  forecastDays,
  greenThreshold,
  criticalThreshold,
  onViewDate,
}: BalanceAlertBannerProps) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      if (!stored) return false;
      const ts = parseInt(stored, 10);
      return Date.now() - ts < COOLDOWN_MS;
    } catch {
      return false;
    }
  });

  // Find first at-risk day within next 30 days
  const alertDay = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let count = 0;
    for (const day of forecastDays) {
      if (day.date < today) continue;
      if (count >= SCAN_DAYS) break;
      count++;
      const health = getBalanceHealth(
        day.runningBalance,
        greenThreshold,
        criticalThreshold,
      );
      if (health === 'warning' || health === 'critical') {
        return { date: day.date, health };
      }
    }
    return null;
  }, [forecastDays, greenThreshold, criticalThreshold]);

  // Reset dismissed state if condition clears then returns
  const prevAlertRef = useRef<string | null>(null);
  if (alertDay === null && prevAlertRef.current !== null) {
    // Condition cleared — wipe the dismiss timestamp so it shows again if it returns
    try { localStorage.removeItem(DISMISS_KEY); } catch { /* noop */ }
    setDismissed(false);
  }
  prevAlertRef.current = alertDay?.date ?? null;

  if (!alertDay || dismissed) return null;

  const isCritical = alertDay.health === 'critical';
  const bgClass = isCritical
    ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200';

  const label = isCritical ? 'Critical balance' : 'Low balance';

  function handleDismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
    setDismissed(true);
  }

  return (
    <div
      role="alert"
      aria-label={`${label} alert`}
      className={`border-b px-4 py-2 flex items-center justify-between gap-3 ${bgClass}`}
    >
      <p className="text-sm">
        <span className="font-semibold">{label}:</span>{' '}
        Your balance is projected to reach{' '}
        {isCritical ? 'critical' : 'low'} levels on{' '}
        <button
          type="button"
          onClick={() => onViewDate(alertDay.date)}
          className="underline font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-current rounded"
        >
          {formatDate(alertDay.date)}
        </button>
        .
      </p>
      <button
        type="button"
        aria-label="Dismiss balance alert"
        onClick={handleDismiss}
        className="shrink-0 text-sm underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-current rounded"
      >
        Dismiss
      </button>
    </div>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
