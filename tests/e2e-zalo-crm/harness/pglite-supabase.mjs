import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_COURSES,
  DEFAULT_GUIDANCE_CONFIG,
  STAFF_ACTORS,
  TEST_ENV_DEFAULTS
} from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '../../..');

const pkgRequire = createRequire(path.join(ROOT_DIR, 'apps', 'ktn-web-v2', 'package.json'));
const { PGlite } = pkgRequire('@electric-sql/pglite');
const pgTrgmCjsPath = path.join(
  path.dirname(pkgRequire.resolve('@electric-sql/pglite')),
  'contrib',
  'pg_trgm.cjs'
);
const { pg_trgm } = pkgRequire(pgTrgmCjsPath);

export const CORE_MIGRATION_FILES = Object.freeze([
  'supabase_schema.sql',
  'supabase/migrations/20261109_ktn_master_upgrade.sql',
  'supabase/migrations/20261114_ktn_consultations.sql',
  'supabase/migrations/20261115_ktn_consultation_example_capacity.sql',
  'supabase/migrations/20261119_ktn_zalo_oa_crm_sepay.sql'
]);

export const SCALE_MIGRATION_FILES = Object.freeze([
  'supabase/migrations/20261116_ktn_search_perf.sql',
  'supabase/migrations/20261118_ktn_production_scale_all_in_one.sql'
]);

const FK_GRAPH = {
  ktn_consultation_flags: {
    ktn_consultations: { localCol: 'consultation_id', foreignCol: 'id', cardinality: 'many-to-one' },
    ktn_consultation_messages: { localCol: 'message_id', foreignCol: 'id', cardinality: 'many-to-one' }
  },
  ktn_consultation_orders: {
    ktn_orders: { localCol: 'order_id', foreignCol: 'order_id', cardinality: 'many-to-one' },
    ktn_consultations: { localCol: 'consultation_id', foreignCol: 'id', cardinality: 'many-to-one' }
  },
  ktn_orders: {
    ktn_consultation_payments: { localCol: 'order_id', foreignCol: 'order_id', cardinality: 'one-to-many' },
    ktn_consultations: { localCol: 'consultation_id', foreignCol: 'id', cardinality: 'many-to-one' },
    ktn_sepay_reconciliation_logs: { localCol: 'order_id', foreignCol: 'order_id', cardinality: 'one-to-many' }
  },
  ktn_consultations: {
    ktn_students: { localCol: 'student_code', foreignCol: 'code', cardinality: 'many-to-one' },
    ktn_advisors: { localCol: 'owner_email', foreignCol: 'email', cardinality: 'many-to-one' },
    ktn_zalo_oa_events: { localCol: 'id', foreignCol: 'consultation_id', cardinality: 'one-to-many' },
    ktn_sepay_reconciliation_logs: { localCol: 'id', foreignCol: 'consultation_id', cardinality: 'one-to-many' }
  },
  ktn_consultation_messages: {
    ktn_consultations: { localCol: 'consultation_id', foreignCol: 'id', cardinality: 'many-to-one' }
  },
  ktn_consultation_payments: {
    ktn_orders: { localCol: 'order_id', foreignCol: 'order_id', cardinality: 'many-to-one' }
  },
  ktn_zalo_oa_events: {
    ktn_consultations: { localCol: 'consultation_id', foreignCol: 'id', cardinality: 'many-to-one' }
  },
  ktn_sepay_reconciliation_logs: {
    ktn_orders: { localCol: 'order_id', foreignCol: 'order_id', cardinality: 'many-to-one' },
    ktn_consultations: { localCol: 'consultation_id', foreignCol: 'id', cardinality: 'many-to-one' }
  }
};

const RESERVED_QUERY_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function splitTopLevel(input, delimiter = ',') {
  const parts = [];
  let depth = 0;
  let inQuotes = false;
  let escaped = false;
  let current = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && inQuotes) {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes) {
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
      else if (ch === delimiter && depth === 0) {
        if (current.trim()) parts.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function stripWrappingQuotes(val) {
  const s = String(val);
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return s;
}

function parseSelectSpec(selectStr) {
  if (!selectStr || selectStr.trim() === '*') {
    return { selectAll: true, cols: [], joins: [] };
  }
  const parts = splitTopLevel(selectStr, ',');
  const cols = [];
  const joins = [];
  let selectAll = false;

  for (const part of parts) {
    if (part === '*') {
      selectAll = true;
      continue;
    }
    const parenIdx = part.indexOf('(');
    if (parenIdx > 0 && part.endsWith(')')) {
      const head = part.slice(0, parenIdx).trim();
      const innerStr = part.slice(parenIdx + 1, -1).trim();
      let alias = null;
      let tableSpec = head;
      const colonIdx = head.indexOf(':');
      if (colonIdx > 0) {
        alias = head.slice(0, colonIdx).trim();
        tableSpec = head.slice(colonIdx + 1).trim();
      }
      const isInner = tableSpec.endsWith('!inner');
      const table = isInner ? tableSpec.slice(0, -'!inner'.length).trim() : tableSpec;
      joins.push({
        alias: alias || table,
        table,
        inner: isInner,
        spec: parseSelectSpec(innerStr)
      });
    } else {
      const colonIdx = part.indexOf(':');
      if (colonIdx > 0) {
        cols.push({ alias: part.slice(0, colonIdx).trim(), name: part.slice(colonIdx + 1).trim() });
      } else {
        cols.push({ alias: part, name: part });
      }
    }
  }
  return { selectAll, cols, joins };
}

function parsePgArrayLiteral(raw) {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];
  return splitTopLevel(inner, ',').map((item) => stripWrappingQuotes(item.trim()));
}

function castTypeForColumn(colMeta) {
  if (!colMeta) return null;
  const udt = colMeta.udtName;
  if (udt === 'uuid') return 'uuid';
  if (udt === 'bool') return 'boolean';
  if (udt === 'int4') return 'integer';
  if (udt === 'int8') return 'bigint';
  if (udt === 'numeric' || udt === 'float8' || udt === 'float4') return 'numeric';
  if (udt === 'timestamptz') return 'timestamptz';
  if (udt === 'timestamp') return 'timestamp';
  if (udt === 'date') return 'date';
  if (udt === 'jsonb') return 'jsonb';
  if (udt === 'json') return 'json';
  if (udt === '_text') return 'text[]';
  return 'text';
}

function coerceParamValue(val, colMeta) {
  if (val === null || val === undefined) return null;
  const udt = colMeta?.udtName;
  if (udt === 'jsonb' || udt === 'json') {
    return typeof val === 'string' ? val : JSON.stringify(val);
  }
  if (udt === '_text') {
    if (Array.isArray(val)) return val.map((v) => String(v));
    if (typeof val === 'string' && val.startsWith('{') && val.endsWith('}')) {
      return parsePgArrayLiteral(val);
    }
    return [String(val)];
  }
  if (udt === 'bool') {
    if (typeof val === 'boolean') return val;
    if (val === 'true') return true;
    if (val === 'false') return false;
  }
  if (udt === 'int4' || udt === 'int8') {
    if (typeof val === 'number') return val;
    if (typeof val === 'string' && /^-?\d+$/.test(val.trim())) return Number(val.trim());
  }
  return val;
}

export async function bootstrapSupabaseRoles(db) {
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  `);
}

export async function loadMigrations(db, migrationFiles = CORE_MIGRATION_FILES, rootDir = ROOT_DIR) {
  const executed = [];
  for (const relPath of migrationFiles) {
    const fullPath = path.isAbsolute(relPath) ? relPath : path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Migration file not found: ${fullPath}`);
    }
    const sql = fs.readFileSync(fullPath, 'utf8');
    await db.exec(sql);
    executed.push(relPath);
  }
  return executed;
}

