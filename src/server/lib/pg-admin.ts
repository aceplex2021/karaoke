/**
 * Minimal Supabase-admin-compatible client backed by node-pg.
 * Supports the query patterns used by karaoke API routes + queue-order.
 */
import { query, notifyRoom } from '@/server/lib/db';

type Filter =
  | { type: 'eq'; col: string; val: unknown }
  | { type: 'neq'; col: string; val: unknown }
  | { type: 'in'; col: string; val: unknown[] }
  | { type: 'is'; col: string; val: null | boolean }
  | { type: 'not_is'; col: string; val: null }
  | { type: 'gt'; col: string; val: unknown }
  | { type: 'gte'; col: string; val: unknown }
  | { type: 'lt'; col: string; val: unknown }
  | { type: 'lte'; col: string; val: unknown }
  | { type: 'ilike'; col: string; val: string };

type Order = { col: string; ascending: boolean; nullsFirst?: boolean };

type NestSpec = {
  alias: string; // result key
  table: string;
  fk: string; // column on parent OR child depending on direction
  many: boolean;
  columns: string[] | '*';
  children: NestSpec[];
  // If true, parent[fk] = child.id (belongsTo). If false, child[fk] = parent.id (hasMany)
  belongsTo: boolean;
};

function quoteIdent(id: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
    throw new Error(`Invalid identifier: ${id}`);
  }
  return `"${id}"`;
}

/** node-pg needs JSON/JSONB values as strings; leave Date/Buffer alone. */
function encodeParam(val: unknown): unknown {
  if (val === undefined) return null;
  if (
    val !== null &&
    typeof val === 'object' &&
    !(val instanceof Date) &&
    !Buffer.isBuffer(val)
  ) {
    return JSON.stringify(val);
  }
  return val;
}

function parseSelect(selectStr: string): { columns: string[] | '*'; nests: NestSpec[] } {
  const raw = selectStr.trim();
  if (!raw || raw === '*') return { columns: '*', nests: [] };

  // Flatten whitespace for simpler parse of nested blocks
  const nests: NestSpec[] = [];
  const topCols: string[] = [];

  // Tokenize top-level comma-separated parts, respecting parentheses
  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());

  for (const part of parts) {
    const nestMatch = part.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)(?:!([a-zA-Z_][a-zA-Z0-9_]*))?\s*\(([\s\S]*)\)$/
    );
    if (nestMatch) {
      const table = nestMatch[1];
      const fk = nestMatch[2] || guessFk(table);
      const inner = nestMatch[3].trim();
      const parsedInner = parseSelect(inner || '*');
      // Heuristic: !fk on nested from parent usually means belongsTo via parent.fk
      // Files nested under versions use !version_id meaning hasMany on child.version_id
      const belongsTo = !table.endsWith('files') && !table.includes('participants');
      nests.push({
        alias: table,
        table,
        fk,
        many: !belongsTo,
        columns: parsedInner.columns,
        children: parsedInner.nests,
        belongsTo: nestMatch[2] ? table !== 'kara_files' : belongsTo,
      });
      // Fix belongsTo for known patterns
      if (table === 'kara_files') {
        nests[nests.length - 1].belongsTo = false;
        nests[nests.length - 1].many = true;
        nests[nests.length - 1].fk = nestMatch[2] || 'version_id';
      } else if (table === 'kara_versions' || table === 'kara_users' || table === 'kara_languages') {
        nests[nests.length - 1].belongsTo = true;
        nests[nests.length - 1].many = false;
        nests[nests.length - 1].fk = nestMatch[2] || guessFk(table);
      }
      continue;
    }
    if (part === '*') {
      return { columns: '*', nests };
    }
    topCols.push(part.replace(/\s+/g, ''));
  }

  return { columns: topCols.length ? topCols : '*', nests };
}

function guessFk(table: string): string {
  if (table === 'kara_versions') return 'version_id';
  if (table === 'kara_users') return 'user_id';
  if (table === 'kara_languages') return 'language_id';
  if (table === 'kara_files') return 'version_id';
  if (table === 'kara_song_groups') return 'group_id';
  return 'id';
}

