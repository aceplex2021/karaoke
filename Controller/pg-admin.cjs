/**
 * Minimal Supabase-admin-shaped client backed by node-pg (Phase B).
 * CJS so Controller/supabase.js can require() it synchronously.
 */
const pg = require("pg");

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.params = [];
    this.selectCols = "*";
    this.op = "select";
    this.payload = null;
    this.onConflict = null;
    this.wantSingle = false;
    this.wantMaybeSingle = false;
  }

  select(cols = "*") {
    this.selectCols = cols;
    return this;
  }

  eq(col, val) {
    this.params.push(val);
    this.filters.push(`${quoteIdent(col)} = $${this.params.length}`);
    return this;
  }

  insert(row) {
    this.op = "insert";
    this.payload = row;
    return this;
  }

  upsert(row, opts = {}) {
    this.op = "upsert";
    this.payload = row;
    this.onConflict = opts.onConflict || null;
    return this;
  }

  single() {
    this.wantSingle = true;
    return this.thenable();
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    return this.thenable();
  }

  thenable() {
    const run = this.execute.bind(this);
    return {
      then: (resolve, reject) => run().then(resolve, reject),
      catch: (reject) => run().catch(reject),
    };
  }

  async execute() {
    try {
      if (this.op === "select") {
        const cols =
          this.selectCols === "*"
            ? "*"
            : this.selectCols
                .split(",")
                .map((c) => quoteIdent(c.trim()))
                .join(", ");
        const sql = `SELECT ${cols} FROM ${quoteIdent(this.table)}${
          this.filters.length ? ` WHERE ${this.filters.join(" AND ")}` : ""
        }`;
        const result = await getPool().query(sql, this.params);
        return this.wrapRows(result.rows);
      }

      const row = this.payload || {};
      const cols = Object.keys(row);
      const vals = Object.values(row);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const returning =
        this.selectCols === "*"
          ? "*"
          : this.selectCols
              .split(",")
              .map((c) => quoteIdent(c.trim()))
              .join(", ");

      if (this.op === "insert") {
        const sql = `INSERT INTO ${quoteIdent(this.table)} (${cols
          .map(quoteIdent)
          .join(", ")}) VALUES (${placeholders}) RETURNING ${returning}`;
        try {
          const result = await getPool().query(sql, vals);
          return this.wrapRows(result.rows);
        } catch (err) {
          return { data: null, error: { message: err.message, code: err.code } };
        }
      }

      if (this.op === "upsert") {
        const conflictCols = String(this.onConflict || "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        if (!conflictCols.length) {
          return { data: null, error: { message: "upsert requires onConflict" } };
        }
        const conflict = conflictCols.map(quoteIdent).join(", ");
        const conflictSet = new Set(conflictCols);
        const updateCols = cols.filter((c) => !conflictSet.has(c));
        const updates = (
          updateCols.length
            ? updateCols
            : [cols[0]]
        )
          .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
          .join(", ");
        const sql = `INSERT INTO ${quoteIdent(this.table)} (${cols
          .map(quoteIdent)
          .join(", ")}) VALUES (${placeholders})
          ON CONFLICT (${conflict}) DO UPDATE SET ${updates}
          RETURNING ${returning}`;
        const result = await getPool().query(sql, vals);
        return this.wrapRows(result.rows);
      }

      return { data: null, error: { message: `unsupported op ${this.op}` } };
    } catch (err) {
      return { data: null, error: { message: err.message, code: err.code } };
    }
  }

  wrapRows(rows) {
    if (this.wantSingle) {
      if (rows.length !== 1) {
        return {
          data: null,
          error: {
            message: `Expected 1 row, got ${rows.length}`,
            code: "PGRST116",
          },
        };
      }
      return { data: rows[0], error: null };
    }
    if (this.wantMaybeSingle) {
      return { data: rows[0] || null, error: null };
    }
    return { data: rows, error: null };
  }
}

function createPgAdmin() {
  return {
    from(table) {
      return new QueryBuilder(table);
    },
  };
}

module.exports = { createPgAdmin };
