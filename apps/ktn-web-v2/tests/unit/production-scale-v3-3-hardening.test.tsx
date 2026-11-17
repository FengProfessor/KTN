import React from 'react';
import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// @ts-ignore
import { createLocalWorkerHarness } from '../../server/local-worker-middleware.mjs';
import { RootErrorBoundary, RouteErrorBoundary } from '@/components/shared/ErrorBoundary';
import { isChunkLoadError, tryAutoReloadOnChunkError } from '@/lib/lazyWithRetry';
import { ClassScheduleModal } from '@/features/classrooms/components/ClassScheduleModal';
import { chatApi } from '@/features/chat/services/chatApi';

function signTestSessionToken(
  payload: Record<string, any>,
  secret = 'ktn-v2-local-hmac-secret-2026',
  ttlMs = 30 * 86400 * 1000
): string {
  const jti =
    payload.jti || 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  const data = {
    ...payload,
    jti,
    iat: Date.now(),
    exp: Date.now() + ttlMs,
  };
  const bodyB64 = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sigB64 = crypto.createHmac('sha256', secret).update(bodyB64).digest('base64url');
  return `${bodyB64}.${sigB64}`;
}

describe('KTN Production Scale v3.3.0 Hardening Suite', () => {
  let harness: any;
  let adminToken: string;
  let linhTeacherToken: string;
  let studentToken: string;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    harness = createLocalWorkerHarness();
    adminToken = await signTestSessionToken({
      id: 'ADMIN-V33',
      email: 'quanly@khongtunhi.com',
      name: 'Quản Lý KTN',
      role: 'admin',
      roles: ['admin'],
    });
    linhTeacherToken = await signTestSessionToken({
      id: 'GV-LINH-V33',
      email: 'linh.lam@khongtunhi.com',
      name: 'Cô Lâm Mỹ Linh',
      role: 'teacher',
      roles: ['teacher'],
    });
    studentToken = await signTestSessionToken({
      id: 'HS-0001-V33',
      email: 'e2e.hs.0001@khongtunhi.com',
      name: 'Học viên thử nghiệm 0001',
      role: 'student',
      roles: ['student'],
    });
  });

  it('1. RootErrorBoundary / RouteErrorBoundary catch crashes & tryAutoReloadOnChunkError enforces 1-shot 30s cooldown', () => {
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Crasher: React.FC = () => {
      throw new Error('Loading chunk 404 failed dynamically');
    };

    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Regular validation error'))).toBe(false);

    const reloadSpy = vi.fn();
    expect(tryAutoReloadOnChunkError('ktn_test_chunk_reload', reloadSpy)).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(tryAutoReloadOnChunkError('ktn_test_chunk_reload', reloadSpy)).toBe(false);
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    const onResetSpy = vi.fn();
    const { rerender } = render(
      <RouteErrorBoundary onReset={onResetSpy}>
        <Crasher />
      </RouteErrorBoundary>
    );
    expect(screen.getByTestId('ktn-route-error-fallback')).toBeInTheDocument();

    rerender(
      <RootErrorBoundary>
        <Crasher />
      </RootErrorBoundary>
    );
    expect(screen.getByTestId('ktn-root-error-fallback')).toBeInTheDocument();
    consoleErrSpy.mockRestore();
  });

  it('2. Worker Edge request.cf schedules async push via ctx.waitUntil unless X-KTN-Await-Push: 1 is set', async () => {
    const waitUntilPromises: Promise<unknown>[] = [];
    const edgeCtx = {
      waitUntil: (p: Promise<unknown>) => waitUntilPromises.push(p),
      passThroughOnException: () => {},
    };

    const edgeReq = new Request('https://khongtunhi.com/api/ktn/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roomId: 'class:YCT3-02',
        classCode: 'YCT3-02',
        content: 'Edge async push check',
        clientMessageId: 'v33-edge-async-1',
      }),
    });
    Object.defineProperty(edgeReq, 'cf', { value: { colo: 'SIN' }, configurable: true });

    const edgeRes = await harness.workerModule.fetch(edgeReq, harness.env, edgeCtx);
    expect(edgeRes.status).toBe(200);
    const edgeData = await edgeRes.json();
    expect(edgeData.ok).toBe(true);
    expect(edgeData.pushDispatch?.queued).toBe(true);
    expect(edgeData.pushDispatch?.async).toBe(true);
    expect(waitUntilPromises.length).toBeGreaterThan(0);
    await Promise.allSettled(waitUntilPromises);

    const syncReq = new Request('https://khongtunhi.com/api/ktn/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-KTN-Await-Push': '1',
      },
      body: JSON.stringify({
        roomId: 'class:YCT3-02',
        classCode: 'YCT3-02',
        content: 'Edge forced sync push check',
        clientMessageId: 'v33-edge-sync-2',
      }),
    });
    Object.defineProperty(syncReq, 'cf', { value: { colo: 'SIN' }, configurable: true });

    const syncRes = await harness.workerModule.fetch(syncReq, harness.env, edgeCtx);
    expect(syncRes.status).toBe(200);
    const syncData = await syncRes.json();
    expect(syncData.ok).toBe(true);
    expect(syncData.pushDispatch?.async).not.toBe(true);
  });

  it('3. Multi-class enrolledClasses persists in aliases and receives YCT3-02 notifications/messages', async () => {
    const assignReq = new Request('http://localhost/api/ktn/students/courses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'assign_class',
        email: 'e2e.hs.0001@khongtunhi.com',
        classCode: 'YCT2-04',
        enrolledClasses: ['YCT2-04', 'YCT3-02'],
      }),
    });
    const assignRes = await harness.workerModule.fetch(assignReq, harness.env);
    expect(assignRes.status).toBe(200);
    const assignData = await assignRes.json();
    expect(assignData.ok).toBe(true);
    expect(assignData.student?.class_code).toBe('YCT2-04');
    expect(assignData.student?.enrolledClasses).toEqual(
      expect.arrayContaining(['YCT2-04', 'YCT3-02'])
    );
    expect(assignData.student?.aliases).toEqual(
      expect.arrayContaining(['__class:YCT2-04', '__class:YCT3-02'])
    );

    // Posting to secondary class YCT3-02 must notify the multi-enrolled student
    const msgReq = new Request('http://localhost/api/ktn/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${linhTeacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roomId: 'class:YCT3-02',
        classCode: 'YCT3-02',
        content: 'Nhắc lịch học YCT3-02 cho học viên nhiều lớp',
        clientMessageId: 'v33-multiclass-msg-1',
      }),
    });
    const msgRes = await harness.workerModule.fetch(msgReq, harness.env);
    expect(msgRes.status).toBe(200);

    // Student must see both YCT2-04 & YCT3-02 rooms and read YCT3-02 messages
    const roomsReq = new Request('http://localhost/api/ktn/messages/rooms', {
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const roomsRes = await harness.workerModule.fetch(roomsReq, harness.env);
    expect(roomsRes.status).toBe(200);
    const roomsData = await roomsRes.json();
    const groupRoomIds = (roomsData.groupRooms || []).map((r: any) => String(r.roomId || ''));
    expect(groupRoomIds).toEqual(expect.arrayContaining(['class:YCT2-04', 'class:YCT3-02']));

    const readMsgReq = new Request('http://localhost/api/ktn/messages?roomId=class%3AYCT3-02', {
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const readMsgRes = await harness.workerModule.fetch(readMsgReq, harness.env);
    expect(readMsgRes.status).toBe(200);
    const readMsgData = await readMsgRes.json();
    expect(
      (readMsgData.messages || []).some((m: any) =>
        String(m.content || '').includes('Nhắc lịch học YCT3-02')
      )
    ).toBe(true);

    const notifReq = new Request('http://localhost/api/ktn/notifications', {
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const notifRes = await harness.workerModule.fetch(notifReq, harness.env);
    expect(notifRes.status).toBe(200);
    const notifData = await notifRes.json();
    const yct3Notif = (notifData.notifications || []).find(
      (n: any) => n.classCode === 'YCT3-02' || n.roomId === 'class:YCT3-02'
    );
    expect(yct3Notif).toBeDefined();
  });

  it('4. ClassScheduleModal renders per-weekday scheduleSlots and serializes them into schedulePayload', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ClassScheduleModal
        open={true}
        mode="edit_schedule"
        role="admin"
        classItem={{
          id: 'YCT2-04',
          name: 'Lớp YCT2-04',
          teacher_code: 'GV-KTN-08',
          teacher_name: 'Cô Lâm Mỹ Linh',
          teacher_email: 'linh.lam@khongtunhi.com',
          schedule: '19:30 Thứ 3 & Thứ 6',
          total_lessons: 25,
          current_lesson: 1,
          active: true,
          scheduleConfig: {
            classCode: 'YCT2-04',
            daysOfWeek: [2, 5],
            startTime: '19:30',
            endTime: '20:30',
            timezone: 'Asia/Ho_Chi_Minh',
            effectiveFrom: '2026-11-01',
            effectiveUntil: null,
            mode: 'weekly',
            scheduleMode: 'weekly',
            customSessions: [],
            exceptions: [],
            meetingUrl: '',
            status: 'confirmed',
          },
        }}
        teachers={[
          {
            code: 'GV-KTN-08',
            name: 'Cô Lâm Mỹ Linh',
            email: 'linh.lam@khongtunhi.com',
            active: true,
            assigned_classes: ['YCT2-04'],
          },
        ]}
        onClose={vi.fn()}
        onSaveClassAndSchedule={onSave}
      />
    );

    const tuesdayStart = screen.getByTestId('schedule-slot-start-2') as HTMLInputElement;
    const tuesdayEnd = screen.getByTestId('schedule-slot-end-2') as HTMLInputElement;
    fireEvent.change(tuesdayStart, { target: { value: '18:00' } });
    fireEvent.change(tuesdayEnd, { target: { value: '19:15' } });

    fireEvent.click(screen.getByTestId('save-class-schedule-btn'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const submitted = onSave.mock.calls[0][0];
    expect(submitted.schedulePayload.scheduleSlots).toEqual({
      '2': { startTime: '18:00', endTime: '19:15' },
    });
  });

  it('5. chatApi.getMessages forwards incremental ?after= cursor on delta polling', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          roomId: 'class:YCT2-04',
          messages: [
            {
              id: 'MSG-DELTA-9',
              room_id: 'class:YCT2-04',
              sender_email: 'linh.lam@khongtunhi.com',
              sender_name: 'Cô Lâm Mỹ Linh',
              sender_role: 'teacher',
              content: 'Tin nhắn mới sau mốc delta',
              created_at: '2026-11-18T01:05:00.000Z',
            },
          ],
          pagination: { hasMore: false, nextCursor: null, limit: 50, totalAvailable: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await chatApi.getMessages('class:YCT2-04', {
      limit: 50,
      after: '2026-11-18T01:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('roomId=class%3AYCT2-04');
    expect(calledUrl).toContain('after=2026-11-18T01%3A00%3A00.000Z');
    expect(res.messages).toHaveLength(1);
    expect(res.messages[0].id).toBe('MSG-DELTA-9');
  });

  it('6. /api/ktn/learning-progress GET and POST persist completed lessons across devices', async () => {
    const postReq = new Request('http://localhost/api/ktn/learning-progress', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        courseId: '6adadba969897b0002482ca5',
        lessonNum: 3,
        lessonKey: '6adadba969897b0002482ca5-L3',
      }),
    });
    const postRes = await harness.workerModule.fetch(postReq, harness.env);
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.ok).toBe(true);
    expect(postData.completedLessons).toContain('6adadba969897b0002482ca5-L3');

    const getReq = new Request('http://localhost/api/ktn/learning-progress', {
      method: 'GET',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const getRes = await harness.workerModule.fetch(getReq, harness.env);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.ok).toBe(true);
    expect(getData.completedLessons).toContain('6adadba969897b0002482ca5-L3');
  });

  it('7. /api/ktn/push/send enforces 403 RBAC for student and unauthorized cross-class teacher calls', async () => {
    const pushEnv = {
      ...harness.env,
      VAPID_PRIVATE_KEY: 'test-vapid-private-key-v33',
    };

    const studentPushReq = new Request('http://localhost/api/ktn/push/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetEmail: 'linh.lam@khongtunhi.com',
        title: 'Unauthorized student push',
      }),
    });
    const studentPushRes = await harness.workerModule.fetch(studentPushReq, pushEnv);
    expect(studentPushRes.status).toBe(403);
    const studentPushData = await studentPushRes.json();
    expect(studentPushData.error).toBe('FORBIDDEN_TARGET_EMAIL');

    // e2e.hs.0001 belongs to YCT1-01, NOT taught by linh.lam (YCT2-04 / YCT3-02)
    const teacherCrossClassReq = new Request('http://localhost/api/ktn/push/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${linhTeacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetEmail: 'e2e.hs.0001@khongtunhi.com',
        title: 'Cross-class teacher push',
      }),
    });
    const teacherCrossRes = await harness.workerModule.fetch(teacherCrossClassReq, pushEnv);
    expect(teacherCrossRes.status).toBe(403);
    const teacherCrossData = await teacherCrossRes.json();
    expect(teacherCrossData.error).toBe('TEACHER_NOT_ASSIGNED_TO_STUDENT');
  });
});