async function expandNests(rows: any[], nests: NestSpec[]): Promise<any[]> {
  if (!rows.length || !nests.length) return rows;

  for (const nest of nests) {
    if (nest.belongsTo) {
      const ids = [
        ...new Set(
          rows.map((r) => r[nest.fk]).filter((v) => v !== null && v !== undefined)
        ),
      ];
      let byId = new Map<string, any>();
      if (ids.length) {
        const cols =
          nest.columns === '*'
            ? '*'
            : nest.columns.map(quoteIdent).join(', ');
        const { rows: related } = await query(
          `SELECT ${cols} FROM ${quoteIdent(nest.table)} WHERE ${quoteIdent('id')} = ANY($1::uuid[])`,
          [ids]
        );
        const expanded = await expandNests(related, nest.children);
        byId = new Map(expanded.map((r) => [String(r.id), r]));
      }
      for (const row of rows) {
        const key = row[nest.fk];
        row[nest.alias] = key != null ? byId.get(String(key)) || null : null;
      }
    } else {
      // hasMany: child[fk] = parent.id
      const parentIds = rows.map((r) => r.id).filter(Boolean);
      let byParent = new Map<string, any[]>();
      if (parentIds.length) {
        const cols =
          nest.columns === '*'
            ? '*'
            : ['id', nest.fk, ...nest.columns.filter((c) => c !== 'id' && c !== nest.fk)]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map(quoteIdent)
                .join(', ');
        const { rows: related } = await query(
          `SELECT ${cols} FROM ${quoteIdent(nest.table)} WHERE ${quoteIdent(nest.fk)} = ANY($1::uuid[])`,
          [parentIds]
        );
        const expanded = await expandNests(related, nest.children);
        for (const child of expanded) {
          const pid = String(child[nest.fk]);
          if (!byParent.has(pid)) byParent.set(pid, []);
          byParent.get(pid)!.push(child);
        }
      }
      for (const row of rows) {
        row[nest.alias] = byParent.get(String(row.id)) || [];
      }
    }
  }
  return rows;
}

class FilterBuilder {
  constructor(
    private table: string,
    private filters: Filter[] = [],
    private orders: Order[] = [],
    private limitN: number | null = null,
    private offsetN: number | null = null,
    private selectSpec: { columns: string[] | '*'; nests: NestSpec[] } = {
      columns: '*',
      nests: [],
    },
    private headOnly = false,
    private wantCount = false,
    private mutating: null | { kind: 'insert'; row: any | any[] } | { kind: 'update'; row: any } | { kind: 'delete' } = null,
    private returnRows = false
  ) {}

  select(columns: string = '*', opts?: { count?: 'exact'; head?: boolean }) {
    this.selectSpec = parseSelect(columns);
    this.headOnly = Boolean(opts?.head);
    this.wantCount = opts?.count === 'exact';
    this.returnRows = true;
    return this;
  }

  insert(row: any | any[]) {
    this.mutating = { kind: 'insert', row };
    return this;
  }

  update(row: any) {
    this.mutating = { kind: 'update', row };
    return this;
  }

