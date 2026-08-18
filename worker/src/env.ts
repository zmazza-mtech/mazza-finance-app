/** Worker bindings, declared once so routers do not each restate them. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENCRYPTION_KEY: string;
}