async function introspectSchema(db) {
  const colsRes = await db.query(`
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const tables = new Map();
  for (const row of colsRes.rows) {
    if (!tables.has(row.table_name)) {
      tables.set(row.table_name, { columns: new Map(), primaryKey: [] });
    }
    tables.get(row.table_name).columns.set(row.column_name, {
      dataType: row.data_type,
      udtName: row.udt_name
    });
  }

  const pkRes = await db.query(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `);
  for (const row of pkRes.rows) {
    if (tables.has(row.table_name)) {
      tables.get(row.table_name).primaryKey.push(row.column_name);
    }
  }

  const procRes = await db.query(`
    SELECT p.proname,
           p.proretset,
           t.typname AS return_type,
           pg_get_function_arguments(p.oid) AS args_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE n.nspname = 'public'
  `);
  const procs = new Map();
  for (const row of procRes.rows) {
    const args = [];
    if (row.args_def && row.args_def.trim()) {
      for (const argPart of splitTopLevel(row.args_def, ',')) {
        const cleaned = argPart.replace(/\s+DEFAULT\s+[\s\S]*$/i, '').replace(/^(?:IN|OUT|INOUT|VARIADIC)\s+/i, '').trim();
        const spaceIdx = cleaned.search(/\s+/);
        if (spaceIdx > 0) {
          const name = cleaned.slice(0, spaceIdx).replace(/^"|"$/g, '');
          const type = cleaned.slice(spaceIdx + 1).trim();
          args.push({ name, type });
        }
      }
    }
    procs.set(row.proname, {
      name: row.proname,
      retSet: Boolean(row.proretset),
      returnType: row.return_type,
      args
    });
  }

  return { tables, procs };
}

