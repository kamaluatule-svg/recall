// Tiny PostgREST client for Supabase (what supabase-js does under the hood),
// built on fetch so the API needs no npm dependencies.

import { HttpError, upstream } from '../lib/http.js';

const PAGE = 1000; // Supabase's default max rows per request

export function createSupabase({ url, serviceKey, fetchImpl = fetch, timeoutMs = 8000 }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;

  async function request(method, table, { filters = {}, extra = [], body, prefer = [], headers = {} } = {}) {
    const params = new URLSearchParams();
    for (const [col, val] of Object.entries(filters)) params.append(col, `eq.${val}`);
    for (const [k, v] of extra) params.append(k, v);
    const qs = params.toString();
    const res = await fetchImpl(`${base}/${table}${qs ? `?${qs}` : ''}`, {
      method,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        ...(prefer.length ? { Prefer: prefer.join(',') } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(JSON.stringify({ level: 'error', msg: 'supabase_error', method, table, status: res.status, detail: detail.slice(0, 500) }));
      if (res.status === 409) throw new HttpError(409, 'conflict', 'Record already exists');
      throw upstream();
    }
    return res;
  }

  const json = async (res) => (res.status === 204 ? [] : res.json());

  return {
    /** All rows matching eq-filters, paging past the 1000-row cap. */
    async select(table, { filters = {}, order, limit = Infinity } = {}) {
      const rows = [];
      for (let from = 0; from < limit; from += PAGE) {
        const to = Math.min(from + PAGE, limit) - 1;
        const res = await request('GET', table, {
          filters,
          extra: [['select', '*'], ...(order ? [['order', order]] : [])],
          headers: { Range: `${from}-${to}`, 'Range-Unit': 'items' },
        });
        const page = await json(res);
        rows.push(...page);
        if (page.length < to - from + 1) break;
      }
      return rows;
    },

    async selectOne(table, filters) {
      const res = await request('GET', table, { filters, extra: [['select', '*'], ['limit', '1']] });
      return (await json(res))[0] ?? null;
    },

    async count(table, filters) {
      const res = await request('HEAD', table, {
        filters,
        extra: [['select', 'id']],
        prefer: ['count=exact'],
        headers: { Range: '0-0', 'Range-Unit': 'items' },
      });
      const total = /\/(\d+)$/.exec(res.headers.get('content-range') || '');
      return total ? Number(total[1]) : 0;
    },

    async insert(table, row) {
      const res = await request('POST', table, { body: row, prefer: ['return=representation'] });
      return (await json(res))[0];
    },

    async upsert(table, row, onConflict = 'id') {
      const res = await request('POST', table, {
        extra: [['on_conflict', onConflict]],
        body: row,
        prefer: ['resolution=merge-duplicates', 'return=representation'],
      });
      return (await json(res))[0];
    },

    /** Returns updated rows ([] when nothing matched the filters). */
    async update(table, filters, patch) {
      const res = await request('PATCH', table, { filters, body: patch, prefer: ['return=representation'] });
      return json(res);
    },

    /** Returns deleted rows ([] when nothing matched the filters). */
    async remove(table, filters) {
      const res = await request('DELETE', table, { filters, prefer: ['return=representation'] });
      return json(res);
    },
  };
}
