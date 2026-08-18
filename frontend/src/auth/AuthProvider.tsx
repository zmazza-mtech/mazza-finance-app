/**
 * Auth0 wiring (#77), per decision 4 of the replatform spec.
 *
 * Universal Login rather than an embedded form: passkeys, the reason Auth0 was
 * chosen, are hosted there, and an embedded credential form is the thing every
 * identity provider spends its documentation asking people not to build.
 *
 * **The known risk is the redirect on an installed iOS PWA.** iOS has
 * historically opened cross-origin authentication in a separate Safari
 * context, from which the user does not reliably land back inside the
 * standalone app. That is why decision 4 says social sign-in stays off the
 * phone's primary path, and it is what #81 exists to test on the real device
 * before anyone announces this. If it fails there, the fallbacks are a custom
 * Auth0 domain (paid) or `loginWithPopup`.
 */
import { useEffect, type ReactNode } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { readAuthConfig } from './config';
import { setTokenGetter, setUnauthorizedHandler } from './tokenProvider';

/**
 * Registers the token getter with the non-React API client.
 *
 * A component rather than a module import because `getAccessTokenSilently` is
 * bound to the Auth0 context and only exists inside it.
 */
function AuthBridge({ children }: { children: ReactNode }) {
  const { getAccessTokenSilently, isAuthenticated, loginWithRedirect } = useAuth0();

  useEffect(() => {
    setTokenGetter(async () => {
      if (!isAuthenticated) return null;
      return getAccessTokenSilently();
    });

    // A 401 means the session ended while the app was open. Sending the user
    // back to sign in is the only useful response; showing an error on five
    // screens at once is not.
    setUnauthorizedHandler(() => {
      void loginWithRedirect({ appState: { returnTo: window.location.pathname } });
    });
  }, [getAccessTokenSilently, isAuthenticated, loginWithRedirect]);

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const config = readAuthConfig();

  /*
   * Unconfigured is a real state, not an error.
   *
   * The Compose stack is still the live app and has no Auth0 tenant behind
   * it. Rendering the app without a provider there keeps that build working;
   * the Worker refuses every request without a token regardless, so this
   * cannot become an accidental way in.
   */
  if (!config) return <>{children}</>;

  return (
    <Auth0Provider
      domain={config.domain}
      clientId={config.clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        // Without an audience Auth0 issues an opaque token rather than a JWT,
        // and the Worker's verifier rejects every request with no useful
        // signal about why.
        audience: config.audience,
      }}
      // Survives the app being closed and reopened, which on a home-screen
      // PWA is most launches. In-memory would mean signing in every time.
      cacheLocation="localstorage"
      useRefreshTokens
      onRedirectCallback={(appState) => {
        window.history.replaceState({}, '', appState?.returnTo ?? window.location.pathname);
      }}
    >
      <AuthBridge>{children}</AuthBridge>
    </Auth0Provider>
  );
}
