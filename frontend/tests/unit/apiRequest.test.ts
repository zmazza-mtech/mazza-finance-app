/**
 * How the API client builds a request (#77).
 *
 * `buildRequestInit` is pure, so the header merging can be asserted directly
 * rather than through a stubbed `fetch`. That matters here because the thing
 * being added is an Authorization header, and the existing merge had a bug
 * that would have silently dropped it.
 */
import { describe, it, expect } from 'vitest';
import { buildRequestInit } from '@/api/client';

describe('buildRequestInit', () => {
  it('sets the JSON content type by default', () => {
    const init = buildRequestInit({}, null);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('attaches the bearer token when there is one', () => {
    const init = buildRequestInit({}, 'a.b.c');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer a.b.c');
  });

  it('sends no Authorization header when there is no token', () => {
    // An empty bearer is not the same as no bearer: it invites the server to
    // distinguish "malformed" from "absent" on something that means neither.
    const init = buildRequestInit({}, null);
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('keeps the content type when the caller supplies its own headers', () => {
    // The original merge spread `options` after `headers`, so a caller's
    // headers object replaced the merged one wholesale and Content-Type
    // vanished. Adding Authorization to that merge would have made it vanish
    // too, on exactly the requests that carry a body.
    const init = buildRequestInit({ headers: { 'X-Trace': '1' } }, 'a.b.c');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer a.b.c');
    expect(headers['X-Trace']).toBe('1');
  });

  it('lets a caller override the content type deliberately', () => {
    const init = buildRequestInit({ headers: { 'Content-Type': 'text/csv' } }, null);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/csv');
  });

  it('carries the method and body through untouched', () => {
    const init = buildRequestInit({ method: 'POST', body: '{"a":1}' }, null);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
  });
});
