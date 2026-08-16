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
    ? 'border-danger-line bg-danger-bg text-error-dark'
    : 'border-warning-line bg-warning-bg text-copper-dark';

  const label = isCritical ? 'Critical balance' : 'Low balance';

  function handleDismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
    setDismissed(true);
  }

  return (
    <div
      role="alert"
      aria-label={`${label} alert`}
      className={`flex items-center justify-between gap-3 border-b px-6 py-2.5 ${bgClass}`}
    >
      <p className="text-sm">
        <span className="font-semibold">{label}:</span>{' '}
        Your balance is projected to reach{' '}
        {isCritical ? 'critical' : 'low'} levels on{' '}
        <button
          type="button"
          onClick={() => onViewDate(alertDay.date)}
          className="rounded font-medium underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-1"
        >
          {formatDate(alertDay.date)}
        </button>
        .
      </p>
      <button
        type="button"
        aria-label="Dismiss balance alert"
        onClick={handleDismiss}
        className="hit-target shrink-0 rounded text-sm underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
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
