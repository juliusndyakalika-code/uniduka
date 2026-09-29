import { io, type Socket } from 'socket.io-client';
import { API_BASE } from '../config';

/**
 * Opening the realtime connection.
 *
 * Both call sites used `io({ auth: { token } })`, which has no URL and so
 * connects to the page's own origin. The front end and the API are separate
 * hosts in production, so that dialled the static site, where nothing listens.
 * The origin is derived from the same value the HTTP client uses, so the two
 * cannot point at different places.
 *
 * The server now refuses a connection without a valid token, so a caller with
 * no session must not open one at all: it would fail, retry, and fail again.
 */

/** https://api.example.com/api/v1 → https://api.example.com; /api/v1 → same origin. */
function apiOrigin(): string | undefined {
  try {
    // A relative base means the API is served from this origin, and passing
    // undefined is how socket.io is told to use it.
    if (!/^https?:\/\//i.test(API_BASE)) return undefined;
    return new URL(API_BASE).origin;
  } catch {
    return undefined;
  }
}

export function connectSocket(token: string | null | undefined): Socket | null {
  if (!token) return null;
  const origin = apiOrigin();
  // No withCredentials: the token travels in the auth payload, not a cookie,
  // and asking for credentials only tightens the CORS preflight for nothing.
  return origin ? io(origin, { auth: { token } }) : io({ auth: { token } });
}