function buildJsonResponse(data, status = 200, extraHeaders = {}) {
  if (status === 204) {
    return new Response(null, { status: 204, headers: extraHeaders });
  }
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

function parsePrefer(headers) {
  const raw = headers.get('prefer') || '';
  const tokens = raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  let returnMode = 'representation';
  let resolution = null;
  let countExact = false;
  for (const token of tokens) {
    if (token === 'return=minimal') returnMode = 'minimal';
    else if (token === 'return=representation') returnMode = 'representation';
    else if (token === 'resolution=merge-duplicates') resolution = 'merge-duplicates';
    else if (token === 'resolution=ignore-duplicates') resolution = 'ignore-duplicates';
    else if (token === 'count=exact') countExact = true;
  }
  return { returnMode, resolution, countExact };
}

function compilePredicate(tableName, tableMeta, rawKey, rawExpr, params, schema, tableAlias = null, selectSpec = null, depth = 0) {
  const prefix = tableAlias ? `${quoteIdent(tableAlias)}.` : `public.${quoteIdent(tableName)}.`;
  let expr = String(rawExpr);

  // Dotted embedded filter: <relTableOrAlias>.<relCol>=<expr>
  if (rawKey.includes('.')) {
    const dotIdx = rawKey.indexOf('.');
    const rawRel = rawKey.slice(0, dotIdx);
    const relCol = rawKey.slice(dotIdx + 1);
    const joinMatch = selectSpec?.joins?.find((j) => j.alias === rawRel);
    const relTable = joinMatch ? joinMatch.table : rawRel;
    const fk = FK_GRAPH[tableName]?.[relTable];
    const relMeta = schema.tables.get(relTable);
    if (!fk || !relMeta || (!relCol.includes('.') && !relMeta.columns.has(relCol))) {
      throw Object.assign(new Error(`Unknown embedded filter ${rawKey} on ${tableName}`), { code: '42703' });
    }
    const subAlias = depth === 0 ? `_rel_${relTable}` : `_rel${depth}_${relTable}`;
    const childJoin = joinMatch || selectSpec?.joins?.find((j) => j.table === relTable);
    const subPred = compilePredicate(
      relTable,
      relMeta,
      relCol,
      expr,
      params,
      schema,
      subAlias,
      childJoin?.spec || null,
      depth + 1
    );
    return `EXISTS (SELECT 1 FROM public.${quoteIdent(relTable)} AS ${quoteIdent(subAlias)} WHERE ${quoteIdent(subAlias)}.${quoteIdent(fk.foreignCol)} = ${prefix}${quoteIdent(fk.localCol)} AND ${subPred})`;
  }

  if (!tableMeta.columns.has(rawKey)) {
    throw Object.assign(new Error(`Column ${rawKey} does not exist on ${tableName}`), { code: '42703' });
  }
  const colMeta = tableMeta.columns.get(rawKey);
  const colSql = `${prefix}${quoteIdent(rawKey)}`;
  const castType = castTypeForColumn(colMeta);

  let negated = false;
  if (expr.startsWith('not.')) {
    negated = true;
    expr = expr.slice(4);
  }

  const wrap = (sql) => (negated ? `NOT (${sql})` : sql);

  if (expr === 'is.null') return wrap(`${colSql} IS NULL`);
  if (expr === 'is.true') return wrap(`${colSql} IS TRUE`);
  if (expr === 'is.false') return wrap(`${colSql} IS FALSE`);

  const dotIdx = expr.indexOf('.');
  if (dotIdx <= 0) {
    throw Object.assign(new Error(`Invalid PostgREST filter expression: ${rawKey}=${rawExpr}`), { code: '22P02' });
  }
  const op = expr.slice(0, dotIdx);
  const rawVal = expr.slice(dotIdx + 1);

  if (op === 'in') {
    if (!rawVal.startsWith('(') || !rawVal.endsWith(')')) {
      throw Object.assign(new Error(`Invalid in() syntax: ${rawExpr}`), { code: '22P02' });
    }
    const inner = rawVal.slice(1, -1).trim();
    if (!inner) return wrap('FALSE');
    const items = splitTopLevel(inner, ',').map((item) => stripWrappingQuotes(item.trim()));
    params.push(items);
    const pIdx = params.length;
    return wrap(`${colSql}::text = ANY($${pIdx}::text[])`);
  }

  if (op === 'cs') {
    if (colMeta.udtName === '_text') {
      const arr = rawVal.startsWith('{') && rawVal.endsWith('}')
        ? parsePgArrayLiteral(rawVal)
        : JSON.parse(rawVal);
      params.push(arr);
      return wrap(`${colSql} @> $${params.length}::text[]`);
    }
    const jsonVal = rawVal.startsWith('[') || rawVal.startsWith('{') ? rawVal : JSON.stringify(rawVal);
    params.push(jsonVal);
    return wrap(`COALESCE(${colSql}::jsonb, '[]'::jsonb) @> $${params.length}::jsonb`);
  }

  const val = stripWrappingQuotes(rawVal);
  if (op === 'ilike' || op === 'like') {
    params.push(val.replace(/\*/g, '%'));
    return wrap(`${colSql}::text ${op === 'ilike' ? 'ILIKE' : 'LIKE'} $${params.length}::text`);
  }

  const cmpOps = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
  const sqlOp = cmpOps[op];
  if (!sqlOp) {
    throw Object.assign(new Error(`Unsupported PostgREST operator: ${op}`), { code: '22P02' });
  }

  const coerced = coerceParamValue(val, colMeta);
  params.push(coerced);
  const paramRef = castType ? `$${params.length}::${castType}` : `$${params.length}`;
  if (op === 'neq') {
    return wrap(`${colSql} IS DISTINCT FROM ${paramRef}`);
  }
  return wrap(`${colSql} ${sqlOp} ${paramRef}`);
}

function compileLogicTree(tableName, tableMeta, combinator, innerStr, params, schema, tableAlias = null, selectSpec = null) {
  const parts = splitTopLevel(innerStr, ',');
  if (!parts.length) return 'TRUE';
  const compiled = parts.map((part) => {
    const logicMatch = /^(not\.)?(or|and)\(([\s\S]*)\)$/i.exec(part);
    if (logicMatch) {
      const sub = compileLogicTree(tableName, tableMeta, logicMatch[2].toLowerCase(), logicMatch[3], params, schema, tableAlias, selectSpec);
      return logicMatch[1] ? `NOT (${sub})` : `(${sub})`;
    }
    const opMatch = /^([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*?)\.((?:not\.)?(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs)\..*)$/.exec(part);
    let col;
    let expr;
    if (opMatch) {
      col = opMatch[1];
      expr = opMatch[2];
    } else {
      const dotIdx = part.indexOf('.');
      if (dotIdx <= 0) {
        throw Object.assign(new Error(`Invalid logic token: ${part}`), { code: '22P02' });
      }
      col = part.slice(0, dotIdx);
      expr = part.slice(dotIdx + 1);
    }
    return compilePredicate(tableName, tableMeta, col, expr, params, schema, tableAlias, selectSpec);
  });
  const joiner = combinator === 'or' ? ' OR ' : ' AND ';
  return `(${compiled.join(joiner)})`;
}

function buildInnerJoinExists(tableName, outerPrefix, join, filteredPaths, schema, depth = 0, pathAliases = ['']) {
  if (!join.inner) return null;
  const fk = FK_GRAPH[tableName]?.[join.table];
  const relMeta = schema.tables.get(join.table);
  if (!fk || !relMeta) return null;

  const subAlias = `_inner${depth}_${join.table}`;
  const subPrefix = `${quoteIdent(subAlias)}.`;
  const nextPrefixes = [];
  for (const p of pathAliases) {
    const base = p ? `${p}.` : '';
    nextPrefixes.push(`${base}${join.table}`);
    if (join.alias && join.alias !== join.table) {
      nextPrefixes.push(`${base}${join.alias}`);
    }
  }

  const nestedClauses = [];
  for (const childJoin of join.spec?.joins || []) {
    const childExists = buildInnerJoinExists(
      join.table,
      subPrefix,
      childJoin,
      filteredPaths,
      schema,
      depth + 1,
      nextPrefixes
    );
    if (childExists) nestedClauses.push(childExists);
  }

  const isFilteredAtThisHop = nextPrefixes.some((p) => filteredPaths.has(p));
  if (isFilteredAtThisHop && nestedClauses.length === 0) {
    return null;
  }

  const whereParts = [
    `${subPrefix}${quoteIdent(fk.foreignCol)} = ${outerPrefix}${quoteIdent(fk.localCol)}`,
    ...nestedClauses
  ];
  return `EXISTS (SELECT 1 FROM public.${quoteIdent(join.table)} AS ${quoteIdent(subAlias)} WHERE ${whereParts.join(' AND ')})`;
}

function buildWhereClause(tableName, tableMeta, searchParams, params, schema, tableAlias = null, selectSpec = null, applyInnerJoins = false) {
  const clauses = [];
  const filteredPaths = new Set();
  for (const [key, value] of searchParams.entries()) {
    if (RESERVED_QUERY_PARAMS.has(key)) continue;
    const logicMatch = /^(not\.)?(or|and)$/i.exec(key);
    if (logicMatch && value.startsWith('(') && value.endsWith(')')) {
      const sub = compileLogicTree(
        tableName,
        tableMeta,
        logicMatch[2].toLowerCase(),
        value.slice(1, -1),
        params,
        schema,
        tableAlias,
        selectSpec
      );
      clauses.push(logicMatch[1] ? `NOT (${sub})` : sub);
    } else {
      if (key.includes('.')) {
        const lastDot = key.lastIndexOf('.');
        const relPath = key.slice(0, lastDot);
        let acc = '';
        for (const seg of relPath.split('.')) {
          acc = acc ? `${acc}.${seg}` : seg;
          filteredPaths.add(acc);
        }
      }
      clauses.push(compilePredicate(tableName, tableMeta, key, value, params, schema, tableAlias, selectSpec));
    }
  }
  if (applyInnerJoins && selectSpec?.joins?.length) {
    const outerPrefix = tableAlias ? `${quoteIdent(tableAlias)}.` : `public.${quoteIdent(tableName)}.`;
    for (const join of selectSpec.joins) {
      const existsSql = buildInnerJoinExists(tableName, outerPrefix, join, filteredPaths, schema, 0, ['']);
      if (existsSql) clauses.push(existsSql);
    }
  }
  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

function extractEmbeddedFilters(searchParams) {
  const byTable = new Map();
  for (const [key, value] of searchParams.entries()) {
    if (RESERVED_QUERY_PARAMS.has(key)) continue;
    if (/^(not\.)?(or|and)$/i.test(key)) continue;
    const dotIdx = key.indexOf('.');
    if (dotIdx <= 0) continue;
    const relTable = key.slice(0, dotIdx);
    const relCol = key.slice(dotIdx + 1);
    if (!byTable.has(relTable)) byTable.set(relTable, []);
    byTable.get(relTable).push({ col: relCol, expr: value });
  }
  return byTable;
}

function projectRow(row, spec) {
  if (spec.selectAll && !spec.joins.length) return { ...row };
  const out = spec.selectAll ? { ...row } : {};
  for (const col of spec.cols) {
    if (Object.prototype.hasOwnProperty.call(row, col.name)) {
      out[col.alias] = row[col.name];
    }
  }
  for (const join of spec.joins) {
    if (Object.prototype.hasOwnProperty.call(row, join.alias)) {
      out[join.alias] = row[join.alias];
    }
  }
  return out;
}

async function hydrateJoinsInternal(db, schema, parentTable, parentRows, selectSpec, embeddedFilters = null) {
  if (!parentRows.length || !selectSpec.joins.length) {
    return parentRows.map((row, sourceIdx) => ({
      sourceIdx,
      projected: projectRow(row, selectSpec)
    }));
  }
  const working = parentRows.map((r, sourceIdx) => ({ data: { ...r }, sourceIdx, keep: true }));

  for (const join of selectSpec.joins) {
    const fk = FK_GRAPH[parentTable]?.[join.table];
    if (!fk) {
      throw new Error(`No FK relationship registered between ${parentTable} and ${join.table}`);
    }
    const childMeta = schema.tables.get(join.table);
    if (!childMeta) {
      throw new Error(`Unknown joined table: ${join.table}`);
    }
    const keys = [
      ...new Set(
        working
          .filter((w) => w.keep)
          .map((w) => w.data[fk.localCol])
          .filter((v) => v !== null && v !== undefined)
      )
    ];
    const tableFilters = [
      ...(embeddedFilters?.get(join.table) || []),
      ...(join.alias && join.alias !== join.table ? (embeddedFilters?.get(join.alias) || []) : [])
    ];
    const childEmbeddedFilters = new Map();
    for (const f of tableFilters) {
      const dotIdx = f.col.indexOf('.');
      if (dotIdx <= 0) continue;
      const nextRel = f.col.slice(0, dotIdx);
      const nextCol = f.col.slice(dotIdx + 1);
      if (!childEmbeddedFilters.has(nextRel)) childEmbeddedFilters.set(nextRel, []);
      childEmbeddedFilters.get(nextRel).push({ col: nextCol, expr: f.expr });
    }
    let childRows = [];
    if (keys.length) {
      const childParams = [keys.map((k) => String(k))];
      const extraClauses = [];
      if (tableFilters.length) {
        for (const f of tableFilters) {
          extraClauses.push(compilePredicate(join.table, childMeta, f.col, f.expr, childParams, schema, null, join.spec));
        }
      }
      const extraWhere = extraClauses.length ? ` AND ${extraClauses.join(' AND ')}` : '';
      const res = await db.query(
        `SELECT * FROM public.${quoteIdent(join.table)} WHERE ${quoteIdent(fk.foreignCol)}::text = ANY($1::text[])${extraWhere}`,
        childParams
      );
      childRows = res.rows;
    }
    const hydratedChildren = await hydrateJoinsInternal(db, schema, join.table, childRows, join.spec, childEmbeddedFilters);
    const byFk = new Map();
    for (const childItem of hydratedChildren) {
      const rawKey = String(childRows[childItem.sourceIdx][fk.foreignCol]);
      if (!byFk.has(rawKey)) byFk.set(rawKey, []);
      byFk.get(rawKey).push(childItem.projected);
    }
    for (const w of working) {
      if (!w.keep) continue;
      const localVal = w.data[fk.localCol];
      const matched = localVal === null || localVal === undefined ? [] : (byFk.get(String(localVal)) || []);
      if (fk.cardinality === 'one-to-many') {
        w.data[join.alias] = matched;
        if (join.inner && matched.length === 0) w.keep = false;
      } else {
        w.data[join.alias] = matched[0] || null;
        if (join.inner && !matched[0]) w.keep = false;
      }
    }
  }

  return working
    .filter((w) => w.keep)
    .map((w) => ({
      sourceIdx: w.sourceIdx,
      projected: projectRow(w.data, selectSpec)
    }));
}

async function hydrateJoins(db, schema, parentTable, parentRows, selectSpec, embeddedFilters = null) {
  const results = await hydrateJoinsInternal(db, schema, parentTable, parentRows, selectSpec, embeddedFilters);
  return results.map((item) => item.projected);
}

function buildOrderClause(tableName, tableMeta, orderParam) {
  if (!orderParam) return '';
  const items = [];
  for (const raw of orderParam.split(',').map((s) => s.trim()).filter(Boolean)) {
    const parts = raw.split('.');
    const col = parts[0];
    if (!tableMeta.columns.has(col)) {
      throw Object.assign(new Error(`Unknown order column ${col} on ${tableName}`), { code: '42703' });
    }
    let dir = 'ASC';
    let nulls = '';
    for (const mod of parts.slice(1)) {
      const lower = mod.toLowerCase();
      if (lower === 'desc') dir = 'DESC';
      else if (lower === 'asc') dir = 'ASC';
      else if (lower === 'nullslast') nulls = ' NULLS LAST';
      else if (lower === 'nullsfirst') nulls = ' NULLS FIRST';
    }
    items.push(`${quoteIdent(col)} ${dir}${nulls}`);
  }
  return items.length ? `ORDER BY ${items.join(', ')}` : '';
}

function mapPgError(err) {
  const code = err?.code;
  if (code === '23505') {
    return buildJsonResponse({ code: '23505', message: err.message, details: err.detail || null }, 409);
  }
  if (code === '42703') {
    return buildJsonResponse({ code: 'PGRST204', message: err.message }, 400);
  }
  if (['23502', '23503', '23514', '22P02', '22007', '22008'].includes(code)) {
    return buildJsonResponse({ code, message: err.message, details: err.detail || null }, 400);
  }
  return buildJsonResponse({ code: code || 'PGRST000', message: err?.message || 'Database error' }, 500);
}

async function handlePostgrestRequest(db, schema, urlObj, method, headers, rawBody) {
  const tableName = decodeURIComponent(urlObj.pathname.slice('/rest/v1/'.length)).replace(/^\/+/, '');
  const tableMeta = schema.tables.get(tableName);
  if (!tableMeta) {
    return buildJsonResponse({ code: 'PGRST205', message: `Table public.${tableName} not found` }, 404);
  }
  const prefer = parsePrefer(headers);
  const accept = (headers.get('accept') || '').toLowerCase();
  const wantsSingleObject = accept.includes('application/vnd.pgrst.object+json');
  const selectRaw = urlObj.searchParams.get('select') || '*';
  const selectSpec = parseSelectSpec(selectRaw);

  try {
    if (method === 'GET' || method === 'HEAD') {
      const params = [];
      const whereSql = buildWhereClause(tableName, tableMeta, urlObj.searchParams, params, schema, null, selectSpec, true);
      const orderSql = buildOrderClause(tableName, tableMeta, urlObj.searchParams.get('order'));
      const limitRaw = urlObj.searchParams.get('limit');
      const offsetRaw = urlObj.searchParams.get('offset');
      const limitVal = limitRaw !== null ? Math.max(0, Math.floor(Number(limitRaw))) : null;
      const offsetVal = offsetRaw !== null ? Math.max(0, Math.floor(Number(offsetRaw))) : 0;

      let totalCount = null;
      if (prefer.countExact) {
        const countRes = await db.query(`SELECT COUNT(*)::int AS cnt FROM public.${quoteIdent(tableName)} ${whereSql}`, params);
        totalCount = countRes.rows[0]?.cnt ?? 0;
      }

      const queryParams = [...params];
      let limitSql = '';
      if (limitVal !== null && Number.isFinite(limitVal)) {
        queryParams.push(limitVal);
        limitSql += ` LIMIT $${queryParams.length}::int`;
      }
      if (offsetVal > 0 && Number.isFinite(offsetVal)) {
        queryParams.push(offsetVal);
        limitSql += ` OFFSET $${queryParams.length}::int`;
      }

      const res = await db.query(
        `SELECT * FROM public.${quoteIdent(tableName)} ${whereSql} ${orderSql}${limitSql}`,
        queryParams
      );
      const embeddedFilters = extractEmbeddedFilters(urlObj.searchParams);
      const hydrated = await hydrateJoins(db, schema, tableName, res.rows, selectSpec, embeddedFilters);
      const extraHeaders = {};
      if (prefer.countExact) {
        extraHeaders['Content-Range'] = hydrated.length
          ? `${offsetVal}-${offsetVal + hydrated.length - 1}/${totalCount}`
          : `*/${totalCount}`;
      }
      if (method === 'HEAD') {
        return new Response(null, { status: 200, headers: extraHeaders });
      }
      if (wantsSingleObject) {
        if (hydrated.length !== 1) {
          return buildJsonResponse({
            code: 'PGRST116',
            details: `The result contains ${hydrated.length} rows`,
            message: 'JSON object requested, multiple (or no) rows returned'
          }, 406);
        }
        return buildJsonResponse(hydrated[0], 200, extraHeaders);
      }
      return buildJsonResponse(hydrated, 200, extraHeaders);
    }

    let parsedBody = {};
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        return buildJsonResponse({ code: 'PGRST102', message: 'Invalid JSON body' }, 400);
      }
    }

    if (method === 'POST') {
      const items = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
      if (!items.length) {
        return prefer.returnMode === 'minimal' ? buildJsonResponse(null, 201) : buildJsonResponse([], 201);
      }
      const keySet = new Set();
      for (const item of items) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return buildJsonResponse({ code: 'PGRST102', message: 'Invalid JSON body' }, 400);
        }
        for (const k of Object.keys(item)) {
          if (!tableMeta.columns.has(k)) {
            return buildJsonResponse({
              code: 'PGRST204',
              message: `Could not find the '${k}' column of '${tableName}' in the schema cache`
            }, 400);
          }
          keySet.add(k);
        }
      }
      const cols = [...keySet];
      const onConflictRaw = urlObj.searchParams.get('on_conflict');
      const conflictCols = onConflictRaw
        ? onConflictRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : tableMeta.primaryKey;

      if (prefer.resolution === 'merge-duplicates' && !conflictCols.length) {
        return buildJsonResponse({ code: 'PGRST100', message: `No conflict target for ${tableName}` }, 400);
      }

      const buildConflictSql = (presentCols) => {
        if (prefer.resolution === 'ignore-duplicates') {
          return conflictCols.length
            ? ` ON CONFLICT (${conflictCols.map(quoteIdent).join(', ')}) DO NOTHING`
            : ' ON CONFLICT DO NOTHING';
        }
        if (prefer.resolution === 'merge-duplicates') {
          const updateCols = presentCols.filter((c) => !conflictCols.includes(c));
          const setExprs = updateCols.length
            ? updateCols.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(', ')
            : conflictCols
                .filter((c) => presentCols.includes(c))
                .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
                .join(', ');
          if (!setExprs) {
            return ` ON CONFLICT (${conflictCols.map(quoteIdent).join(', ')}) DO NOTHING`;
          }
          return ` ON CONFLICT (${conflictCols.map(quoteIdent).join(', ')}) DO UPDATE SET ${setExprs}`;
        }
        return '';
      };

      const insertedRows = [];
      await db.exec('BEGIN');
      try {
        for (const item of items) {
          const presentCols = cols.filter((c) => Object.prototype.hasOwnProperty.call(item, c));
          const itemConflictSql = buildConflictSql(presentCols);
          if (!presentCols.length) {
            const res = await db.query(
              `INSERT INTO public.${quoteIdent(tableName)} DEFAULT VALUES${itemConflictSql} RETURNING *`
            );
            insertedRows.push(...res.rows);
            continue;
          }
          const values = [];
          const placeholders = presentCols.map((c) => {
            const colMeta = tableMeta.columns.get(c);
            values.push(coerceParamValue(item[c], colMeta));
            const cast = castTypeForColumn(colMeta);
            return cast ? `$${values.length}::${cast}` : `$${values.length}`;
          });
          const sql = `INSERT INTO public.${quoteIdent(tableName)} (${presentCols.map(quoteIdent).join(', ')}) VALUES (${placeholders.join(', ')})${itemConflictSql} RETURNING *`;
          const res = await db.query(sql, values);
          insertedRows.push(...res.rows);
        }
        await db.exec('COMMIT');
      } catch (txErr) {
        try {
          await db.exec('ROLLBACK');
        } catch {
          // ignore rollback error
        }
        throw txErr;
      }

      if (prefer.returnMode === 'minimal') {
        return buildJsonResponse(null, 201);
      }
      const hydrated = await hydrateJoins(db, schema, tableName, insertedRows, selectSpec);
      if (wantsSingleObject) {
        if (hydrated.length !== 1) return buildJsonResponse({ code: 'PGRST116', message: 'Not single row' }, 406);
        return buildJsonResponse(hydrated[0], 201);
      }
      return buildJsonResponse(hydrated, 201);
    }

    if (method === 'PATCH') {
      if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
        return buildJsonResponse({ code: 'PGRST102', message: 'PATCH body must be JSON object' }, 400);
      }
      const patchCols = Object.keys(parsedBody);
      for (const k of patchCols) {
        if (!tableMeta.columns.has(k)) {
          return buildJsonResponse({
            code: 'PGRST204',
            message: `Could not find the '${k}' column of '${tableName}' in the schema cache`
          }, 400);
        }
      }
      const params = [];
      const setSql = patchCols.map((c) => {
        const colMeta = tableMeta.columns.get(c);
        params.push(coerceParamValue(parsedBody[c], colMeta));
        const cast = castTypeForColumn(colMeta);
        return `${quoteIdent(c)} = ${cast ? `$${params.length}::${cast}` : `$${params.length}`}`;
      }).join(', ');
      const whereSql = buildWhereClause(tableName, tableMeta, urlObj.searchParams, params, schema);
      const res = await db.query(
        `UPDATE public.${quoteIdent(tableName)} SET ${setSql} ${whereSql} RETURNING *`,
        params
      );
      if (prefer.returnMode === 'minimal') {
        return buildJsonResponse(null, 204);
      }
      const hydrated = await hydrateJoins(db, schema, tableName, res.rows, selectSpec);
      if (wantsSingleObject) {
        if (hydrated.length !== 1) return buildJsonResponse({ code: 'PGRST116', message: 'Not single row' }, 406);
        return buildJsonResponse(hydrated[0], 200);
      }
      return buildJsonResponse(hydrated, 200);
    }

    if (method === 'DELETE') {
      const params = [];
      const whereSql = buildWhereClause(tableName, tableMeta, urlObj.searchParams, params, schema);
      const res = await db.query(
        `DELETE FROM public.${quoteIdent(tableName)} ${whereSql} RETURNING *`,
        params
      );
      if (prefer.returnMode === 'minimal') {
        return buildJsonResponse(null, 204);
      }
      const hydrated = await hydrateJoins(db, schema, tableName, res.rows, selectSpec);
      return buildJsonResponse(hydrated, 200);
    }

    return buildJsonResponse({ message: `Method ${method} not supported` }, 405);
  } catch (err) {
    return mapPgError(err);
  }
}

