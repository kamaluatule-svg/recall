// Verifies Firebase Auth ID tokens (RS256 JWTs) using only node:crypto.
// Rules follow Firebase's "Verify ID tokens" guide: valid signature from Google's
// securetoken keys, and claims exp/iat/aud/iss/sub/auth_time all correct.

import { createPublicKey, verify } from 'node:crypto';
import { HttpError, unauthorized } from '../lib/http.js';

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const CLOCK_SKEW_SEC = 60;

const b64urlToBuffer = (s) => Buffer.from(s, 'base64url');
const parseJson = (buf) => {
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw unauthorized('Malformed token');
  }
};

export function createFirebaseVerifier({
  projectId,
  fetchImpl = fetch,
  jwksUrl = JWKS_URL,
  now = () => Date.now(),
}) {
  let keys = new Map(); // kid -> KeyObject
  let expiresAt = 0;
  let inflight = null;

  async function refreshKeys() {
    if (inflight) return inflight;
    inflight = (async () => {
      const res = await fetchImpl(jwksUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
      const { keys: jwks } = await res.json();
      const next = new Map();
      for (const jwk of jwks || []) {
        if (jwk.kid) next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
      }
      const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
      keys = next;
      expiresAt = now() + (maxAge ? Number(maxAge[1]) * 1000 : 3_600_000);
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function keyFor(kid) {
    if (!keys.has(kid) || now() >= expiresAt) {
      try {
        await refreshKeys();
      } catch (err) {
        if (!keys.has(kid)) throw err; // no usable cached key either
      }
    }
    return keys.get(kid);
  }

  /** Returns { uid, email, name, picture } or throws HttpError(401). */
  return async function verifyIdToken(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw unauthorized('Malformed token');
    const [h, p, s] = parts;
    const header = parseJson(b64urlToBuffer(h));
    if (header.alg !== 'RS256' || !header.kid) throw unauthorized('Unsupported token');

    let key;
    try {
      key = await keyFor(header.kid);
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'jwks_unavailable', error: String(err) }));
      throw new HttpError(503, 'auth_unavailable', 'Sign-in service is temporarily unavailable');
    }
    if (!key) throw unauthorized('Unknown signing key');

    const valid = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, b64urlToBuffer(s));
    if (!valid) throw unauthorized('Invalid token signature');

    const claims = parseJson(b64urlToBuffer(p));
    const nowSec = Math.floor(now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SEC < nowSec) throw unauthorized('Token expired');
    if (typeof claims.iat !== 'number' || claims.iat - CLOCK_SKEW_SEC > nowSec) throw unauthorized('Token issued in the future');
    if (typeof claims.auth_time !== 'number' || claims.auth_time - CLOCK_SKEW_SEC > nowSec) throw unauthorized('Invalid auth time');
    if (claims.aud !== projectId) throw unauthorized('Token is for a different project');
    if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw unauthorized('Invalid token issuer');
    if (typeof claims.sub !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub)) {
      throw unauthorized('Invalid token subject');
    }

    return {
      uid: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : null,
      name: typeof claims.name === 'string' ? claims.name : null,
      picture: typeof claims.picture === 'string' ? claims.picture : null,
    };
  };
}
