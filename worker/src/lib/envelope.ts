/**
 * The `{ data, error }` envelope, unchanged from the Express backend so the
 * frontend's single `request()` wrapper does not move (#68).
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ data, error: null }, status);
}

export function fail(c: Context, error: unknown, status: ContentfulStatusCode) {
  return c.json({ data: null, error }, status);
}

/**
 * The 500 path, with the cause logged and never returned.
 *
 * Express leaked nothing here either; keeping the shape identical means a
 * client cannot tell the two servers apart on the unhappy path any more than
 * on the happy one.
 */
export function serverError(c: Context, where: string, err: unknown) {
  console.error(`${where} failed`, {
    message: err instanceof Error ? err.message : String(err),
  });
  return fail(c, 'Internal server error', 500);
}