async function handleRpcRequest(db, schema, fnName, rawBody) {
  const proc = schema.procs.get(fnName);
  if (!proc) {
    return buildJsonResponse({ code: 'PGRST202', message: `Could not find function public.${fnName}` }, 404);
  }
  let bodyObj = {};
  if (rawBody) {
    try {
      bodyObj = JSON.parse(rawBody);
    } catch {
      return buildJsonResponse({ code: 'PGRST102', message: 'Invalid JSON body' }, 400);
    }
  }
  if (!bodyObj || typeof bodyObj !== 'object' || Array.isArray(bodyObj)) {
    return buildJsonResponse({ code: 'PGRST102', message: 'Invalid JSON body' }, 400);
  }
  const params = [];
  const argAssignments = [];
  for (const arg of proc.args) {
    if (Object.prototype.hasOwnProperty.call(bodyObj, arg.name) && bodyObj[arg.name] !== undefined) {
      let val = bodyObj[arg.name];
      if (arg.type === 'jsonb' || arg.type === 'json') {
        val = typeof val === 'string' ? val : JSON.stringify(val);
      }
      params.push(val);
      argAssignments.push(`${quoteIdent(arg.name)} => $${params.length}::${arg.type}`);
    }
  }
  try {
    const callSql = `SELECT * FROM public.${quoteIdent(fnName)}(${argAssignments.join(', ')})`;
    const res = await db.query(callSql, params);
    if (proc.returnType === 'void') {
      return buildJsonResponse(null, 204);
    }
    if (proc.retSet) {
      return buildJsonResponse(res.rows, 200);
    }
    if (!res.rows.length) {
      return buildJsonResponse(null, 200);
    }
    const row = res.rows[0];
    if (Object.prototype.hasOwnProperty.call(row, fnName)) {
      return buildJsonResponse(row[fnName], 200);
    }
    const keys = Object.keys(row);
    return buildJsonResponse(keys.length === 1 ? row[keys[0]] : row, 200);
  } catch (err) {
    return mapPgError(err);
  }
}