  delete() {
    this.mutating = { kind: 'delete' };
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ type: 'eq', col, val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ type: 'neq', col, val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ type: 'in', col, val });
    return this;
  }
  is(col: string, val: null | boolean) {
    this.filters.push({ type: 'is', col, val });
    return this;
  }
  not(col: string, op: string, val: unknown) {
    if (op === 'is' && val === null) {
      this.filters.push({ type: 'not_is', col, val: null });
    } else {
      throw new Error(`Unsupported not(${col}, ${op})`);
    }
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ type: 'gt', col, val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ type: 'gte', col, val });
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push({ type: 'lt', col, val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ type: 'lte', col, val });
    return this;
  }
  ilike(col: string, val: string) {
    this.filters.push({ type: 'ilike', col, val });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({
      col,
      ascending: opts?.ascending !== false,
      nullsFirst: opts?.nullsFirst,
    });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }

  single() {
    return this.execute('single');
  }
  maybeSingle() {
    return this.execute('maybeSingle');
  }

  // Thenable so `await builder` works like supabase-js
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute('many').then(onfulfilled, onrejected);
  }

  private buildWhere(startIdx = 1): { sql: string; params: unknown[]; nextIdx: number } {
    const params: unknown[] = [];
    const clauses: string[] = [];
    let idx = startIdx;
    for (const f of this.filters) {
      const col = quoteIdent(f.col);
      switch (f.type) {
        case 'eq':
          clauses.push(`${col} = $${idx++}`);
          params.push(f.val);
          break;
        case 'neq':
          clauses.push(`${col} <> $${idx++}`);
          params.push(f.val);
          break;
        case 'in':
          clauses.push(`${col} = ANY($${idx++})`);
          params.push(f.val);
          break;
        case 'is':
          if (f.val === null) clauses.push(`${col} IS NULL`);
          else {
            clauses.push(`${col} IS $${idx++}`);
            params.push(f.val);
          }
          break;
        case 'not_is':
          clauses.push(`${col} IS NOT NULL`);
          break;
        case 'gt':
          clauses.push(`${col} > $${idx++}`);
          params.push(f.val);
          break;
        case 'gte':
          clauses.push(`${col} >= $${idx++}`);
          params.push(f.val);
          break;
        case 'lt':
          clauses.push(`${col} < $${idx++}`);
          params.push(f.val);
          break;
        case 'lte':
          clauses.push(`${col} <= $${idx++}`);
          params.push(f.val);
          break;
        case 'ilike':
          clauses.push(`${col} ILIKE $${idx++}`);
          params.push(f.val);
          break;
      }
    }
    return {
      sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
      params,
      nextIdx: idx,
    };
  }

  private orderSql() {
    if (!this.orders.length) return '';
    return (
      ' ORDER BY ' +
      this.orders
        .map((o) => {
          const nulls =
            o.nullsFirst === true
              ? ' NULLS FIRST'
              : o.nullsFirst === false
                ? ' NULLS LAST'
                : '';
          return `${quoteIdent(o.col)} ${o.ascending ? 'ASC' : 'DESC'}${nulls}`;
        })
        .join(', ')
    );
  }

  private async execute(mode: 'many' | 'single' | 'maybeSingle') {
    try {
      if (this.mutating?.kind === 'insert') {
        const rows = Array.isArray(this.mutating.row)
          ? this.mutating.row
          : [this.mutating.row];
        if (!rows.length) return { data: null, error: null, count: 0 };

        const keys = Object.keys(rows[0]);
        const allParams: unknown[] = [];
        const valueGroups: string[] = [];
        let p = 1;
        for (const row of rows) {
          const placeholders: string[] = [];
          for (const k of keys) {
            placeholders.push(`$${p++}`);
            allParams.push(encodeParam(row[k]));
          }
          valueGroups.push(`(${placeholders.join(',')})`);
        }
        const sql = `INSERT INTO ${quoteIdent(this.table)} (${keys
          .map(quoteIdent)
          .join(',')}) VALUES ${valueGroups.join(',')} RETURNING *`;
        const result = await query(sql, allParams);
        await this.maybeNotify(result.rows);
        const data = Array.isArray(this.mutating.row) ? result.rows : result.rows[0];
        if (mode === 'single' || mode === 'maybeSingle') {
          return { data: result.rows[0] || null, error: null, count: result.rowCount };
        }
        return { data, error: null, count: result.rowCount };
      }

      if (this.mutating?.kind === 'update') {
        const row = this.mutating.row;
        const keys = Object.keys(row);
        let p = 1;
        const sets = keys.map((k) => `${quoteIdent(k)} = $${p++}`);
        const params: unknown[] = keys.map((k) => encodeParam(row[k]));
        const where = this.buildWhere(p);
        const sql = `UPDATE ${quoteIdent(this.table)} SET ${sets.join(',')}${where.sql} RETURNING *`;
        const result = await query(sql, [...params, ...where.params]);
        await this.maybeNotify(result.rows);
        if (mode === 'single') {
          if (result.rows.length !== 1) {
            return {
              data: null,
              error: { message: `Expected 1 row, got ${result.rows.length}` },
              count: result.rowCount,
            };
          }
          return { data: result.rows[0], error: null, count: 1 };
        }
        if (mode === 'maybeSingle') {
          return { data: result.rows[0] || null, error: null, count: result.rowCount };
        }
        // Default supabase update returns null data unless .select()
        if (this.returnRows) {
          return { data: result.rows, error: null, count: result.rowCount };
        }
        return { data: null, error: null, count: result.rowCount };
      }

      if (this.mutating?.kind === 'delete') {
        const where = this.buildWhere(1);
        const sql = `DELETE FROM ${quoteIdent(this.table)}${where.sql} RETURNING *`;
        const result = await query(sql, where.params);
        await this.maybeNotify(result.rows);
        return {
          data: this.returnRows ? result.rows : null,
          error: null,
          count: result.rowCount,
        };
      }

      // SELECT
      const where = this.buildWhere(1);
      let count: number | null = null;
      if (this.wantCount) {
        const countSql = `SELECT COUNT(*)::int AS c FROM ${quoteIdent(this.table)}${where.sql}`;
        const { rows } = await query(countSql, where.params);
        count = rows[0]?.c ?? 0;
        if (this.headOnly) {
          return { data: null, error: null, count };
        }
      }

      const cols =
        this.selectSpec.columns === '*'
          ? '*'
          : this.selectSpec.columns.map(quoteIdent).join(', ');
      let sql = `SELECT ${cols} FROM ${quoteIdent(this.table)}${where.sql}${this.orderSql()}`;
      const params = [...where.params];
      if (this.limitN != null) {
        sql += ` LIMIT $${params.length + 1}`;
        params.push(this.limitN);
      }
      if (this.offsetN != null) {
        sql += ` OFFSET $${params.length + 1}`;
        params.push(this.offsetN);
      }
      const result = await query(sql, params);
      let rows = await expandNests(result.rows, this.selectSpec.nests);

      if (mode === 'single') {
        if (rows.length !== 1) {
          return {
            data: null,
            error: { message: `Expected 1 row, got ${rows.length}`, code: 'PGRST116' },
            count,
          };
        }
        return { data: rows[0], error: null, count };
      }
      if (mode === 'maybeSingle') {
        return { data: rows[0] || null, error: null, count };
      }
      return { data: rows, error: null, count };
    } catch (err: any) {
      console.error('[pg-admin]', this.table, err);
      return { data: null, error: { message: err.message || String(err) }, count: null };
    }
  }

  private async maybeNotify(rows: any[]) {
    const roomIds = new Set<string>();
    for (const r of rows || []) {
      if (r.room_id) roomIds.add(String(r.room_id));
      if (this.table === 'kara_rooms' && r.id) roomIds.add(String(r.id));
    }
    for (const id of roomIds) {
      await notifyRoom(id);
    }
  }
}

async function callRpc(fn: string, args: Record<string, unknown>) {
  try {
    const keys = Object.keys(args);
    const params = keys.map((k) => args[k]);
    const placeholders = keys.map((k, i) => `${k} := $${i + 1}`).join(', ');
    const sql = `SELECT * FROM ${quoteIdent(fn)}(${placeholders})`;
    const result = await query(sql, params);

    // Boolean-returning functions often come back as { advance_playback: true } or similar
    if (result.rows.length === 1) {
      const row = result.rows[0];
      const vals = Object.values(row);
      if (vals.length === 1) {
        return { data: vals[0], error: null };
      }
      return { data: row, error: null };
    }
    return { data: result.rows, error: null };
  } catch (err: any) {
    console.error('[pg-admin] rpc', fn, err);
    return { data: null, error: { message: err.message || String(err) } };
  }
}

export const pgAdmin = {
  from(table: string) {
    return new FilterBuilder(table);
  },
  rpc(fn: string, args: Record<string, unknown> = {}) {
    return callRpc(fn, args);
  },
};
