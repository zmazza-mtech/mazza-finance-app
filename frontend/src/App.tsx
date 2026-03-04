import { createContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { CalendarPage } from '@/pages/CalendarPage';
import { RecurringPage } from '@/pages/RecurringPage';
import { TransactionsPage } from '@/pages/TransactionsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { getAccounts } from '@/api/client';

// ---------------------------------------------------------------------------
// Account context — selected account persisted to localStorage
// ---------------------------------------------------------------------------

const ACCOUNT_KEY = 'mazza-selected-account';

interface AccountContextValue {
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
}

export const AccountContext = createContext<AccountContextValue>({
  selectedAccountId: '',
  setSelectedAccountId: () => {},
});

// ---------------------------------------------------------------------------
// Query client
// ---------------------------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

export function App() {
  const [selectedAccountId, setSelectedAccountIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(ACCOUNT_KEY) ?? '';
    } catch {
      return '';
    }
  });

  // On first load, pick the first available account if nothing is stored or the
  // stored ID no longer exists (e.g. after a database reset).
  useEffect(() => {
    getAccounts()
      .then((accounts) => {
        const bankAccounts = accounts.filter(
          (a) => (a.type === 'checking' || a.type === 'savings') && a.isActive,
        );
        const storedIsValid = bankAccounts.some((a) => a.id === selectedAccountId);
        if (!storedIsValid && bankAccounts.length > 0) {
          setSelectedAccountId(bankAccounts[0]!.id);
        }
      })
      .catch(() => {/* silent — user can select manually */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setSelectedAccountId(id: string) {
    setSelectedAccountIdState(id);
    try {
      localStorage.setItem(ACCOUNT_KEY, id);
    } catch { /* noop */ }
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AccountContext.Provider value={{ selectedAccountId, setSelectedAccountId }}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<CalendarPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="recurring" element={<RecurringPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AccountContext.Provider>
    </QueryClientProvider>
  );
}
