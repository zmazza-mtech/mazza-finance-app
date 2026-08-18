/**
 * The bridge between Auth0's React context and the non-React API client.
 *
 * `client.ts` is a module of plain functions called from TanStack Query
 * hooks, not a component, so it cannot read `useAuth0()`. Rather than thread a
 * token through every call site — 40-odd of them — the provider registers a
 * getter here once and the client asks for a token when it needs one.
 *
 * Module-level mutable state, deliberately and narrowly: one function, set
 * once at mount, and a default that returns null so an unauthenticated call
 * is a 401 from the server rather than an exception in the client.
 */

/** Returns a valid access token, refreshing it if necessary, or null. */
export type TokenGetter = () => Promise<string | null>;

/** Called when the API answers 401, so the app can send the user to sign in. */
export type UnauthorizedHandler = () => void;

let getToken: TokenGetter = async () => null;
let onUnauthorized: UnauthorizedHandler = () => {};

export function setTokenGetter(getter: TokenGetter): void {
  getToken = getter;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

/**
 * The token for the next request.
 *
 * Never throws. Auth0's `getAccessTokenSilently` rejects when the session has
 * gone — and a rejection here would surface as a network error on every
 * screen at once, which reads as "the app is broken" rather than "you are
 * signed out". Returning null lets the request proceed, collect its 401, and
 * take the sign-in path deliberately.
 */
export async function currentToken(): Promise<string | null> {
  try {
    return await getToken();
  } catch {
    return null;
  }
}

export function notifyUnauthorized(): void {
  onUnauthorized();
}

/** Test seam — resets module state between cases. */
export function resetAuthBridge(): void {
  getToken = async () => null;
  onUnauthorized = () => {};
}
