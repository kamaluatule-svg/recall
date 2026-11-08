// Minimal path router with :params. Routes are public only when { auth: false }.

export class Router {
  #routes = [];

  add(method, pattern, handler, { auth = true } = {}) {
    const keys = [];
    const regex = new RegExp(
      '^' + pattern.replace(/:([A-Za-z]+)/g, (_, key) => (keys.push(key), '([^/]+)')) + '/?$',
    );
    this.#routes.push({ method, regex, keys, handler, auth });
  }

  /** Returns { route, params } or { methodNotAllowed: true } or null. */
  match(method, path) {
    let pathMatched = false;
    for (const route of this.#routes) {
      const m = route.regex.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params = {};
      route.keys.forEach((key, i) => (params[key] = decodeURIComponent(m[i + 1])));
      return { route, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}
