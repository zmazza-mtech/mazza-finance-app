import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '@/components/shared/Icon';

interface Tab {
  to: string;
  /** The tab bar's own label. Not always the route's desktop nav label. */
  label: string;
  icon: IconName;
  /** Index routes match every path unless the match is exact. */
  end: boolean;
}

/**
 * The transactions tab reads "Activity" because the handoff's tab bar does —
 * "Transactions" does not fit under a 22px icon at 10px without truncating.
 * The route is still `/transactions` and the desktop nav still says
 * Transactions; this is a label, not a rename.
 */
const TABS: readonly Tab[] = [
  { to: '/', label: 'Calendar', icon: 'tab-calendar', end: true },
  { to: '/transactions', label: 'Activity', icon: 'tab-activity', end: false },
  { to: '/recurring', label: 'Recurring', icon: 'tab-recurring', end: false },
  { to: '/reports', label: 'Reports', icon: 'tab-reports', end: false },
  { to: '/settings', label: 'Settings', icon: 'tab-settings', end: false },
];

/**
 * The phone shell's bottom navigation.
 *
 * Rendered only below the phone breakpoint, and only ever alongside the
 * desktop header nav's absence — two "Main navigation" landmarks in one
 * document would be a duplicate landmark and duplicate accessible names.
 *
 * `NavLink` supplies `aria-current="page"` on the active route, so the current
 * tab is programmatically determinable rather than signalled by colour alone.
 */
export function PhoneTabBar() {
  return (
    <nav
      aria-label="Main navigation"
      className="z-30 flex-shrink-0 border-t border-cream-mid bg-cream/95 pb-safe-bottom backdrop-blur-[12px]"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ to, label, icon, end }) => (
          <li key={to} className="min-w-0">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-[52px] flex-col items-center justify-center gap-[3px] px-1 pb-1.5 pt-2 transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage ${
                  isActive ? 'text-sage-deep' : 'text-warm-gray'
                }`
              }
            >
              <Icon name={icon} size={22} />
              <span className="truncate text-[10px] tracking-[0.02em]">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
