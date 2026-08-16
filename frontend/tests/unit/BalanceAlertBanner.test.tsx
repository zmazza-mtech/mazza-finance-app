import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BalanceAlertBanner } from '@/components/layout/BalanceAlertBanner';
import type { ForecastDay } from '@/api/types';

/**
 * The banner scans forward from the real current date, so the fixture is built
 * relative to it. Pinning literal dates here would make the suite pass or fail
 * depending on when it runs.
 */
function isoOffsetFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const AT_RISK_DATE = isoOffsetFromToday(3);

/** Six days from today, the balance falling below the green threshold on day 3. */
function days(balances: string[]): ForecastDay[] {
  return balances.map((runningBalance, i) => ({
    date: isoOffsetFromToday(i),
    transactions: [],
    dailyNet: '0.00',
    runningBalance,
  }));
}

const HEALTHY_THEN_LOW = days(['3000.00', '2500.00', '1800.00', '400.00', '350.00', '300.00']);
const HEALTHY_THEN_CRITICAL = days(['3000.00', '2500.00', '1800.00', '50.00', '40.00', '30.00']);
const ALWAYS_HEALTHY = days(['3000.00', '3000.00', '3000.00', '3000.00', '3000.00', '3000.00']);

function renderBanner(
  overrides: Partial<React.ComponentProps<typeof BalanceAlertBanner>> = {},
) {
  const props = {
    forecastDays: HEALTHY_THEN_LOW,
    greenThreshold: '1000',
    criticalThreshold: '200',
    onViewDate: vi.fn(),
    ...overrides,
  };
  return { ...render(<BalanceAlertBanner {...props} />), props };
}

beforeEach(() => {
  localStorage.clear();
});

describe('BalanceAlertBanner', () => {
  it('renders nothing while the balance stays healthy', () => {
    renderBanner({ forecastDays: ALWAYS_HEALTHY });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns on the first day the balance goes low', () => {
    renderBanner();

    expect(screen.getByRole('alert')).toHaveTextContent(/Low balance/);
  });

  it('escalates the wording when the first at-risk day is critical', () => {
    renderBanner({ forecastDays: HEALTHY_THEN_CRITICAL });

    expect(screen.getByRole('alert')).toHaveTextContent(/Critical balance/);
  });

  it('hands the at-risk date to onViewDate, so the link is not a dead end', async () => {
    const user = userEvent.setup();
    const { props } = renderBanner();

    // The date itself is the control, per PRD §10's "'View' link".
    const dateButton = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-label') !== 'Dismiss balance alert')!;
    await user.click(dateButton);

    expect(props.onViewDate).toHaveBeenCalledWith(AT_RISK_DATE);
  });

  it('stays dismissed once the user dismisses it', async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(screen.getByRole('button', { name: 'Dismiss balance alert' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
