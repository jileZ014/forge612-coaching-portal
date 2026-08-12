import { auth } from '@/lib/firebase';

/**
 * fetch() for this app's own /api routes, with the signed-in coach's Firebase ID
 * token attached.
 *
 * Every billable / PII / messaging route now enforces requireCoach() server-side
 * (2026-08-11 audit), so a bare fetch() from the dashboard gets a 401. Use this
 * instead of fetch() for anything under /api/.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : '';

  const headers = new Headers(init.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, { ...init, headers });
}