export async function createSupabasePgliteHarness(options = {}) {
  const {
    loadScaleMigrations = false,
    initialFaults = {},
    seedCatalog = true,
    seedConfig = true,
    seedAdvisors = true
  } = options;

  const db = new PGlite({ extensions: { pg_trgm } });
  await bootstrapSupabaseRoles(db);
  await loadMigrations(db, CORE_MIGRATION_FILES);
  if (loadScaleMigrations) {
    await loadMigrations(db, SCALE_MIGRATION_FILES);
  }

  const schema = await introspectSchema(db);
  const seededStudentsRes = await db.query(
    `SELECT code, email, name, parent_name, phone, cognito_user_id, izteach_student_id,
            class_code, has_live_class, has_online_courses, online_courses, aliases
     FROM public.ktn_students
     ORDER BY code`
  );
  const seededStudents = seededStudentsRes.rows;
  const faults = { ...initialFaults };
  const upstreamCalls = {
    supabase: [],
    auth: [],
    gemini: [],
    zalo: [],
    meta: [],
    resend: [],
    izteach: []
  };
  const resendByIdempotencyKey = new Map();
  let mockSeq = 1;
  const nextMockId = (prefix) => `${prefix}_${String(mockSeq++).padStart(5, '0')}`;

  const authUsers = new Map();
  const authTokens = new Map();

  function registerJwtUser({
    email,
    password = TEST_ENV_DEFAULTS.KTN_STAFF_AND_TEST_PASSWORD,
    email_confirmed_at = new Date().toISOString(),
    access_token = null,
    sub = null
  }) {
    const normEmail = String(email).trim().toLowerCase();
    const uid = sub || crypto.randomUUID();
    const token = access_token || [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: uid, email: normEmail, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
      Buffer.from('mock-jwt-sig').toString('base64url')
    ].join('.');
    const record = { id: uid, email: normEmail, password, email_confirmed_at, access_token: token };
    authUsers.set(normEmail, record);
    authTokens.set(token, record);
    return record;
  }

  function seedDefaultAuthUsers() {
    authUsers.clear();
    authTokens.clear();
    registerJwtUser({ email: STAFF_ACTORS.manager.email });
    for (const adv of STAFF_ACTORS.advisors) {
      registerJwtUser({ email: adv.email });
    }
    registerJwtUser({ email: STAFF_ACTORS.inactiveAdvisor.email });
  }

  const izteach = {
    students: [],
    permissionsByUid: {},
    permissionRecordsByUid: {}
  };

  function getOrInitPermissionRecords(uid) {
    if (!izteach.permissionRecordsByUid[uid]) izteach.permissionRecordsByUid[uid] = [];
    const courses = izteach.permissionsByUid[uid] || [];
    if (courses.length > 0 && izteach.permissionRecordsByUid[uid].length === 0) {
      izteach.permissionRecordsByUid[uid].push({
        _id: `perm_${String(uid).slice(0, 8)}_01`,
        id: `perm_${String(uid).slice(0, 8)}_01`,
        userId: uid,
        onlineCourses: [...courses],
        limitTime: null,
        isExpired: false
      });
    } else if (courses.length > 0 && izteach.permissionRecordsByUid[uid].length > 0) {
      izteach.permissionRecordsByUid[uid][0].onlineCourses = [...courses];
    }
    return izteach.permissionRecordsByUid[uid];
  }

  function resetIzTeachState() {
    izteach.students = [
      {
        _id: '6abb2c0b8b46e30002add37b',
        id: '6abb2c0b8b46e30002add37b',
        dynamoId: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
        userId: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
        email: 'taphong2002@gmail.com',
        name: 'Tạ Phong Võ',
        phone: '0900000001'
      },
      {
        _id: '6abb2c0b8b46e30002add389',
        id: '6abb2c0b8b46e30002add389',
        dynamoId: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
        userId: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
        email: 'hoangngan@khongtunhi.com',
        name: 'Bé Nguyễn Hoàng Ngân',
        phone: '0900000089'
      }
    ];
    izteach.permissionsByUid = {
      'bc21991c-ce9b-465d-b85f-dbb1821e51a9': ['6adadba969897b0002482ca5'],
      'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68': ['6adadba969897b0002482ca5']
    };
    izteach.permissionRecordsByUid = {};
  }

  async function seedBaseData() {
    if (seedConfig) {
      await db.query(
        `UPDATE public.ktn_payment_config
         SET bank_id = $1, bank_name = 'MBBank', account_no = $2, account_name = $3, updated_at = now()
         WHERE id = 'default'`,
        [TEST_ENV_DEFAULTS.KTN_SEPAY_BANK_ID, TEST_ENV_DEFAULTS.KTN_SEPAY_ACCOUNT_NO, TEST_ENV_DEFAULTS.KTN_SEPAY_ACCOUNT_NAME]
      );
      await db.query(
        `UPDATE public.ktn_consultation_guidance
         SET course_ids = $1::text[], duration_presets = $2::jsonb, policy = $3, examples = $4::jsonb,
             bot_enabled = $5, checkout_enabled = $6, updated_at = now()
         WHERE id = 'default'`,
        [
          DEFAULT_GUIDANCE_CONFIG.course_ids,
          JSON.stringify(DEFAULT_GUIDANCE_CONFIG.duration_presets),
          DEFAULT_GUIDANCE_CONFIG.policy,
          JSON.stringify(DEFAULT_GUIDANCE_CONFIG.examples),
          DEFAULT_GUIDANCE_CONFIG.bot_enabled,
          DEFAULT_GUIDANCE_CONFIG.checkout_enabled
        ]
      );
    }

    if (seedCatalog) {
      for (const c of CATALOG_COURSES) {
        await db.query(
          `INSERT INTO public.ktn_courses
            (course_id, code, title, short_title, badge, age_group, lessons_count, price, old_price, is_bundle, bundle_course_ids, active, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,true,$12)
           ON CONFLICT (course_id) DO UPDATE SET
             price = EXCLUDED.price, title = EXCLUDED.title, active = true`,
          [
            c.course_id, c.code, c.title, c.short_title, c.badge, c.age_group,
            c.lessons_count, c.price, c.old_price, c.is_bundle,
            JSON.stringify(c.bundle_course_ids), c.sort_order
          ]
        );
      }
    }

    if (seedAdvisors) {
      for (const adv of [...STAFF_ACTORS.advisors, STAFF_ACTORS.inactiveAdvisor]) {
        await db.query(
          `INSERT INTO public.ktn_advisors (email, name, active, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active, role = EXCLUDED.role`,
          [adv.email, adv.name, adv.active, adv.advisorRole]
        );
      }
    }

    for (const stu of seededStudents) {
      await db.query(
        `INSERT INTO public.ktn_students
          (code, email, name, parent_name, phone, cognito_user_id, izteach_student_id,
           class_code, has_live_class, has_online_courses, online_courses, aliases,
           lead_source, zalo_user_id, consultation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,NULL,NULL,NULL)
         ON CONFLICT (code) DO UPDATE SET
           email = EXCLUDED.email,
           name = EXCLUDED.name,
           parent_name = EXCLUDED.parent_name,
           phone = EXCLUDED.phone,
           cognito_user_id = EXCLUDED.cognito_user_id,
           izteach_student_id = EXCLUDED.izteach_student_id,
           class_code = EXCLUDED.class_code,
           has_live_class = EXCLUDED.has_live_class,
           has_online_courses = EXCLUDED.has_online_courses,
           online_courses = EXCLUDED.online_courses,
           aliases = EXCLUDED.aliases,
           lead_source = NULL,
           zalo_user_id = NULL,
           consultation_id = NULL,
           updated_at = now()`,
        [
          stu.code,
          stu.email,
          stu.name,
          stu.parent_name ?? '',
          stu.phone ?? '',
          stu.cognito_user_id ?? null,
          stu.izteach_student_id ?? null,
          stu.class_code ?? null,
          Boolean(stu.has_live_class),
          Boolean(stu.has_online_courses),
          JSON.stringify(stu.online_courses ?? []),
          JSON.stringify(stu.aliases ?? [])
        ]
      );
    }
  }

  seedDefaultAuthUsers();
  resetIzTeachState();
  await seedBaseData();

  async function reset() {
    await db.exec(`
      UPDATE public.ktn_students
      SET consultation_id = NULL, zalo_user_id = NULL, lead_source = NULL;
      TRUNCATE TABLE
        public.ktn_zalo_oa_events,
        public.ktn_sepay_reconciliation_logs,
        public.ktn_consultation_flags,
        public.ktn_consultation_events,
        public.ktn_consultation_messages,
        public.ktn_consultation_payments,
        public.ktn_consultation_orders,
        public.ktn_consultations,
        public.ktn_consultation_advisor_counters,
        public.ktn_advisors,
        public.ktn_orders,
        public.ktn_provisioning_jobs,
        public.ktn_sync_events,
        public.ktn_dlp_alerts,
        public.ktn_admin_audit_logs,
        public.ktn_homeworks,
        public.ktn_messages,
        public.ktn_push_subscriptions
      RESTART IDENTITY CASCADE;
    `);
    const seededCodes = seededStudents.map((s) => s.code);
    await db.query(
      'DELETE FROM public.ktn_students WHERE NOT (code = ANY($1::text[]))',
      [seededCodes]
    );
    for (const stu of seededStudents) {
      await db.query(
        'DELETE FROM public.ktn_students WHERE lower(email) = lower($1) AND code <> $2',
        [stu.email, stu.code]
      );
      await db.query(
        'UPDATE public.ktn_students SET email = $1 WHERE code = $2 AND lower(email) <> lower($3)',
        [`__reset_${stu.code}@reset.local`, stu.code, stu.email]
      );
    }
    for (const key of Object.keys(faults)) delete faults[key];
    for (const arr of Object.values(upstreamCalls)) arr.length = 0;
    resendByIdempotencyKey.clear();
    seedDefaultAuthUsers();
    resetIzTeachState();
    await seedBaseData();
  }

  async function handleAuthRequest(u, method, headers, rawBody) {
    upstreamCalls.auth.push({ url: u.toString(), method, timestamp: new Date().toISOString() });
    if (u.pathname === '/auth/v1/token' && method === 'POST') {
      const apiKey = headers.get('apikey') || '';
      if (!apiKey) return buildJsonResponse({ error: 'invalid_apikey' }, 401);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const email = String(body.email || '').trim().toLowerCase();
      const user = authUsers.get(email);
      if (!user || user.password !== body.password) {
        return buildJsonResponse({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
      }
      return buildJsonResponse({
        access_token: user.access_token,
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: user.id,
          email: user.email,
          email_confirmed_at: user.email_confirmed_at
        }
      }, 200);
    }
    if (u.pathname === '/auth/v1/user' && method === 'GET') {
      const authHeader = headers.get('authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      let user = authTokens.get(token) || null;
      if (user && typeof user.exp === 'number' && user.exp <= Math.floor(Date.now() / 1000)) {
        return buildJsonResponse({ message: 'JWT expired' }, 401);
      }
      if (!user && token) {
        const parts = token.split('.');
        if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
          try {
            const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            if (header && typeof header === 'object' && payload && typeof payload === 'object' && payload.email) {
              if (typeof payload.exp === 'number' && payload.exp <= Math.floor(Date.now() / 1000)) {
                return buildJsonResponse({ message: 'JWT expired' }, 401);
              }
              user = {
                id: payload.sub || crypto.randomUUID(),
                email: String(payload.email).trim().toLowerCase(),
                email_confirmed_at: payload.email_confirmed_at !== undefined ? payload.email_confirmed_at : null
              };
            }
          } catch {
            user = null;
          }
        }
      }
      if (!user) {
        return buildJsonResponse({ message: 'Invalid JWT' }, 401);
      }
      return buildJsonResponse({
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at
      }, 200);
    }
    return buildJsonResponse({ message: 'Auth route not mocked' }, 404);
  }

  async function handleIzTeachRequest(u, method, headers, rawBody) {
    const p = u.pathname;
    const body = rawBody ? JSON.parse(rawBody) : {};
    upstreamCalls.izteach.push({ url: u.toString(), method, body, timestamp: new Date().toISOString() });

    if (p.endsWith('/signin') && method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      let decodedPwd = '';
      try {
        decodedPwd = Buffer.from(String(body.password || ''), 'base64').toString('utf8');
      } catch {
        decodedPwd = String(body.password || '');
      }
      if (decodedPwd.length < 6 || /^(?:wrong|invalid|bad)[-_]/i.test(decodedPwd)) {
        return buildJsonResponse({ message: 'Invalid credentials' }, 401);
      }
      const stuRes = await db.query('SELECT * FROM public.ktn_students WHERE lower(email) = $1 LIMIT 1', [email]);
      const stu = stuRes.rows[0];
      if (stu) {
        return buildJsonResponse({
          accessToken: 'mock-student-jwt-' + stu.code,
          id: stu.cognito_user_id || stu.code,
          userId: stu.cognito_user_id || stu.code,
          studentId: stu.izteach_student_id || stu.code,
          email: stu.email,
          name: stu.name,
          roles: ['student'],
          type: 'student'
        }, 200);
      }
      const tchRes = await db.query('SELECT * FROM public.ktn_teachers WHERE lower(email) = $1 LIMIT 1', [email]);
      const tch = tchRes.rows[0];
      if (tch) {
        return buildJsonResponse({
          accessToken: 'mock-teacher-jwt-' + tch.code,
          id: tch.code,
          userId: tch.code,
          email: tch.email,
          name: tch.name,
          roles: ['teacher'],
          type: 'teacher'
        }, 200);
      }
      if (email === TEST_ENV_DEFAULTS.IZTEACH_ADMIN_EMAIL || email === STAFF_ACTORS.manager.email) {
        return buildJsonResponse({
          token: 'mock-izteach-admin-token',
          accessToken: 'mock-izteach-admin-token',
          id: '2c01e488-d866-4341-a0db-644fe6ba1202',
          userId: '2c01e488-d866-4341-a0db-644fe6ba1202',
          email,
          name: 'Ban Quản Lý KTN',
          roles: ['root', 'admin'],
          type: 'admin'
        }, 200);
      }
      return buildJsonResponse({ message: 'Invalid credentials' }, 401);
    }

    if (p.endsWith('/prod/student')) {
      if (method === 'GET') {
        const emailQ = String(u.searchParams.get('email') || '').toLowerCase();
        const list = emailQ
          ? izteach.students.filter((s) => String(s.email || '').toLowerCase() === emailQ)
          : izteach.students;
        return buildJsonResponse({ data: list }, 200);
      }
      if (method === 'POST') {
        if (faults.failIzTeachCreate) {
          return buildJsonResponse({ message: 'Simulated izTeach student create error' }, 502);
        }
        if (faults.izTeachPhoneDuplicateOnce) {
          faults.izTeachPhoneDuplicateOnce = false;
          return buildJsonResponse({ message: 'Duplicate phone number in izTeach' }, 409);
        }
        const seq = String(izteach.students.length + 1).padStart(4, '0');
        const uid = body.dynamoId || body.userId || `bbbb1111-2222-3333-4444-00000000${seq}`;
        const created = {
          _id: `66fb0000000000000000${seq}`,
          id: `66fb0000000000000000${seq}`,
          dynamoId: uid,
          userId: uid,
          ...body
        };
        izteach.students.push(created);
        if (!izteach.permissionsByUid[uid]) izteach.permissionsByUid[uid] = [];
        return buildJsonResponse(created, 200);
      }
    }

    if (p.endsWith('/prod/user-permission') && method === 'GET') {
      if (faults.failIzTeachVerify) {
        return buildJsonResponse({ message: 'Simulated izTeach verify error' }, 502);
      }
      const uid = u.searchParams.get('userId');
      const permRecords = getOrInitPermissionRecords(uid);
      const nowMs = Date.now();
      const permissions = permRecords.map((r) => {
        const isExp = r.limitTime ? Date.parse(r.limitTime) < nowMs : false;
        r.isExpired = isExp;
        return { ...r, isExpired: isExp };
      });
      const courses = izteach.permissionsByUid[uid] || [];
      const onlineCourses = courses.map((id) => {
        const matchingPerms = permissions.filter((pr) => (pr.onlineCourses || []).map(String).includes(String(id)));
        const hasActivePerm = matchingPerms.length === 0 ? true : matchingPerms.some((pr) => !pr.isExpired);
        return {
          _id: id,
          id,
          isExpired: !hasActivePerm,
          permissions: matchingPerms.map((pr) => ({
            _id: pr._id || pr.id,
            id: pr._id || pr.id,
            userPermissionId: pr._id || pr.id,
            limitTime: pr.limitTime,
            isExpired: pr.isExpired
          }))
        };
      });
      return buildJsonResponse({ userId: uid, onlineCourses, permissions }, 200);
    }

    if (p.includes('/prod/user-permission/add-products/') && method === 'PUT') {
      if (faults.failIzTeachAddProducts || faults.failStudentCoursesPost) {
        return buildJsonResponse({ message: 'Simulated izTeach add-products 502 error' }, 502);
      }
      const uid = decodeURIComponent(p.split('/add-products/')[1]);
      const current = new Set(izteach.permissionsByUid[uid] || []);
      for (const cid of (body.productIds || body.onlineCourses || [])) current.add(String(cid));
      izteach.permissionsByUid[uid] = Array.from(current);
      getOrInitPermissionRecords(uid);
      return buildJsonResponse({ ok: true, onlineCourses: izteach.permissionsByUid[uid] }, 200);
    }

    if (p.includes('/prod/user-permission/remove-products/') && method === 'PUT') {
      if (faults.failIzTeachRemoveProducts || faults.failStudentCoursesPost) {
        return buildJsonResponse({ message: 'Simulated izTeach remove-products 502 error' }, 502);
      }
      const uid = decodeURIComponent(p.split('/remove-products/')[1]);
      const toRemove = new Set((body.productIds || body.onlineCourses || []).map(String));
      const current = (izteach.permissionsByUid[uid] || []).filter((cid) => !toRemove.has(String(cid)));
      izteach.permissionsByUid[uid] = current;
      getOrInitPermissionRecords(uid);
      return buildJsonResponse({ ok: true, onlineCourses: current }, 200);
    }

    if (p.includes('/prod/user-permission/set-limited-time/') && method === 'PUT') {
      if (faults.failSetLimitedTime) {
        return buildJsonResponse({ message: 'Simulated izTeach set-limited-time 502 error' }, 502);
      }
      const permId = decodeURIComponent(p.split('/set-limited-time/')[1]);
      const rawLimit = body.limitTime;
      let normalizedIso = null;
      if (rawLimit !== null && rawLimit !== undefined && String(rawLimit).trim() !== '') {
        normalizedIso = `${String(rawLimit).trim().slice(0, 10)}T23:59:59.999Z`;
      }
      let updatedRecord = null;
      for (const uid of Object.keys(izteach.permissionsByUid)) {
        const recs = getOrInitPermissionRecords(uid);
        for (const rec of recs) {
          if (String(rec._id || rec.id) === String(permId)) {
            rec.limitTime = normalizedIso;
            rec.isExpired = normalizedIso ? Date.parse(normalizedIso) < Date.now() : false;
            updatedRecord = rec;
          }
        }
      }
      if (!updatedRecord) return buildJsonResponse({ message: 'UserPermission not found' }, 404);
      return buildJsonResponse(updatedRecord, 200);
    }

    return buildJsonResponse({ data: [], ok: true }, 200);
  }

  async function harnessFetch(input, init = {}) {
    const req = input instanceof Request ? input : new Request(String(input), init);
    const u = new URL(req.url);
    const method = (init.method || req.method || 'GET').toUpperCase();
    const headers = new Headers(req.headers);
    if (init.headers) {
      const extra = new Headers(init.headers);
      extra.forEach((v, k) => headers.set(k, v));
    }
    let rawBody = '';
    if (init.body !== undefined && init.body !== null) {
      if (typeof init.body === 'string') {
        rawBody = init.body;
      } else if (init.body instanceof URLSearchParams) {
        rawBody = init.body.toString();
      } else if (Buffer.isBuffer(init.body)) {
        rawBody = init.body.toString('utf8');
      } else if (ArrayBuffer.isView(init.body)) {
        rawBody = Buffer.from(init.body.buffer, init.body.byteOffset, init.body.byteLength).toString('utf8');
      } else if (init.body instanceof ArrayBuffer) {
        rawBody = Buffer.from(init.body).toString('utf8');
      } else if (req.body) {
        rawBody = await req.clone().text();
      } else {
        rawBody = String(init.body);
      }
    } else if (req.body) {
      rawBody = await req.clone().text();
    }

    // 1. Mock Supabase PostgREST + RPC + Auth
    if (u.hostname === 'mock-supabase.local') {
      if (u.pathname.startsWith('/auth/v1/')) {
        return handleAuthRequest(u, method, headers, rawBody);
      }
      if (u.pathname.startsWith('/rest/v1/rpc/')) {
        const fnName = decodeURIComponent(u.pathname.slice('/rest/v1/rpc/'.length)).replace(/^\/+/, '');
        upstreamCalls.supabase.push({ kind: 'rpc', fnName, method });
        return handleRpcRequest(db, schema, fnName, rawBody);
      }
      if (u.pathname.startsWith('/rest/v1/')) {
        upstreamCalls.supabase.push({ kind: 'rest', path: u.pathname + u.search, method });
        return handlePostgrestRequest(db, schema, u, method, headers, rawBody);
      }
      return buildJsonResponse({ message: 'Unmocked Supabase path: ' + u.pathname }, 404);
    }

    // 2. Gemini API
    if (u.hostname === 'generativelanguage.googleapis.com') {
      const apiKey = headers.get('x-goog-api-key') || '';
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      upstreamCalls.gemini.push({ url: u.toString(), apiKey, body: parsed, timestamp: new Date().toISOString() });

      let forcedStatus = null;
      if (faults.geminiStatusByKey && Object.prototype.hasOwnProperty.call(faults.geminiStatusByKey, apiKey)) {
        const entry = faults.geminiStatusByKey[apiKey];
        forcedStatus = Array.isArray(entry) ? entry.shift() : typeof entry === 'function' ? entry(parsed, apiKey) : entry;
      } else if (faults.geminiStatus) {
        forcedStatus = Array.isArray(faults.geminiStatus) ? faults.geminiStatus.shift() : faults.geminiStatus;
      }
      if (forcedStatus && forcedStatus >= 400) {
        return buildJsonResponse({ error: { code: forcedStatus, message: 'Simulated Gemini error' } }, forcedStatus);
      }

      let payloadObj = {
        reply: 'Bé nhà mình đã từng nghe hoặc nhắc lại câu tiếng Trung nào chưa ạ?',
        course_id: '',
        handoff: false
      };
      if (faults.geminiResponse !== undefined) {
        const r = Array.isArray(faults.geminiResponse)
          ? faults.geminiResponse.shift()
          : typeof faults.geminiResponse === 'function'
            ? faults.geminiResponse(parsed, apiKey)
            : faults.geminiResponse;
        if (r !== undefined) payloadObj = r;
      }
      return buildJsonResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payloadObj) }] } }]
      }, 200);
    }

    // 3. Zalo OA v3 & OAuth
    if (u.hostname === 'openapi.zalo.me' || u.hostname === 'oauth.zaloapp.com') {
      const contentType = (headers.get('content-type') || '').toLowerCase();
      let parsed = null;
      if (rawBody) {
        if (contentType.includes('application/x-www-form-urlencoded')) {
          parsed = Object.fromEntries(new URLSearchParams(rawBody));
        } else {
          try {
            parsed = JSON.parse(rawBody);
          } catch {
            if (rawBody.includes('=') && !rawBody.trim().startsWith('{') && !rawBody.trim().startsWith('[')) {
              parsed = Object.fromEntries(new URLSearchParams(rawBody));
            } else {
              parsed = rawBody;
            }
          }
        }
      }
      upstreamCalls.zalo.push({
        url: u.toString(),
        method,
        headers: Object.fromEntries(headers.entries()),
        body: parsed,
        timestamp: new Date().toISOString()
      });
      if (faults.failZaloSend && u.pathname.includes('/message')) {
        return buildJsonResponse({ error: -201, message: 'Simulated Zalo OA Send error' }, 502);
      }
      if (u.hostname === 'oauth.zaloapp.com') {
        return buildJsonResponse({
          access_token: 'mock-zalo-access-token',
          refresh_token: 'mock-zalo-refresh-token',
          expires_in: 3600
        }, 200);
      }
      if (u.pathname.includes('/user/detail') || u.pathname.includes('/getprofile')) {
        const uid = u.searchParams.get('user_id') || u.searchParams.get('data') || 'zalo-user-mock';
        return buildJsonResponse({
          error: 0,
          message: 'Success',
          data: { user_id: uid, display_name: 'Phụ Huynh Zalo Mock', avatar: '' }
        }, 200);
      }
      return buildJsonResponse({
        error: 0,
        message: 'Success',
        data: { message_id: nextMockId('zalo_msg') }
      }, 200);
    }

    // 4. Meta Messenger Graph API
    if (u.hostname === 'graph.facebook.com') {
      const parsed = rawBody ? JSON.parse(rawBody) : null;
      upstreamCalls.meta.push({ url: u.toString(), body: parsed, timestamp: new Date().toISOString() });
      if (faults.failMetaSend) {
        return buildJsonResponse({ error: { message: 'Simulated Messenger Graph error' } }, 502);
      }
      return buildJsonResponse({ message_id: nextMockId('meta_msg') }, 200);
    }

    // 5. Resend Email API
    if (u.hostname === 'api.resend.com') {
      const idempotencyKey = headers.get('idempotency-key') || null;
      const parsed = rawBody ? JSON.parse(rawBody) : null;
      upstreamCalls.resend.push({
        url: u.toString(),
        idempotencyKey,
        body: parsed,
        timestamp: new Date().toISOString()
      });
      if (faults.failResendEmail || faults.failResend) {
        return buildJsonResponse({ message: 'Simulated Resend error' }, 502);
      }
      if (idempotencyKey && resendByIdempotencyKey.has(idempotencyKey)) {
        return buildJsonResponse(resendByIdempotencyKey.get(idempotencyKey), 200);
      }
      const resBody = { id: nextMockId('re_mock') };
      if (idempotencyKey) resendByIdempotencyKey.set(idempotencyKey, resBody);
      return buildJsonResponse(resBody, 200);
    }

    // 6. AWS izTeach APIs
    if (u.hostname.endsWith('.amazonaws.com')) {
      return handleIzTeachRequest(u, method, headers, rawBody);
    }

    throw new Error(`Blocked unexpected outbound network call in offline E2E harness: ${u.toString()}`);
  }

  return {
    db,
    schema,
    fetch: harnessFetch,
    izteach,
    faults,
    upstreamCalls,
    reset,
    seedBaseData,
    registerJwtUser,
    setFaults(patch) {
      Object.assign(faults, patch);
    },
    clearFaults() {
      for (const k of Object.keys(faults)) delete faults[k];
    },
    getUpstreamCalls() {
      return upstreamCalls;
    },
    clearUpstreamCalls() {
      for (const arr of Object.values(upstreamCalls)) arr.length = 0;
    },
    async close() {
      await db.close();
    }
  };
}
