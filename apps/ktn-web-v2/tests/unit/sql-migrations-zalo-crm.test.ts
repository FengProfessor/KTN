// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const ROLE_BOOTSTRAP_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
`;

function readRepoSql(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

const dbsToClose: PGlite[] = [];

afterEach(async () => {
  while (dbsToClose.length > 0) {
    const db = dbsToClose.pop();
    if (db) {
      await db.close();
    }
  }
});

async function createMigratedDb(options: { includeFullProdChain?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm } });
  dbsToClose.push(db);

  await db.exec(ROLE_BOOTSTRAP_SQL);
  await db.exec(readRepoSql('supabase_schema.sql'));

  if (options.includeFullProdChain) {
    await db.exec(readRepoSql('supabase/migrations/20261109_ktn_master_upgrade.sql'));
  }

  await db.exec(readRepoSql('supabase/migrations/20261114_ktn_consultations.sql'));
  await db.exec(readRepoSql('supabase/migrations/20261115_ktn_consultation_example_capacity.sql'));

  if (options.includeFullProdChain) {
    await db.exec(readRepoSql('supabase/migrations/20261116_ktn_scale_and_lifecycle_indexes.sql'));
    await db.exec(readRepoSql('supabase/migrations/20261118_ktn_log_ingestion_optimization.sql'));
    await db.exec(readRepoSql('supabase/migrations/20261118_ktn_production_scale_all_in_one.sql'));
  }

  await db.exec(readRepoSql('supabase/migrations/20261119_ktn_zalo_oa_crm_sepay.sql'));
  return db;
}

async function expectPgErrorCode(promise: Promise<unknown>, expectedCode: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  expect((caught as { code?: string }).code).toBe(expectedCode);
}

async function expectRoleDenied(
  db: PGlite,
  role: 'anon' | 'authenticated',
  sql: string
): Promise<void> {
  await db.exec('BEGIN;');
  let caught: unknown;
  try {
    await db.exec(`SET LOCAL ROLE ${role};`);
    await db.query(sql);
    await db.exec('COMMIT;');
  } catch (err) {
    caught = err;
    await db.exec('ROLLBACK;').catch(() => undefined);
  }
  expect(caught, `Expected 42501 for role=${role} running: ${sql}`).toBeDefined();
  expect((caught as { code?: string }).code).toBe('42501');
}

async function runAsServiceRole<T = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  await db.exec('BEGIN;');
  try {
    await db.exec('SET LOCAL ROLE service_role;');
    const result = await db.query<T>(sql, params);
    await db.exec('COMMIT;');
    return result.rows;
  } catch (err) {
    await db.exec('ROLLBACK;').catch(() => undefined);
    throw err;
  }
}

describe('SQL Migration 20261119_ktn_zalo_oa_crm_sepay (Offline PGlite)', () => {
  it('applies minimal chain cleanly and exposes new tables, columns, view, and RPCs', async () => {
    const db = await createMigratedDb({ includeFullProdChain: false });

    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('ktn_zalo_oa_events', 'ktn_sepay_reconciliation_logs')
       ORDER BY table_name`
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      'ktn_sepay_reconciliation_logs',
      'ktn_zalo_oa_events'
    ]);

    const fns = await db.query<{ proname: string }>(
      `SELECT p.proname
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN (
           'ktn_consultation_upsert_zalo_inbound',
           'ktn_consultation_log_sepay_reconciliation',
           'ktn_consultation_list_sepay_reconciliation',
           'ktn_consultation_resolve_sepay_reconciliation',
           'ktn_consultation_link_student'
         )
       ORDER BY p.proname`
    );
    expect(fns.rows.map((r) => r.proname)).toEqual([
      'ktn_consultation_link_student',
      'ktn_consultation_list_sepay_reconciliation',
      'ktn_consultation_log_sepay_reconciliation',
      'ktn_consultation_resolve_sepay_reconciliation',
      'ktn_consultation_upsert_zalo_inbound'
    ]);
  }, 30_000);

  it('applies full production migration chain cleanly without trigger or index conflicts', async () => {
    const db = await createMigratedDb({ includeFullProdChain: true });

    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ktn_students'
         AND column_name IN ('lead_source', 'zalo_user_id', 'consultation_id')
       ORDER BY column_name`
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      'consultation_id',
      'lead_source',
      'zalo_user_id'
    ]);
  }, 30_000);

  it('is 100% idempotent when re-run after seeding representative rows', async () => {
    const db = await createMigratedDb({ includeFullProdChain: true });

    await db.query(
      `INSERT INTO public.ktn_advisors (email, name, active, role, ktn_user_id)
       VALUES ('advisor1@khongtunhi.com', 'Tư vấn 1', true, 'advisor', 'u-adv-1')`
    );
    const convRes = await db.query<{ id: string }>(
      `INSERT INTO public.ktn_consultations (
         channel, external_id, owner_email, status, customer_name, customer_phone,
         zalo_user_id, source_tag, lead_meta, student_code
       ) VALUES (
         'zalo_oa', 'zalo-uid-1', 'advisor1@khongtunhi.com', 'open', 'Phụ huynh An', '0901234567',
         'zalo-uid-1', 'ad_963k', '{"goal":"giao tiep"}'::jsonb, 'KTN-2026-089'
       ) RETURNING id`
    );
    const convId = convRes.rows[0].id;

    await db.query(
      `INSERT INTO public.ktn_zalo_oa_events (event_id, event_name, zalo_user_id, consultation_id, payload)
       VALUES ('evt-seed-1', 'user_send_text', 'zalo-uid-1', $1, '{"text":"xin chao"}'::jsonb)`,
      [convId]
    );
    await db.query(
      `INSERT INTO public.ktn_sepay_reconciliation_logs (transaction_id, claimed_order_code, kind, amount)
       VALUES ('tx-seed-1', 'ORD-999999', 'unknown_order', 890000)`
    );

    // Re-run 20261119 a second time
    await db.exec(readRepoSql('supabase/migrations/20261119_ktn_zalo_oa_crm_sepay.sql'));

    const preservedConv = await db.query<{ channel: string; customer_name: string; student_code: string }>(
      `SELECT channel, customer_name, student_code FROM public.ktn_consultations WHERE id = $1`,
      [convId]
    );
    expect(preservedConv.rows).toEqual([
      { channel: 'zalo_oa', customer_name: 'Phụ huynh An', student_code: 'KTN-2026-089' }
    ]);

    const preservedRecon = await db.query<{ transaction_id: string }>(
      `SELECT transaction_id FROM public.ktn_sepay_reconciliation_logs WHERE transaction_id = 'tx-seed-1'`
    );
    expect(preservedRecon.rows).toHaveLength(1);
  }, 30_000);

  it('enforces channel/role/status checks, FK to ktn_students(code) ON DELETE SET NULL, and table columns', async () => {
    const db = await createMigratedDb();

    // Valid channels: web, messenger, zalo_oa
    for (const ch of ['web', 'messenger', 'zalo_oa']) {
      await db.query(
        `INSERT INTO public.ktn_consultations (channel, external_id) VALUES ($1, $2)`,
        [ch, `ext-${ch}`]
      );
    }

    // Invalid channels rejected (23514)
    for (const bad of ['telegram', 'sms', '']) {
      await expectPgErrorCode(
        db.query(`INSERT INTO public.ktn_consultations (channel, external_id) VALUES ($1, $2)`, [bad, `ext-${bad}`]),
        '23514'
      );
    }

    // student_code FK to ktn_students(code) ON DELETE SET NULL
    await db.query(
      `INSERT INTO public.ktn_students (code, email, name, lead_source, zalo_user_id)
       VALUES ('KTN-TEST-DEL', 'deltest@khongtunhi.com', 'Hoc Vien Test', 'zalo_oa', 'zalo-del-1')`
    );
    const linked = await db.query<{ id: string }>(
      `INSERT INTO public.ktn_consultations (channel, external_id, student_code)
       VALUES ('zalo_oa', 'zalo-del-1', 'KTN-TEST-DEL') RETURNING id`
    );
    await db.query(`DELETE FROM public.ktn_students WHERE code = 'KTN-TEST-DEL'`);
    const afterDelete = await db.query<{ student_code: string | null }>(
      `SELECT student_code FROM public.ktn_consultations WHERE id = $1`,
      [linked.rows[0].id]
    );
    expect(afterDelete.rows[0].student_code).toBeNull();

    // ktn_advisors role check
    await db.query(
      `INSERT INTO public.ktn_advisors (email, name) VALUES ('def@khongtunhi.com', 'Default Role')`
    );
    const adv = await db.query<{ role: string }>(
      `SELECT role FROM public.ktn_advisors WHERE email = 'def@khongtunhi.com'`
    );
    expect(adv.rows[0].role).toBe('advisor');

    await db.query(
      `INSERT INTO public.ktn_advisors (email, name, role) VALUES ('mgr@khongtunhi.com', 'Manager', 'manager')`
    );
    await expectPgErrorCode(
      db.query(
        `INSERT INTO public.ktn_advisors (email, name, role) VALUES ('bad@khongtunhi.com', 'Bad', 'superadmin')`
      ),
      '23514'
    );

    // ktn_zalo_oa_events PK deduplication
    await db.query(
      `INSERT INTO public.ktn_zalo_oa_events (event_id, event_name) VALUES ('evt-dup', 'follow')`
    );
    await expectPgErrorCode(
      db.query(
        `INSERT INTO public.ktn_zalo_oa_events (event_id, event_name) VALUES ('evt-dup', 'follow')`
      ),
      '23505'
    );

    // ktn_sepay_reconciliation_logs checks & nullable order_id
    await db.query(
      `INSERT INTO public.ktn_sepay_reconciliation_logs (transaction_id, order_id, claimed_order_code, kind, amount, resolution_status)
       VALUES ('tx-ok', NULL, 'ORD-000001', 'unmatched', 500000, 'open')`
    );
    await expectPgErrorCode(
      db.query(
        `INSERT INTO public.ktn_sepay_reconciliation_logs (transaction_id, kind, amount, resolution_status)
         VALUES ('tx-bad-status', 'unmatched', 500000, 'bogus')`
      ),
      '23514'
    );
    await expectPgErrorCode(
      db.query(
        `INSERT INTO public.ktn_sepay_reconciliation_logs (transaction_id, kind, amount)
         VALUES ('tx-bad-kind', 'bad_kind', 500000)`
      ),
      '23514'
    );

    // ktn_orders & ktn_students new columns
    await db.query(
      `INSERT INTO public.ktn_orders (order_id, student_name, student_email, phone, course_id, course_name, amount, source, assigned_advisor, consultation_id)
       VALUES ('ORD-777777', 'Test', 'ord@khongtunhi.com', '0909000111', 'HSK1-30', 'HSK 1', 890000, 'zalo_oa', 'def@khongtunhi.com', $1)`,
      [linked.rows[0].id]
    );
    const ord = await db.query<{ source: string; assigned_advisor: string; consultation_id: string }>(
      `SELECT source, assigned_advisor, consultation_id FROM public.ktn_orders WHERE order_id = 'ORD-777777'`
    );
    expect(ord.rows[0]).toEqual({
      source: 'zalo_oa',
      assigned_advisor: 'def@khongtunhi.com',
      consultation_id: linked.rows[0].id
    });
  }, 30_000);

  it('recreates ktn_consultation_inbox keeping 16 original columns first and appending 6 new columns', async () => {
    const db = await createMigratedDb();

    const cols = await db.query<{ column_name: string; ordinal_position: number }>(
      `SELECT column_name, ordinal_position
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ktn_consultation_inbox'
       ORDER BY ordinal_position`
    );
    expect(cols.rows.map((c) => c.column_name)).toEqual([
      'id',
      'channel',
      'external_id',
      'owner_email',
      'status',
      'outcome',
      'follow_up_at',
      'queued_at',
      'first_reply_at',
      'last_customer_at',
      'last_reply_at',
      'next_review_at',
      'created_at',
      'updated_at',
      'reply_pending',
      'has_paid_pending',
      'customer_name',
      'customer_phone',
      'zalo_user_id',
      'source_tag',
      'lead_meta',
      'student_code'
    ]);

    const cRes = await db.query<{ id: string }>(
      `INSERT INTO public.ktn_consultations (
         channel, external_id, zalo_user_id, customer_name, customer_phone,
         source_tag, lead_meta, student_code, last_customer_at
       ) VALUES (
         'zalo_oa', 'zalo-inbox-1', 'zalo-inbox-1', 'Mẹ Bé Bo', '0912345678',
         'zalo_oa', '{"age":7}'::jsonb, 'KTN-2026-089', now()
       ) RETURNING id`
    );

    const inboxRows = await runAsServiceRole<{
      id: string;
      channel: string;
      reply_pending: boolean;
      has_paid_pending: boolean;
      customer_name: string;
      customer_phone: string;
      zalo_user_id: string;
      source_tag: string;
      lead_meta: Record<string, unknown>;
      student_code: string;
    }>(db, `SELECT * FROM public.ktn_consultation_inbox WHERE id = $1`, [cRes.rows[0].id]);

    expect(inboxRows).toHaveLength(1);
    expect(inboxRows[0]).toMatchObject({
      id: cRes.rows[0].id,
      channel: 'zalo_oa',
      reply_pending: true,
      has_paid_pending: false,
      customer_name: 'Mẹ Bé Bo',
      customer_phone: '0912345678',
      zalo_user_id: 'zalo-inbox-1',
      source_tag: 'zalo_oa',
      lead_meta: { age: 7 },
      student_code: 'KTN-2026-089'
    });
  }, 30_000);

  it('handles Zalo inbound upsert, deduplication, echo, action/outbox rules, and order protection', async () => {
    const db = await createMigratedDb();

    await db.query(`UPDATE public.ktn_consultation_guidance SET bot_enabled = true WHERE id = 'default'`);
    await db.query(`INSERT INTO public.ktn_advisors (email, name, active) VALUES ('adv@khongtunhi.com', 'Adv', true)`);

    // 1. First inbound Zalo OA message -> creates conversation + message
    const firstRes = await runAsServiceRole<{ res: Record<string, unknown> }>(
      db,
      `SELECT public.ktn_consultation_upsert_zalo_inbound($1, $2, $3, $4::jsonb) AS res`,
      [
        'zmsg-001',
        'user_send_text',
        'zalo-user-42',
        JSON.stringify({
          body: 'Cho mình hỏi khóa tiếng Trung cho bé 7 tuổi',
          customer_name: 'Chị Lan',
          customer_phone: '0987654321',
          source_tag: 'zalo_oa',
          lead_meta: { child_age: 7 }
        })
      ]
    );
    const first = firstRes[0].res as {
      ok: boolean;
      duplicate: boolean;
      conversation: { id: string; channel: string; status: string; customer_name: string };
      message: { body: string; sender: string };
    };
    expect(first.ok).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(first.conversation.channel).toBe('zalo_oa');
    expect(first.conversation.status).toBe('bot');
    expect(first.conversation.customer_name).toBe('Chị Lan');
    expect(first.message.sender).toBe('customer');

    const convId = first.conversation.id;

    // 2. Duplicate event_id -> idempotent duplicate: true, no duplicate message
    const dupRes = await runAsServiceRole<{ res: Record<string, unknown> }>(
      db,
      `SELECT public.ktn_consultation_upsert_zalo_inbound($1, $2, $3, $4::jsonb) AS res`,
      ['zmsg-001', 'user_send_text', 'zalo-user-42', JSON.stringify({ body: 'Cho mình hỏi...' })]
    );
    expect((dupRes[0].res as { ok: boolean; duplicate: boolean }).duplicate).toBe(true);

    const msgCount = await db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM public.ktn_consultation_messages WHERE consultation_id = $1`,
      [convId]
    );
    expect(msgCount.rows[0].cnt).toBe('1');

    // 3. OA echo on same thread -> transitions 'bot' -> 'waiting' and sets sender = 'external'
    const echoRes = await runAsServiceRole<{ res: Record<string, unknown> }>(
      db,
      `SELECT public.ktn_consultation_upsert_zalo_inbound($1, $2, $3, $4::jsonb) AS res`,
      [
        'zmsg-echo-002',
        'oa_send_text',
        'zalo-user-42',
        JSON.stringify({ is_echo: true, body: 'Nhân viên phản hồi trực tiếp trên OA' })
      ]
    );
    const echoPayload = echoRes[0].res as {
      duplicate: boolean;
      conversation: { status: string };
      message: { sender: string };
    };
    expect(echoPayload.duplicate).toBe(false);
    expect(echoPayload.conversation.status).toBe('waiting');
    expect(echoPayload.message.sender).toBe('external');

    // 4. Advisor claims and replies even when last_customer_at is >24h old (Zalo OA is NOT blocked by Messenger 24h window)
    await db.query(
      `UPDATE public.ktn_consultations SET last_customer_at = now() - interval '72 hours' WHERE id = $1`,
      [convId]
    );
    await runAsServiceRole(
      db,
      `SELECT public.ktn_consultation_action($1, 'claim', 'adv@khongtunhi.com', false, '{}'::jsonb)`,
      [convId]
    );
    const replyRes = await runAsServiceRole<{ res: { message?: { delivery: string }; error?: string } }>(
      db,
      `SELECT public.ktn_consultation_action($1, 'reply', 'adv@khongtunhi.com', false, $2::jsonb) AS res`,
      [convId, JSON.stringify({ body: 'Chào chị Lan, em gửi lộ trình ạ.' })]
    );
    expect(replyRes[0].res.error).toBeUndefined();
    expect(replyRes[0].res.message?.delivery).toBe('queued');

    // take_outbox claims zalo_oa queued message as 'sending' despite >24h last_customer_at
    const outboxZalo = await runAsServiceRole<{ id: string; delivery: string; delivery_note: string | null }>(
      db,
      `SELECT id, delivery, delivery_note FROM public.ktn_consultation_take_outbox($1)`,
      [convId]
    );
    expect(outboxZalo).toHaveLength(1);
    expect(outboxZalo[0].delivery).toBe('sending');
    expect(outboxZalo[0].delivery_note).toBeNull();

    // Messenger >24h still enforces 24h window in action & take_outbox
    const msgThread = await db.query<{ id: string }>(
      `INSERT INTO public.ktn_consultations (channel, external_id, owner_email, status, last_customer_at)
       VALUES ('messenger', 'psid-old', 'adv@khongtunhi.com', 'open', now() - interval '30 hours') RETURNING id`
    );
    const msgId = msgThread.rows[0].id;
    const msgReplyBlocked = await runAsServiceRole<{ res: { error?: string } }>(
      db,
      `SELECT public.ktn_consultation_action($1, 'reply', 'adv@khongtunhi.com', false, $2::jsonb) AS res`,
      [msgId, JSON.stringify({ body: 'Tin trễ' })]
    );
    expect(msgReplyBlocked[0].res.error).toBe('window_closed');

    await db.query(
      `INSERT INTO public.ktn_consultation_messages (consultation_id, sender, body, delivery)
       VALUES ($1, 'advisor', 'Queued before timeout', 'queued')`,
      [msgId]
    );
    const outboxMsg = await runAsServiceRole<{ delivery: string; delivery_note: string | null }>(
      db,
      `SELECT delivery, delivery_note FROM public.ktn_consultation_take_outbox($1)`,
      [msgId]
    );
    expect(outboxMsg[0].delivery).toBe('failed');
    expect(outboxMsg[0].delivery_note).toBe('Ngoài cửa sổ Messenger');

    // 5. create_order records source='zalo_oa', assigned_advisor, consultation_id & preserves ktn_consultation_protect_order
    const reqId = '11111111-1111-4111-8111-111111111111';
    const orderRes = await runAsServiceRole<{ res: { order_id: string; source: string; assigned_advisor: string; consultation_id: string } }>(
      db,
      `SELECT public.ktn_consultation_create_order($1, $2, $3::jsonb, $4) AS res`,
      [
        convId,
        reqId,
        JSON.stringify({
          student_name: 'Bé An',
          student_email: 'an@khongtunhi.com',
          phone: '0987654321',
          course_id: 'HSK1-30',
          course_name: 'HSK 1 3.0',
          amount: 890000,
          note: '{"source":"consultation","channel":"zalo_oa"}',
          payment_info: { bank: 'MB' }
        }),
        'https://img.vietqr.io/image/MB-123-compact.png?addInfo=KTN%20ORDER_CODE'
      ]
    );
    const createdOrder = orderRes[0].res;
    expect(createdOrder.order_id).toMatch(/^ORD-\d{6}$/);
    expect(createdOrder.source).toBe('zalo_oa');
    expect(createdOrder.assigned_advisor).toBe('adv@khongtunhi.com');
    expect(createdOrder.consultation_id).toBe(convId);

    // Idempotent retry with same request_id returns exact same order
    const orderRetryRes = await runAsServiceRole<{ res: { order_id: string } }>(
      db,
      `SELECT public.ktn_consultation_create_order($1, $2, $3::jsonb, $4) AS res`,
      [convId, reqId, JSON.stringify({ student_name: 'Ignored', amount: 890000 }), 'https://img.vietqr.io/x']
    );
    expect(orderRetryRes[0].res.order_id).toBe(createdOrder.order_id);

    // Existing record_payment & paid_report continue working cleanly
    const payRes = await runAsServiceRole<{ res: { status: string } }>(
      db,
      `SELECT public.ktn_consultation_record_payment($1, $2, $3) AS res`,
      [createdOrder.order_id, 'TX-ZALO-PAY-1', 890000]
    );
    expect(payRes[0].res.status).toBe('accepted');

    const paidReport = await runAsServiceRole<{ order_id: string; channel: string }>(
      db,
      `SELECT order_id, channel FROM public.ktn_consultation_paid_report WHERE order_id = $1`,
      [createdOrder.order_id]
    );
    expect(paidReport).toEqual([{ order_id: createdOrder.order_id, channel: 'zalo_oa' }]);

    // Trigger ktn_consultation_protect_order must still block stripping "source":"consultation"
    await expectPgErrorCode(
      db.query(`UPDATE public.ktn_orders SET note = 'overwritten' WHERE order_id = $1`, [createdOrder.order_id]),
      'P0001'
    );
  }, 30_000);

  it('logs, lists, resolves SePay reconciliation and links students via RPCs', async () => {
    const db = await createMigratedDb();

    // Unmatched SePay transfer (order_id NULL)
    const log1 = await runAsServiceRole<{ res: { ok: boolean; duplicate: boolean; log: { id: string; order_id: string | null; resolution_status: string } } }>(
      db,
      `SELECT public.ktn_consultation_log_sepay_reconciliation($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) AS res`,
      ['TX-UNMATCHED-1', 'unknown_order', 890000, null, 'ORD-999111', null, '0123456789', 'KTN ORD-999111', JSON.stringify({ gateway: 'MB' })]
    );
    expect(log1[0].res.ok).toBe(true);
    expect(log1[0].res.duplicate).toBe(false);
    expect(log1[0].res.log.order_id).toBeNull();
    expect(log1[0].res.log.resolution_status).toBe('open');

    // Duplicate transaction_id returns duplicate: true
    const logDup = await runAsServiceRole<{ res: { ok: boolean; duplicate: boolean } }>(
      db,
      `SELECT public.ktn_consultation_log_sepay_reconciliation($1, $2, $3) AS res`,
      ['TX-UNMATCHED-1', 'unknown_order', 890000]
    );
    expect(logDup[0].res.ok).toBe(true);
    expect(logDup[0].res.duplicate).toBe(true);

    // List reconciliation RPC with filter & pagination
    const listed = await runAsServiceRole<{ res: { ok: boolean; total: number; items: Array<{ transaction_id: string }> } }>(
      db,
      `SELECT public.ktn_consultation_list_sepay_reconciliation('open', 'unknown_order', 10, 0) AS res`
    );
    expect(listed[0].res.ok).toBe(true);
    expect(listed[0].res.total).toBe(1);
    expect(listed[0].res.items[0].transaction_id).toBe('TX-UNMATCHED-1');

    // Create consultation + real order, link student, and resolve reconciliation log to that order
    const conv = await db.query<{ id: string }>(
      `INSERT INTO public.ktn_consultations (channel, external_id, zalo_user_id, source_tag)
       VALUES ('zalo_oa', 'zalo-stu-1', 'zalo-stu-1', 'ad_963k') RETURNING id`
    );
    const convId = conv.rows[0].id;

    const linkRes = await runAsServiceRole<{ res: { ok: boolean; student_code: string; conversation: { student_code: string } } }>(
      db,
      `SELECT public.ktn_consultation_link_student($1, $2, $3) AS res`,
      [convId, 'KTN-2026-089', 'admin@khongtunhi.com']
    );
    expect(linkRes[0].res.ok).toBe(true);
    expect(linkRes[0].res.student_code).toBe('KTN-2026-089');
    expect(linkRes[0].res.conversation.student_code).toBe('KTN-2026-089');

    const stuCheck = await db.query<{ consultation_id: string; zalo_user_id: string; lead_source: string }>(
      `SELECT consultation_id, zalo_user_id, lead_source FROM public.ktn_students WHERE code = 'KTN-2026-089'`
    );
    expect(stuCheck.rows[0]).toEqual({
      consultation_id: convId,
      zalo_user_id: 'zalo-stu-1',
      lead_source: 'ad_963k'
    });

    const ordRes = await runAsServiceRole<{ res: { order_id: string } }>(
      db,
      `SELECT public.ktn_consultation_create_order($1, $2, $3::jsonb, $4) AS res`,
      [
        convId,
        '22222222-2222-4222-8222-222222222222',
        JSON.stringify({
          student_name: 'Bé Nguyễn Hoàng Ngân',
          student_email: 'hoangngan@khongtunhi.com',
          phone: '0900111222',
          course_id: 'HSK1-30',
          course_name: 'HSK 1 3.0',
          amount: 890000,
          note: '{"source":"consultation"}',
          payment_info: {}
        }),
        'https://img.vietqr.io/image/MB-123.png?addInfo=ORDER_CODE'
      ]
    );
    const orderId = ordRes[0].res.order_id;

    const resolved = await runAsServiceRole<{ res: { ok: boolean; log: { resolution_status: string; resolved_by: string; order_id: string; consultation_id: string } } }>(
      db,
      `SELECT public.ktn_consultation_resolve_sepay_reconciliation($1, $2, $3, $4, $5) AS res`,
      ['TX-UNMATCHED-1', 'resolved', 'accountant@khongtunhi.com', 'Matched manually', orderId]
    );
    expect(resolved[0].res.ok).toBe(true);
    expect(resolved[0].res.log.resolution_status).toBe('resolved');
    expect(resolved[0].res.log.resolved_by).toBe('accountant@khongtunhi.com');
    expect(resolved[0].res.log.order_id).toBe(orderId);
    expect(resolved[0].res.log.consultation_id).toBe(convId);
  }, 30_000);

  it('preserves source_tag, propagates action errors, handles NULL status/kind, and survives empty/null coercions', async () => {
    const db = await createMigratedDb();

    // 1. Follow-up Zalo message omitting source_tag preserves 'ad_963k'
    const adFirst = await runAsServiceRole<{ res: { ok: boolean; conversation: { id: string; source_tag: string } } }>(
      db,
      `SELECT public.ktn_consultation_upsert_zalo_inbound($1, $2, $3, $4::jsonb) AS res`,
      [
        'evt-ad-1',
        'user_send_text',
        'zalo-ad-user',
        JSON.stringify({ body: 'Tư vấn gói 963k', source_tag: 'ad_963k', lead_meta: { ad: '963k' } })
      ]
    );
    expect(adFirst[0].res.ok).toBe(true);
    expect(adFirst[0].res.conversation.source_tag).toBe('ad_963k');

    const adFollowup = await runAsServiceRole<{ res: { ok: boolean; conversation: { source_tag: string } } }>(
      db,
      `SELECT public.ktn_consultation_upsert_zalo_inbound($1, $2, $3, $4::jsonb) AS res`,
      ['evt-ad-2', 'user_send_text', 'zalo-ad-user', JSON.stringify({ body: 'Em hỏi thêm lịch học' })]
    );
    expect(adFollowup[0].res.ok).toBe(true);
    expect(adFollowup[0].res.conversation.source_tag).toBe('ad_963k');

    // 2. 4001-char body returns { ok: false, error: 'invalid' } and marks event failed
    const longRes = await runAsServiceRole<{ res: { ok: boolean; error?: string; event_id: string } }>(
      db,
      `SELECT public.ktn_consultation_upsert_zalo_inbound($1, $2, $3, $4::jsonb) AS res`,
      ['evt-4001', 'user_send_text', 'zalo-long-user', JSON.stringify({ body: 'a'.repeat(4001) })]
    );
    expect(longRes[0].res.ok).toBe(false);
    expect(longRes[0].res.error).toBe('invalid');

    const longEvent = await db.query<{ status: string; error: string | null }>(
      `SELECT status, error FROM public.ktn_zalo_oa_events WHERE event_id = 'evt-4001'`
    );
    expect(longEvent.rows[0]).toEqual({ status: 'failed', error: 'invalid' });

    const longMsgs = await db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM public.ktn_consultation_messages WHERE external_id = 'zalo:evt-4001'`
    );
    expect(longMsgs.rows[0].cnt).toBe('0');

    // 3. NULL status/kind in SePay reconciliation RPCs return { ok: false, error: 'invalid' }
    const nullKindLog = await runAsServiceRole<{ res: { ok: boolean; error?: string } }>(
      db,
      `SELECT public.ktn_consultation_log_sepay_reconciliation($1, $2, $3) AS res`,
      ['TX-NULL-KIND', null, 500000]
    );
    expect(nullKindLog[0].res).toEqual({ ok: false, error: 'invalid' });

    const nullStatusResolve = await runAsServiceRole<{ res: { ok: boolean; error?: string } }>(
      db,
      `SELECT public.ktn_consultation_resolve_sepay_reconciliation($1, $2, $3) AS res`,
      ['TX-NULL-STATUS', null, 'acc@khongtunhi.com']
    );
    expect(nullStatusResolve[0].res).toEqual({ ok: false, error: 'invalid' });

    // 4. Empty string 'at' / 'is_echo' and NULL p_qr_base do not throw SQLSTATE errors
    const emptyCoerceRes = await runAsServiceRole<{
      res: { ok: boolean; conversation: { id: string }; message: { sender: string } };
    }>(
      db,
      `SELECT public.ktn_consultation_upsert_zalo_inbound($1, $2, $3, $4::jsonb) AS res`,
      [
        'evt-empty-coerce',
        'user_send_text',
        'zalo-coerce-user',
        JSON.stringify({ body: 'Xin chào', at: '', is_echo: '' })
      ]
    );
    expect(emptyCoerceRes[0].res.ok).toBe(true);
    expect(emptyCoerceRes[0].res.message.sender).toBe('customer');

    const nullQrOrder = await runAsServiceRole<{ res: { order_id: string; source: string } }>(
      db,
      `SELECT public.ktn_consultation_create_order($1, $2, $3::jsonb, $4) AS res`,
      [
        emptyCoerceRes[0].res.conversation.id,
        '33333333-3333-4333-8333-333333333333',
        JSON.stringify({
          student_name: 'Khách QR Null',
          student_email: 'qrnull@khongtunhi.com',
          phone: '0901112233',
          course_id: 'HSK1-30',
          course_name: 'HSK 1 3.0',
          amount: 890000,
          note: '{"source":"consultation"}',
          payment_info: {}
        }),
        null
      ]
    );
    expect(nullQrOrder[0].res.order_id).toMatch(/^ORD-\d{6}$/);
    expect(nullQrOrder[0].res.source).toBe('zalo_oa');
  }, 30_000);

  it('denies anon and authenticated access (42501) on consultation tables, views, and RPCs while allowing service_role', async () => {
    const db = await createMigratedDb();

    const protectedTables = [
      'ktn_advisors',
      'ktn_consultations',
      'ktn_consultation_messages',
      'ktn_consultation_events',
      'ktn_consultation_flags',
      'ktn_consultation_guidance',
      'ktn_consultation_orders',
      'ktn_consultation_payments',
      'ktn_consultation_advisor_counters',
      'ktn_zalo_oa_events',
      'ktn_sepay_reconciliation_logs'
    ];
    const protectedViews = [
      'ktn_consultation_inbox',
      'ktn_consultation_paid_report',
      'ktn_consultation_assignment_report'
    ];
    const protectedRpcs = [
      `SELECT public.ktn_consultation_action('00000000-0000-0000-0000-000000000000'::uuid, 'customer', NULL, false, '{}'::jsonb)`,
      `SELECT public.ktn_consultation_create_order('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, '{}'::jsonb, '')`,
      `SELECT * FROM public.ktn_consultation_take_outbox(NULL)`,
      `SELECT public.ktn_consultation_upsert_zalo_inbound('e1', 'user_send_text', 'z1', '{}'::jsonb)`,
      `SELECT public.ktn_consultation_log_sepay_reconciliation('t1', 'unmatched', 1000)`,
      `SELECT public.ktn_consultation_list_sepay_reconciliation(NULL, NULL, 10, 0)`,
      `SELECT public.ktn_consultation_resolve_sepay_reconciliation('t1', 'resolved', 'a@b.c')`,
      `SELECT public.ktn_consultation_link_student('00000000-0000-0000-0000-000000000000'::uuid, 'KTN-2026-089')`
    ];

    for (const role of ['anon', 'authenticated'] as const) {
      for (const tbl of protectedTables) {
        await expectRoleDenied(db, role, `SELECT 1 FROM public.${tbl} LIMIT 1`);
      }
      for (const vw of protectedViews) {
        await expectRoleDenied(db, role, `SELECT 1 FROM public.${vw} LIMIT 1`);
      }
      for (const rpcSql of protectedRpcs) {
        await expectRoleDenied(db, role, rpcSql);
      }
    }

    // Explicit has_function_privilege assertions across ALL ktn_consultation_* functions
    const allConsultationRpcSignatures = [
      'public.ktn_consultation_action(uuid,text,text,boolean,jsonb)',
      'public.ktn_consultation_create_order(uuid,uuid,jsonb,text)',
      'public.ktn_consultation_record_payment(text,text,bigint)',
      'public.ktn_consultation_take_payment(text)',
      'public.ktn_consultation_auto_assign(uuid)',
      'public.ktn_consultation_take_outbox(uuid)',
      'public.ktn_consultation_complete_send(uuid,text,text)',
      'public.ktn_consultation_review_flag(uuid,uuid,text,text,text)',
      'public.ktn_consultation_retry_payment(text,text,text)',
      'public.ktn_consultation_upsert_zalo_inbound(text,text,text,jsonb)',
      'public.ktn_consultation_log_sepay_reconciliation(text,text,bigint,text,text,bigint,text,text,jsonb)',
      'public.ktn_consultation_list_sepay_reconciliation(text,text,int,int)',
      'public.ktn_consultation_resolve_sepay_reconciliation(text,text,text,text,text)',
      'public.ktn_consultation_link_student(uuid,text,text)'
    ];
    const triggerSignatures = ['public.ktn_consultation_protect_order()'];

    // Ensure our signature list covers every ktn_consultation_* function in pg_proc
    const dbFuncCount = await db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'ktn_consultation_%'`
    );
    expect(Number(dbFuncCount.rows[0].cnt)).toBe(
      allConsultationRpcSignatures.length + triggerSignatures.length
    );

    for (const sig of [...allConsultationRpcSignatures, ...triggerSignatures]) {
      for (const role of ['anon', 'authenticated'] as const) {
        const priv = await db.query<{ allowed: boolean }>(
          `SELECT has_function_privilege($1, $2, 'EXECUTE') AS allowed`,
          [role, sig]
        );
        expect(priv.rows[0].allowed, `Expected EXECUTE=false for ${role} on ${sig}`).toBe(false);
      }
    }
    for (const sig of allConsultationRpcSignatures) {
      const srPriv = await db.query<{ allowed: boolean }>(
        `SELECT has_function_privilege('service_role', $1, 'EXECUTE') AS allowed`,
        [sig]
      );
      expect(srPriv.rows[0].allowed, `Expected EXECUTE=true for service_role on ${sig}`).toBe(true);
    }

    // service_role can query tables, views, and execute RPCs cleanly
    const srInbox = await runAsServiceRole(db, `SELECT count(*)::int AS cnt FROM public.ktn_consultation_inbox`);
    expect(srInbox).toHaveLength(1);
    const srRecon = await runAsServiceRole<{ res: { ok: boolean } }>(
      db,
      `SELECT public.ktn_consultation_list_sepay_reconciliation(NULL, NULL, 10, 0) AS res`
    );
    expect(srRecon[0].res.ok).toBe(true);
  }, 30_000);
});
