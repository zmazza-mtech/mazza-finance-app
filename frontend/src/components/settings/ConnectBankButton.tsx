/**
 * Displays SimpleFIN connection status.
 * The Access URL is configured server-side — no client-side enrollment needed.
 */
export function ConnectBankButton() {
  return (
    <p className="text-sm text-green-600 dark:text-green-400 font-medium">
      Connected via SimpleFIN — accounts sync automatically.
    </p>
  );
}
