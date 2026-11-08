// Recall backend client: Firebase Google sign-in + authenticated calls to the Recall API.
// Loaded before app.js. Exposes window.RecallBackend.
(function () {
  const cfg = window.RECALL_CONFIG || {};
  const fb = cfg.firebase || {};
  const configured = Boolean(
    window.firebase && cfg.apiUrl && fb.apiKey && fb.projectId && !/YOUR_/.test(fb.apiKey + cfg.apiUrl),
  );
  let auth = null;
  let queue = Promise.resolve();
  let warmupStarted = false;

  const api = (path) => `${cfg.apiUrl.replace(/\/+$/, '')}/api/v1${path}`;

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  async function request(method, path, body, { timeoutMs = 20000 } = {}) {
    if (!auth || !auth.currentUser) throw new ApiError('You are signed out', 401, 'unauthorized');
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await auth.currentUser.getIdToken(attempt > 0); // refresh once on 401
      let res;
      try {
        res = await fetch(api(path), {
          method,
          headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new ApiError(
          err.name === 'TimeoutError' ? 'The server took too long to respond' : 'Cannot reach the server. Check your connection.',
          0,
          'network',
        );
      }
      if (res.status === 401 && attempt === 0) continue;
      if (res.status === 204) return null;
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const e = data && data.error;
        const detail = e && e.details ? ` (${Object.entries(e.details).map(([k, v]) => `${k} ${v}`).join('; ')})` : '';
        throw new ApiError(((e && e.message) || `Request failed (${res.status})`) + detail, res.status, e && e.code);
      }
      return data;
    }
  }

  const toUser = (u) =>
    u && { id: u.uid, email: u.email, user_metadata: { full_name: u.displayName, avatar_url: u.photoURL } };

  window.RecallBackend = {
    ready: false,
    init() {
      if (!configured) return false;
      if (!firebase.apps.length) firebase.initializeApp(fb);
      auth = firebase.auth();
      this.ready = true;
      this.warmApi();
      return true;
    },
    // Wake the free Render instance while the user is viewing the landing page.
    // The response body is not needed; this GET is only a best-effort warm-up.
    warmApi() {
      if (warmupStarted || !cfg.apiUrl) return;
      warmupStarted = true;
      fetch(`${cfg.apiUrl.replace(/\/+$/, '')}/health`, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: AbortSignal.timeout(65000),
      }).catch(() => {});
    },
    onAuthChange(cb, onError) {
      return auth.onAuthStateChanged(
        (u) => cb(toUser(u)),
        (error) => { if (onError) onError(error); },
      );
    },
    async signInWithGoogle() {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await auth.signInWithPopup(provider);
      } catch (err) {
        if (err.code === 'auth/popup-blocked') return auth.signInWithRedirect(provider);
        throw err;
      }
    },
    friendlyAuthError(err) {
      const map = {
        'auth/popup-closed-by-user': 'Sign-in was cancelled.',
        'auth/cancelled-popup-request': 'Sign-in was cancelled.',
        'auth/unauthorized-domain': 'This site is not an authorised domain in Firebase. See docs/DEPLOYMENT.md.',
        'auth/network-request-failed': 'Network error. Check your connection and try again.',
      };
      return map[err && err.code] || (err && err.message) || 'Unable to sign in. Please try again.';
    },
    signOut() {
      return auth.signOut();
    },
    request,
    /** Runs writes strictly in order so "create deck" always lands before "add card". */
    enqueue(task) {
      const run = queue.then(task);
      queue = run.catch(() => {});
      return run;
    },
    write(method, path, body) {
      return this.enqueue(() => request(method, path, body));
    },
    flush() {
      return queue;
    },
  };
})();
