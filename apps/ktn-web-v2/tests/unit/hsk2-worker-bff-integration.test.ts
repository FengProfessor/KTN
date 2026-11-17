// @vitest-environment node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
// @ts-ignore
import { createLocalWorkerHarness } from '../../server/local-worker-middleware.mjs';
// @ts-ignore
import { signTestSessionToken } from '../e2e/teacher-tiers/test-harness-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const HSK2_ID = '6af2d9719a8b000002ad4bc0';
const HSK1_ID = '6adadba969897b0002482ca5';
const CFK1_ID = '65e7704a9ea90c00080d5195';
const HSK2_THUMB =
  'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/1794357758090-hsk2_gemini_thumb.jpg';

describe('HSK2 3.0 Worker BFF, Order Resolution, Course Units & Legacy Admin Sync', () => {
  let harness: any;
  let adminToken: string;

  beforeEach(async () => {
    harness = createLocalWorkerHarness();
    adminToken = await signTestSessionToken({
      id: 'ADMIN-HSK2-TEST',
      email: 'quanly@khongtunhi.com',
      role: 'admin',
      roles: ['admin'],
    });
  });

  it('serves HSK2 3.0 with exact metadata and tokenized demoVideoUrl in GET /api/ktn/courses right after HSK1 3.0', async () => {
    const req = new Request('http://localhost/api/ktn/courses', { method: 'GET' });
    const res = await harness.workerModule.fetch(req, harness.env);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    const ids = data.courses.map((c: any) => c.id);
    expect(ids[0]).toBe(HSK1_ID);
    expect(ids[1]).toBe(HSK2_ID);

    const hsk2 = data.catalogMap[HSK2_ID];
    expect(hsk2).toBeDefined();
    expect(hsk2.code).toBe('HSK2-30');
    expect(hsk2.title).toBe('Khóa học Tiêu Chuẩn New HSK 2 (3.0)');
    expect(hsk2.shortTitle).toBe('HSK2 3.0');
    expect(hsk2.badge).toBe('TIÊU CHUẨN MỚI 3.0');
    expect(hsk2.lessonsCount).toBe(11);
    expect(hsk2.description).toContain('11 bài (22 phần)');
    expect(hsk2.thumb).toBe(HSK2_THUMB);
    expect(hsk2.price).toBe(890000);
    expect(hsk2.oldPrice).toBe(1500000);
    expect(hsk2.demoVideoUrl).toContain('/api/ktn/media/hls/6af2d9cda658a80002e1990d/playlist.m3u8?mt=');
    expect(hsk2.demoVideoUrl).not.toContain('media.izteach.vn');

    const bundle = data.catalogMap.BUNDLE_YCT_ALL;
    expect(bundle.bundleCourseIds).toHaveLength(6);
    expect(bundle.bundleCourseIds).not.toContain(HSK2_ID);
  });

  it('resolves HSK2 3.0 variants in resolveOrderCourseIds without colliding with HSK1, CFK, Mini, Kids, or YCT', () => {
    const workerSource = fs.readFileSync(
      path.join(REPO_ROOT, 'cloudflare-worker-sw-proxy.js'),
      'utf8'
    );
    const sandbox: any = {
      console,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      crypto,
      Response,
      Request,
      Headers,
      fetch: async () => new Response('{}', { status: 200 }),
    };
    vm.createContext(sandbox);
    const strippedSource =
      workerSource.replace(/export\s+default\s+/g, 'const __defaultExport = ') +
      '\nglobalThis.__COURSE_CHAT_ALIASES = COURSE_CHAT_ALIASES;\n';
    vm.runInContext(strippedSource, sandbox);

    const resolveFn = sandbox.resolveOrderCourseIds;
    expect(typeof resolveFn).toBe('function');

    // Object and string HSK2 variants
    expect(resolveFn(HSK2_ID)).toEqual([HSK2_ID]);
    expect(resolveFn('HSK2-30')).toEqual([HSK2_ID]);
    expect(resolveFn('HSK2 3.0')).toEqual([HSK2_ID]);
    expect(resolveFn('hsk2')).toEqual([HSK2_ID]);
    expect(resolveFn('hsk2-3.0')).toEqual([HSK2_ID]);
    expect(resolveFn('Khóa học Tiêu Chuẩn New HSK 2 (3.0)')).toEqual([HSK2_ID]);

    expect(resolveFn({ course_id: 'HSK2-30' })).toEqual([HSK2_ID]);
    expect(resolveFn({ course_name: 'HSK2 3.0' })).toEqual([HSK2_ID]);
    expect(resolveFn({ course_name: 'Khóa học Tiêu Chuẩn New HSK 2 (3.0)' })).toEqual([HSK2_ID]);
    expect(resolveFn({ courseIds: ['hsk2-3.0'] })).toEqual([HSK2_ID]);

    // Non-regression for existing courses & bundle
    expect(resolveFn({ course_id: HSK1_ID })).toEqual([HSK1_ID]);
    expect(resolveFn({ course_name: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)' })).toEqual([HSK1_ID]);
    expect(resolveFn({ course_name: 'Chinese For Kids' })).toEqual([CFK1_ID]);
    expect(resolveFn({ course_id: '65e7636a0a1b61000825c2ef' })).toEqual(['65e7636a0a1b61000825c2ef']);
    expect(resolveFn({ course_id: '6600fa477c18b80008c53c88' })).toEqual(['6600fa477c18b80008c53c88']);
    expect(resolveFn({ course_id: '6600fa7da2bfe10008834e13' })).toEqual(['6600fa7da2bfe10008834e13']);
    expect(resolveFn({ course_name: 'Tiếng Trung Trẻ Em 3' })).toEqual(['6638bd09a7367400085c7ab2']);
    expect(resolveFn({ course_name: 'Tiếng Trung Trẻ Em 4' })).toEqual(['678d14b960eae20002ddf8fe']);
    expect(resolveFn({ course_name: 'Tiếng Trung Trẻ Em 5' })).toEqual(['67a7290a5fdc26000238b4e9']);
    expect(resolveFn('BUNDLE_YCT_ALL')).toHaveLength(6);

    // Chat aliases
    expect(sandbox.__COURSE_CHAT_ALIASES.hsk2).toBe(HSK2_ID);
    expect(sandbox.__COURSE_CHAT_ALIASES['hsk2-30']).toBe(HSK2_ID);
    expect(sandbox.__COURSE_CHAT_ALIASES['hsk2-3.0']).toBe(HSK2_ID);
  });

  it('grants HSK2 3.0 via POST /api/ktn/students/courses while preserving HSK1 3.0 and class YCT2-04, and loads 22 flat part units + 11 grouped lessons', async () => {
    const grantReq = new Request('http://localhost/api/ktn/students/courses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'grant',
        email: 'hoangngan@khongtunhi.com',
        courseIds: [HSK2_ID],
      }),
    });
    const grantRes = await harness.workerModule.fetch(grantReq, harness.env);
    const grantData = await grantRes.json();

    expect(grantRes.status).toBe(200);
    expect(grantData.ok).toBe(true);
    const updatedCourses = (grantData.student?.online_courses || []).map((c: any) => c.id);
    expect(updatedCourses).toContain(HSK1_ID);
    expect(updatedCourses).toContain(HSK2_ID);
    expect(grantData.student?.class_code).toBe('YCT2-04');

    const unitsReq = new Request(
      `http://localhost/api/ktn/courses/units?courseId=${HSK2_ID}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const unitsRes = await harness.workerModule.fetch(unitsReq, harness.env);
    const unitsData = await unitsRes.json();

    const allCoursesData = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'all_courses_lessons_data.json'), 'utf8')
    );
    const expectedHsk2Lessons = allCoursesData[HSK2_ID];
    const expectedPartUnitIds = expectedHsk2Lessons.flatMap((l: any) =>
      (l.parts || []).map((p: any) => p.unitId)
    );
    const expectedPartNumbers = expectedHsk2Lessons.flatMap((l: any, lIdx: number) =>
      (l.parts || []).map((_: any, pIdx: number) => `${l.num || lIdx + 1}.${pIdx + 1}`)
    );
    expect(expectedPartUnitIds).toHaveLength(22);

    expect(unitsRes.status).toBe(200);
    expect(unitsData.ok).toBe(true);
    expect(unitsData.units).toHaveLength(22);
    expect(unitsData.lessons).toHaveLength(11);

    const flatUnitIds = unitsData.units.map((u: any) => u.unitId);
    expect(new Set(flatUnitIds).size).toBe(22);
    expect(flatUnitIds).toEqual(expectedPartUnitIds);
    expect(unitsData.units.map((u: any) => u.partNumber)).toEqual(expectedPartNumbers);
    for (const unit of unitsData.units) {
      expect(unit.id).toBe(unit.unitId);
      expect(unit._id).toBe(unit.unitId);
      expect(unit.lessonNumber).toBeGreaterThanOrEqual(1);
      expect(unit.partTitle).toContain('HSK2_Bài');
      expect(unit.title).toContain('HSK2 3.0');
      expect(unit.videoId).toMatch(/^[0-9a-f]{24}$/i);
      expect(unit.streamUrl).toContain(`/api/ktn/media/hls/${unit.videoId}/playlist.m3u8?mt=`);
      expect(unit.duration).toBeTruthy();
      expect(unit.durationSeconds).toBeGreaterThan(0);
      expect(Array.isArray(unit.materials)).toBe(true);
      expect(Array.isArray(unit.resources)).toBe(true);
      expect(unit.homeworkAssignment).toBeDefined();
      expect(unit.parts).toHaveLength(2);
    }

    for (const lesson of unitsData.lessons) {
      expect(lesson.parts).toHaveLength(2);
      expect(lesson.duration).toContain('(2 phần)');
    }
    const returnedPartUnitIds = unitsData.lessons.flatMap((l: any) =>
      (l.parts || []).map((p: any) => p.unitId)
    );
    expect(returnedPartUnitIds).toHaveLength(22);
    expect(new Set(returnedPartUnitIds).size).toBe(22);
    expect(returnedPartUnitIds).toEqual(expectedPartUnitIds);
    expect(JSON.stringify(unitsData.units)).not.toContain('media.izteach.vn');
    expect(JSON.stringify(unitsData.lessons)).not.toContain('media.izteach.vn');

    // Non-regression: HSK1 (33 flat units / 17 lessons) and CFK-01 (20 units / 20 lessons)
    const hsk1Res = await harness.workerModule.fetch(
      new Request(`http://localhost/api/ktn/courses/units?courseId=${HSK1_ID}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      harness.env
    );
    const hsk1Data = await hsk1Res.json();
    expect(hsk1Res.status).toBe(200);
    expect(hsk1Data.units).toHaveLength(33);
    expect(hsk1Data.lessons).toHaveLength(17);

    const cfkRes = await harness.workerModule.fetch(
      new Request(`http://localhost/api/ktn/courses/units?courseId=${CFK1_ID}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      harness.env
    );
    const cfkData = await cfkRes.json();
    expect(cfkRes.status).toBe(200);
    expect(cfkData.units).toHaveLength(20);
    expect(cfkData.lessons).toHaveLength(20);
  });

  it('executes cloudflare-worker-sw-proxy.js in vm sandbox where sandbox.fetch directly returns reversed rawIzUnits (no num/lessonNumber/partNumber) into 22 flat units and 11 lessons while keeping HSK1 & CFK intact', async () => {
    const allCoursesData = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'all_courses_lessons_data.json'), 'utf8')
    );
    const expectedHsk2Lessons = allCoursesData[HSK2_ID];
    const expectedPartUnitIds = expectedHsk2Lessons.flatMap((l: any) =>
      (l.parts || []).map((p: any) => p.unitId)
    );
    const expectedPartNumbers = expectedHsk2Lessons.flatMap((l: any, lIdx: number) =>
      (l.parts || []).map((_: any, pIdx: number) => `${l.num || lIdx + 1}.${pIdx + 1}`)
    );

    // Build a raw 22-unit izTeach /prod/unit payload (no num/lessonNumber/partNumber, reversed order & reversed index)
    const rawIzUnits = expectedHsk2Lessons
      .flatMap((l: any) =>
        (l.parts || []).map((p: any) => ({
          _id: p.unitId,
          id: p.unitId,
          course: HSK2_ID,
          title: p.partTitle,
          type: 'video',
          video: p.videoId,
          duration: p.duration,
        }))
      )
      .reverse()
      .map((u: any, reversedIdx: number) => ({ ...u, index: reversedIdx }));

    const hsk1Mapping = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'hsk1_33_units_mapping.json'), 'utf8')
    )?.mappingTable || [];

    const buildCourseRawUnits = (cid: string) => {
      if (cid === HSK1_ID) {
        return hsk1Mapping.map((m: any, uIdx: number) => {
          const vid = (Array.isArray(m.resourceIds) && m.resourceIds[0]) || '';
          return {
            _id: m.unitId,
            id: m.unitId,
            index: uIdx,
            course: cid,
            section: m.chapterId || '6adadbaf69897b0002482cb5',
            title: m.rawTitle,
            type: 'video',
            video: vid,
            videoId: vid,
            streamUrl: vid
              ? `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/${vid}/playlist.m3u8`
              : '',
            duration: m.duration || '12:00',
          };
        });
      }
      const list = allCoursesData[cid] || [];
      let idx = 0;
      const out: any[] = [];
      for (const l of list) {
        const parts = Array.isArray(l.parts) && l.parts.length > 0 ? l.parts : [{}];
        for (const p of parts) {
          const uid = p.videoUnitId || p.unitId;
          out.push({
            _id: uid,
            id: uid,
            index: idx++,
            num: l.num,
            course: cid,
            title: p.partTitle || l.titleZh || `Bài ${l.num}`,
            type: 'video',
            video: p.videoId || '',
            duration: p.duration || l.duration || '12:00',
          });
        }
      }
      return out;
    };

    const fetchCounts = {
      hsk2ProdUnit: 0,
      hsk1ProdUnit: 0,
      cfkProdUnit: 0,
      signin: 0,
    };

    const sandboxFetch = async (input: RequestInfo | URL) => {
      const urlStr =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes('/prod/signin')) {
        fetchCounts.signin += 1;
        return new Response(JSON.stringify({ accessToken: 'izteach-vm-admin-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/prod/unit') && urlStr.includes(HSK2_ID)) {
        fetchCounts.hsk2ProdUnit += 1;
        return new Response(JSON.stringify(rawIzUnits), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/prod/unit') && urlStr.includes(HSK1_ID)) {
        fetchCounts.hsk1ProdUnit += 1;
        return new Response(JSON.stringify(buildCourseRawUnits(HSK1_ID)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/prod/unit') && urlStr.includes(CFK1_ID)) {
        fetchCounts.cfkProdUnit += 1;
        return new Response(JSON.stringify(buildCourseRawUnits(CFK1_ID)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const workerCode = fs
      .readFileSync(path.join(REPO_ROOT, 'cloudflare-worker-sw-proxy.js'), 'utf8')
      .replace(/export\s+default\s+\{/, 'module.exports = {');

    const NativeUint8Array = Object.getPrototypeOf(Buffer);
    const NativeArrayBuffer = new NativeUint8Array(0).buffer.constructor;
    const NativeDataView = new DataView(new NativeArrayBuffer(0)).constructor;

    const sandbox: any = {
      module: { exports: {} },
      exports: {},
      fetch: sandboxFetch,
      Request,
      Response,
      Headers,
      URL,
      URLSearchParams,
      crypto: crypto.webcrypto || globalThis.crypto,
      TextEncoder,
      TextDecoder,
      atob: globalThis.atob || ((str: string) => Buffer.from(str, 'base64').toString('binary')),
      btoa: globalThis.btoa || ((str: string) => Buffer.from(str, 'binary').toString('base64')),
      console,
      setTimeout,
      clearTimeout,
      Date,
      Math,
      JSON,
      Array,
      ArrayBuffer: NativeArrayBuffer,
      Uint8Array: NativeUint8Array,
      DataView: NativeDataView,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Promise,
      Error,
      TypeError,
      encodeURIComponent,
      decodeURIComponent,
      unescape,
      escape,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(workerCode, sandbox);
    const vmWorker = sandbox.module.exports;

    const hsk2Res = await vmWorker.fetch(
      new Request(`http://localhost/api/ktn/courses/units?courseId=${HSK2_ID}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      harness.env
    );
    const hsk2Data = await hsk2Res.json();

    expect(fetchCounts.signin).toBe(1);
    expect(fetchCounts.hsk2ProdUnit).toBe(1);
    expect(hsk2Res.status).toBe(200);
    expect(hsk2Data.units).toHaveLength(22);
    expect(hsk2Data.lessons).toHaveLength(11);

    const flatUnitIds = hsk2Data.units.map((u: any) => u.unitId);
    expect(new Set(flatUnitIds).size).toBe(22);
    expect(flatUnitIds).toEqual(expectedPartUnitIds);
    expect(hsk2Data.units.map((u: any) => u.partNumber)).toEqual(expectedPartNumbers);
    // Verify Part 2 of Lesson 1 was NOT overwritten by Part 1's COURSE_UNIT_MAP ID
    expect(hsk2Data.units[0].unitId).toBe('6af2da51b46c6400026f9097');
    expect(hsk2Data.units[1].unitId).toBe('6af2dd379a8b000002ad6194');
    expect(hsk2Data.units[0].streamUrl).toContain('6af2d9cda658a80002e1990d');
    expect(hsk2Data.units[1].streamUrl).toContain('6af2dd36d7a90a0002d12ecc');
    expect(hsk2Data.lessons[0].parts[0].unitId).toBe('6af2da51b46c6400026f9097');
    expect(hsk2Data.lessons[0].parts[1].unitId).toBe('6af2dd379a8b000002ad6194');
    expect(hsk2Data.lessons[0].parts[0].url).toContain('6af2d9cda658a80002e1990d');
    expect(hsk2Data.lessons[0].parts[1].url).toContain('6af2dd36d7a90a0002d12ecc');
    expect(JSON.stringify(hsk2Data)).not.toContain('media.izteach.vn');

    // Non-regression in same vm sandbox: HSK1 (33 units / 17 lessons incl. 15 main) & CFK-01 (20 units / 20 lessons)
    const hsk1Res = await vmWorker.fetch(
      new Request(`http://localhost/api/ktn/courses/units?courseId=${HSK1_ID}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      harness.env
    );
    const hsk1Data = await hsk1Res.json();
    expect(fetchCounts.hsk1ProdUnit).toBe(1);
    expect(hsk1Res.status).toBe(200);
    expect(hsk1Data.units).toHaveLength(33);
    expect(hsk1Data.lessons).toHaveLength(17);
    expect(hsk1Data.lessons.filter((l: any) => l.unitType !== 'workbook')).toHaveLength(15);

    const cfkRes = await vmWorker.fetch(
      new Request(`http://localhost/api/ktn/courses/units?courseId=${CFK1_ID}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      harness.env
    );
    const cfkData = await cfkRes.json();
    expect(fetchCounts.cfkProdUnit).toBe(1);
    expect(cfkRes.status).toBe(200);
    expect(cfkData.units).toHaveLength(20);
    expect(cfkData.lessons).toHaveLength(20);
    expect(cfkData.units.every((u: any) => Array.isArray(u.parts) && u.parts.length === 1)).toBe(true);
  });

  it('creates and approves an HSK2 3.0 order (by ID and by HSK2-30 code) without falling back to HSK1 3.0', async () => {
    const createReq = new Request('http://localhost/api/ktn/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName: 'Phạm Gia Huy',
        studentEmail: 'giahuy.hsk2@khongtunhi.com',
        phone: '0912345679',
        courseId: 'HSK2-30',
      }),
    });
    const createRes = await harness.workerModule.fetch(createReq, harness.env);
    const createData = await createRes.json();

    expect(createRes.status).toBe(200);
    expect(createData.ok).toBe(true);
    expect(createData.order.course_id).toBe(HSK2_ID);
    expect(createData.order.course_valid).toBe(true);
    expect(createData.order.amount_valid).toBe(true);
    expect(createData.order.amount).toBe(890000);

    // Mark order paid + called before approval via POST /api/ktn/orders/update
    const patchRes = await harness.workerModule.fetch(
      new Request('http://localhost/api/ktn/orders/update', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: createData.orderId,
          contactStatus: 'called',
          paymentDetailedStatus: 'verified_paid',
          paymentTxRef: 'VCB-HSK2-20261117',
          paymentReceivedAmount: 890000,
        }),
      }),
      harness.env
    );
    const patchData = await patchRes.json();
    expect(patchRes.status).toBe(200);
    expect(patchData.order.payment_status).toBe('paid');

    const approveReq = new Request('http://localhost/api/ktn/orders/approve', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId: createData.orderId,
        confirmActivation: true,
        studentEmail: 'giahuy.hsk2@khongtunhi.com',
      }),
    });
    const approveRes = await harness.workerModule.fetch(approveReq, harness.env);
    const approveData = await approveRes.json();

    expect(approveRes.status).toBe(200);
    expect(approveData.ok).toBe(true);
    const grantedIds = (approveData.student?.online_courses || []).map((c: any) => c.id);
    expect(grantedIds).toContain(HSK2_ID);
    expect(grantedIds).not.toContain(HSK1_ID);
  });

  it('includes HSK2 3.0 in sll-admin.html, so-lien-lac-ux.js, so-lien-lac-lms.js, and supabase_schema.sql while keeping selectBundle6Courses intact', () => {
    const sllAdmin = fs.readFileSync(path.join(REPO_ROOT, 'sll-admin.html'), 'utf8');
    expect(sllAdmin).toContain(HSK2_ID);
    expect(sllAdmin).toContain('HSK2-30');
    expect(sllAdmin).toContain('Khóa học Tiêu Chuẩn New HSK 2 (3.0)');
    expect(sllAdmin).toContain('TIÊU CHUẨN MỚI 3.0');
    expect(sllAdmin).toContain(HSK2_THUMB);
    expect(sllAdmin).toContain('id="stu-course-search"');
    expect(sllAdmin).toContain('filterStudentCourseCheckboxes');

    const bundleBlockMatch = sllAdmin.match(
      /function selectBundle6Courses\(\) \{[\s\S]*?const bundleIds = new Set\(\[([\s\S]*?)\]\)/
    );
    expect(bundleBlockMatch).not.toBeNull();
    expect(bundleBlockMatch![1]).not.toContain(HSK2_ID);

    const sllUx = fs.readFileSync(path.join(REPO_ROOT, 'so-lien-lac-ux.js'), 'utf8');
    expect(sllUx).toContain(`'${HSK2_ID}'`);
    expect(sllUx).toContain('HSK2-30');

    const sllLms = fs.readFileSync(path.join(REPO_ROOT, 'so-lien-lac-lms.js'), 'utf8');
    expect(sllLms).toContain(`'${HSK2_ID}'`);
    expect(sllLms).toContain('HSK2-30');

    const schemaSql = fs.readFileSync(path.join(REPO_ROOT, 'supabase_schema.sql'), 'utf8');
    expect(schemaSql).toContain(HSK2_ID);
    expect(schemaSql).toContain('HSK2-30');
    const seedBlockMatch = schemaSql.match(
      /INSERT INTO public\.ktn_courses[\s\S]*?VALUES([\s\S]*?)ON CONFLICT \(course_id\) DO NOTHING;/
    );
    expect(seedBlockMatch).not.toBeNull();
    const sortOrders = Array.from(seedBlockMatch![1].matchAll(/,\s*(\d+)\)\s*(?:,|$)/gm)).map((m) =>
      Number(m[1])
    );
    expect(sortOrders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('resolves HSK2 Part-2 unitId and HSK2_Bài 3.1 title without courseId in so-lien-lac-lms.js while preserving HSK1/CFK/Kids', () => {
    const allCoursesData = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'all_courses_lessons_data.json'), 'utf8')
    );
    const sllLmsSource = fs.readFileSync(path.join(REPO_ROOT, 'so-lien-lac-lms.js'), 'utf8');

    const appObj: any = {
      currentRole: 'admin',
      students: [],
      foldText: (s: string) =>
        String(s || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase(),
    };
    const fakeEl = { dataset: {}, style: {}, innerHTML: '', textContent: '', classList: { add() {}, remove() {}, toggle() {} } };
    const docObj: any = {
      body: { dataset: {} },
      readyState: 'loading',
      getElementById: () => fakeEl,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => ({ ...fakeEl }),
    };
    const winObj: any = {
      app: appObj,
      ALL_COURSES_LESSONS: allCoursesData,
      addEventListener: () => {},
      location: { hostname: 'localhost', pathname: '/', search: '', hash: '' },
      Notification: { permission: 'default' },
    };
    const sandbox: any = {
      window: winObj,
      app: appObj,
      document: docObj,
      location: winObj.location,
      navigator: { userAgent: 'vitest' },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      MutationObserver: class {
        observe() {}
        disconnect() {}
      },
      setTimeout: () => 0,
      setInterval: () => 0,
      clearTimeout: () => {},
      clearInterval: () => {},
      fetch: async () => new Response('[]', { status: 200 }),
      console,
      URL,
      URLSearchParams,
      Date,
      RegExp,
      JSON,
      Math,
    };
    sandbox.globalThis = sandbox;
    winObj.window = winObj;
    vm.createContext(sandbox);
    vm.runInContext(sllLmsSource, sandbox);

    const resolveRecord = appObj.lms?.resolveCourseAndLessonFromRecord;
    expect(typeof resolveRecord).toBe('function');

    // HSK2 Part-2 unitId without courseId
    const hsk2Part2Res = resolveRecord({ unitId: '6af2dd379a8b000002ad6194' });
    expect(hsk2Part2Res.courseId).toBe(HSK2_ID);
    expect(hsk2Part2Res.courseTitle).toBe('HSK2 3.0');
    expect(hsk2Part2Res.lessonNum).toBe(1);

    // HSK2 Part-10 Part-2 unitId without courseId
    const hsk2L10Part2Res = resolveRecord({ unitId: '6afc670d6382d8000256f51a' });
    expect(hsk2L10Part2Res.courseId).toBe(HSK2_ID);
    expect(hsk2L10Part2Res.lessonNum).toBe(10);

    // HSK2 title without courseId or unitId
    const hsk2TitleRes = resolveRecord({ title: 'HSK2_Bài 3.1' });
    expect(hsk2TitleRes.courseId).toBe(HSK2_ID);
    expect(hsk2TitleRes.courseTitle).toBe('HSK2 3.0');
    expect(hsk2TitleRes.lessonNum).toBe(3);

    // Non-regression: HSK1, CFK, Kids/CFK03, Tiếng Trung Tổng Hợp
    const hsk1Res = resolveRecord({ title: 'HSK1_Bài 2' });
    expect(hsk1Res.courseId).toBe(HSK1_ID);
    expect(hsk1Res.lessonNum).toBe(2);

    const cfkByUnitRes = resolveRecord({ unitId: '663e2cb2f960e80008fb905a' });
    expect(cfkByUnitRes.courseId).toBe(CFK1_ID);
    expect(cfkByUnitRes.lessonNum).toBe(1);

    const cfkByTitleRes = resolveRecord({ title: 'Chinese For Kids · Bài 4' });
    expect(cfkByTitleRes.courseId).toBe(CFK1_ID);
    expect(cfkByTitleRes.lessonNum).toBe(4);

    const kids3Res = resolveRecord({ unitId: '6638bd156090c200087ed9d4' });
    expect(kids3Res.courseId).toBe('6638bd09a7367400085c7ab2');
    expect(kids3Res.lessonNum).toBe(1);

    const mini3Res = resolveRecord({ unitId: '661528f42c3c210008e6b336' });
    expect(mini3Res.courseId).toBe('661528ea42af880008944573');
    expect(mini3Res.lessonNum).toBe(1);

    const tongHopRes = resolveRecord({ title: 'Tiếng Trung Tổng Hợp · Bài 5' });
    expect(tongHopRes.courseId).toBe('65e733b0e3317300084c5ce4');
    expect(tongHopRes.lessonNum).toBe(5);
  });
});
