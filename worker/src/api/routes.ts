/**
 * Every `/api/v1` route the Worker serves, enumerated.
 *
 * Exists so "no `/api` route without auth" can be *proved* rather than
 * reviewed (#76). The auth test walks this list and asserts each entry 401s
 * unauthenticated; a route added without auth fails that test instead of
 * shipping.
 *
 * It is a hand-maintained list, which is a cost — but Hono's router does not
 * expose its registrations in a form that survives `app.route()` mounting, and
 * a list that must be updated alongside a new route is a smaller risk than an
 * introspection trick that silently returns nothing.
 *
 * `/api/v1/health` is deliberately absent: a health check cannot carry a token.
 */
export interface ApiRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: string;
}

const UUID = '00000000-0000-4000-8000-000000000000';
const DATE = '2026-01-15';

export const API_ROUTES: ApiRoute[] = [
  { method: 'GET', path: '/api/v1/accounts' },
  { method: 'POST', path: '/api/v1/accounts' },
  { method: 'GET', path: `/api/v1/accounts/${UUID}` },
  { method: 'PATCH', path: `/api/v1/accounts/${UUID}` },

  { method: 'GET', path: '/api/v1/settings' },
  { method: 'PUT', path: '/api/v1/settings/theme' },

  { method: 'GET', path: '/api/v1/transactions' },
  { method: 'POST', path: '/api/v1/transactions' },
  { method: 'PATCH', path: `/api/v1/transactions/${UUID}` },
  { method: 'DELETE', path: `/api/v1/transactions/${UUID}` },
  { method: 'POST', path: '/api/v1/transactions/batch-categorize' },
  { method: 'POST', path: '/api/v1/transactions/backfill-categories' },

  { method: 'GET', path: `/api/v1/recurring?accountId=${UUID}` },
  { method: 'POST', path: '/api/v1/recurring' },
  { method: 'POST', path: '/api/v1/recurring/detect' },
  { method: 'PATCH', path: `/api/v1/recurring/${UUID}` },
  { method: 'DELETE', path: `/api/v1/recurring/${UUID}` },
  { method: 'GET', path: `/api/v1/recurring/${UUID}/overrides` },
  { method: 'POST', path: `/api/v1/recurring/${UUID}/overrides/${DATE}` },
  { method: 'DELETE', path: `/api/v1/recurring/${UUID}/overrides/${DATE}` },

  { method: 'GET', path: `/api/v1/forecast?accountId=${UUID}&startDate=${DATE}&endDate=${DATE}` },

  { method: 'GET', path: `/api/v1/reports/category-summary?accountId=${UUID}&startDate=${DATE}&endDate=${DATE}` },
  { method: 'GET', path: `/api/v1/reports/category-trend?accountId=${UUID}&asOf=${DATE}&months=3` },
  { method: 'GET', path: `/api/v1/reports/monthly?accountId=${UUID}&startMonth=2026-01&endMonth=2026-01` },
  { method: 'GET', path: '/api/v1/reports/uncategorized' },
  { method: 'GET', path: `/api/v1/reports/transactions.csv?accountId=${UUID}&startDate=${DATE}&endDate=${DATE}` },
  { method: 'GET', path: `/api/v1/reports/category-summary.csv?accountId=${UUID}&startDate=${DATE}&endDate=${DATE}` },

  { method: 'POST', path: '/api/v1/import/csv' },

  { method: 'POST', path: '/api/v1/sync' },
  { method: 'GET', path: '/api/v1/sync/status' },
];
