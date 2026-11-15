import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TeacherWorkspace } from '@/features/teacher/components/TeacherWorkspace';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';

function renderTeacherWorkspace(route = '/teacher?tab=sessions&class=YCT2-04') {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <TeacherWorkspace />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TeacherWorkspace Edit Notification Opt-in & Attachment Retry Cap Guards', () => {
  beforeEach(() => {
    useUiStore.setState({ isDemoMode: false, lang: 'vi' });
    useAuthStore.setState({
      user: {
        id: 'GV001',
        code: 'GV001',
        name: 'Cô Dương',
        email: 'gv001@khongtunhi.com',
        role: 'teacher',
        roles: ['teacher'],
        assignedClasses: ['YCT2-04'],
        classCode: 'YCT2-04',
        hasLiveClass: true,
        onlineCourses: [],
        hasOnlineCourses: false,
      },
    });
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
      {
        id: 'YCT2-04',
        class_code: 'YCT2-04',
        name: 'Lớp YCT2-04',
        title: 'Lớp YCT2-04',
        teacher_email: 'gv001@khongtunhi.com',
        teacher_code: 'GV001',
        teacher_name: 'Cô Dương',
        active: true,
      } as any,
    ]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getAttendance').mockResolvedValue({ students: [], date: '2026-11-16' } as any);
    vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({ ok: true, requests: [], pendingCount: 0 });
    vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([
      {
        id: 'YCT2-04::1',
        classCode: 'YCT2-04',
        session_num: 1,
        sessionNum: 1,
        session_title: 'Buổi 1: Giao tiếp',
        title: 'Buổi 1: Giao tiếp',
        updatedAt: '2026-11-10T08:00:00.000Z',
        exercises: [
          {
            id: 'EX-PUB-1',
            num: 1,
            title: 'Bài đọc 1',
            prompt: 'Đọc mẫu câu',
            type: 'mixed',
            status: 'published',
            attachments: [],
          },
        ],
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps update notification disabled by default when editing a published exercise and honors opt-in forceNotify', async () => {
    const saveSpy = vi.spyOn(ktnApi, 'saveClassSession').mockImplementation(async (payload: any) => ({
      id: 'YCT2-04::1',
      classCode: 'YCT2-04',
      session_num: 1,
      sessionNum: 1,
      session_title: payload.title,
      title: payload.title,
      exercises: payload.exercises,
    }));

    renderTeacherWorkspace();

    const editBtn = await screen.findByTestId('teacher-edit-saved-exercise-btn-EX-PUB-1');
    fireEvent.click(editBtn);

    const optInCheckbox = (await screen.findByTestId(
      'teacher-notify-on-update-checkbox'
    )) as HTMLInputElement;
    expect(optInCheckbox.checked).toBe(false);

    // 1. Default save without checking opt-in suppresses duplicate notifications
    fireEvent.click(screen.getByTestId('teacher-save-session-btn'));
    const confirmBtn1 = await screen.findByTestId('teacher-confirm-overwrite-btn');
    fireEvent.click(confirmBtn1);

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
    expect(saveSpy.mock.calls[0][0].suppressDuplicateNotification).toBe(true);
    expect(saveSpy.mock.calls[0][0].forceNotify).toBeUndefined();

    // Wait for checkbox reset after save, then opt in explicitly
    await waitFor(() => {
      expect((screen.getByTestId('teacher-notify-on-update-checkbox') as HTMLInputElement).checked).toBe(false);
    });
    fireEvent.click(screen.getByTestId('teacher-notify-on-update-checkbox'));
    expect((screen.getByTestId('teacher-notify-on-update-checkbox') as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByTestId('teacher-save-session-btn'));
    const confirmBtn2 = await screen.findByTestId('teacher-confirm-overwrite-btn');
    fireEvent.click(confirmBtn2);

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(2);
    });
    expect(saveSpy.mock.calls[1][0].suppressDuplicateNotification).toBe(false);
    expect(saveSpy.mock.calls[1][0].forceNotify).toBe(true);
  });

  it('blocks retrying a failed attachment when 5 other valid attachments already occupy all slots', async () => {
    let callIdx = 0;
    const uploadSpy = vi.spyOn(ktnApi, 'uploadHomeworkAttachment').mockImplementation(async ({ fileName }) => {
      callIdx += 1;
      if (callIdx === 1) {
        throw new Error('Network timeout');
      }
      return {
        id: `ATT-OK-${callIdx}`,
        name: fileName,
        url: `https://cdn.example.com/${fileName}`,
        mimeType: 'application/pdf',
        size: 1024,
        kind: 'pdf',
      } as any;
    });

    renderTeacherWorkspace();
    // Wait for assigned class & saved sessions query to resolve so DB class authority is loaded
    await screen.findByTestId('teacher-edit-saved-exercise-btn-EX-PUB-1');
    const fileInput = (await screen.findByTestId('teacher-exercise-file-input')) as HTMLInputElement;

    // 1st file fails upload (remains visible with error & Retry button)
    const f0 = new File(['bad'], 'fail-first.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [f0] } });

    const retryBtns = await screen.findAllByTestId(/teacher-retry-attachment-/);
    expect(retryBtns.length).toBe(1);

    // Upload 5 valid attachments while failed item is still in the list (5/5 valid slots occupied)
    const validFiles = [1, 2, 3, 4, 5].map(
      (i) => new File([`ok-${i}`], `valid-${i}.pdf`, { type: 'application/pdf' })
    );
    fireEvent.change(fileInput, { target: { files: validFiles } });

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledTimes(6);
      expect(screen.getAllByTestId(/teacher-exercise-attachment-item-/).length).toBe(6);
    });

    // Attempting to retry the failed item would exceed MAX_EXERCISE_ATTACHMENTS (5 valid files)
    fireEvent.click(screen.getAllByTestId(/teacher-retry-attachment-/)[0]);

    const errBanner = await screen.findByTestId('teacher-attachment-error');
    expect(errBanner.textContent).toContain('5');
    expect(uploadSpy).toHaveBeenCalledTimes(6);
    expect(uploadSpy).toHaveBeenCalledTimes(6);
  });
});
