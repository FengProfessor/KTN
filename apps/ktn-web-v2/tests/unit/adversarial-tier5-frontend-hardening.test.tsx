import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SearchableTeacherCombobox } from '../../src/features/classrooms/components/SearchableTeacherCombobox';
import { ClassScheduleModal } from '../../src/features/classrooms/components/ClassScheduleModal';
import { AdminWorkspace } from '../../src/features/admin/components/AdminWorkspace';
import { TeacherDetailDrawer } from '../../src/features/admin/components/TeacherDetailDrawer';
import { ktnApi, KtnApiError } from '../../src/services/api/ktnApiClient';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useUiStore } from '../../src/stores/useUiStore';
import type { KtnTeacherRecord, KtnClassItem } from '../../src/types/ktn.types';
import { normalizeVietnameseText } from '../../src/lib/utils';

// =============================================================================
// TEST DATA FIXTURES
// =============================================================================

const MOCK_TEACHER_LAM: KtnTeacherRecord = {
  code: 'GV-KTN-08',
  name: 'Cô Lâm Mỹ Linh',
  email: 'linh.lam@khongtunhi.com',
  phone: '0901234567',
  specialty: 'YCT & Thiếu nhi',
  assigned_classes: ['HSK1-01', 'YCT2-04'],
  assigned_courses: ['HSK1-30'],
  active: true,
  status: 'active',
};

const MOCK_TEACHER_AN: KtnTeacherRecord = {
  code: 'GV-KTN-01',
  name: 'Thầy Nguyễn Văn An',
  email: 'an.nguyen@khongtunhi.com',
  phone: '0902345678',
  specialty: 'HSK Chuẩn',
  assigned_classes: [],
  assigned_courses: [],
  active: true,
  status: 'active',
};

const MOCK_TEACHER_TRANG: KtnTeacherRecord = {
  code: 'GV-KTN-02',
  name: 'Cô Đỗ Thùy Trang',
  email: 'trang.do@khongtunhi.com',
  phone: '0903456789',
  specialty: 'Giao tiếp phản xạ',
  assigned_classes: ['GT-01'],
  assigned_courses: [],
  active: true,
  status: 'active',
};

const MOCK_TEACHER_DUONG: KtnTeacherRecord = {
  code: 'GV-KTN-03',
  name: 'Thầy Dương Quốc Bảo',
  email: 'bao.duong@khongtunhi.com',
  phone: '0904567890',
  specialty: 'Khẩu ngữ',
  assigned_classes: [],
  assigned_courses: [],
  active: true,
  status: 'active',
};

const ALL_MOCK_TEACHERS: KtnTeacherRecord[] = [
  MOCK_TEACHER_LAM,
  MOCK_TEACHER_AN,
  MOCK_TEACHER_TRANG,
  MOCK_TEACHER_DUONG,
];

describe('Tier 5 Adversarial Coverage Hardening: KTN Frontend UI & Components', () => {
  let queryClient: QueryClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    useAuthStore.setState({
      user: {
        id: 'admin-01',
        email: 'quanly@khongtunhi.com',
        name: 'Quản lý KTN',
        role: 'admin',
        roles: ['admin'],
        classCode: null,
        hasLiveClass: false,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });

    useUiStore.setState({ isDemoMode: false });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // SUITE 1: SearchableTeacherCombobox — Rapid Typing & Query Thrashing
  // ===========================================================================
  describe('Suite 1: SearchableTeacherCombobox — Rapid Typing Thrashing & State Reset', () => {
    it('1.1. rapid keystroke sequence with immediate Backspace thrashing stabilizes state without corrupted index', () => {
      const handleChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={handleChange}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');

      // Rapidly type characters
      fireEvent.change(input, { target: { value: 'c' } });
      fireEvent.change(input, { target: { value: 'co' } });
      fireEvent.change(input, { target: { value: 'co l' } });
      fireEvent.change(input, { target: { value: 'co lam' } });

      let options = screen.getAllByRole('option');
      // Should match Cô Lâm Mỹ Linh (plus unassigned if query doesn't exclude, but 'co lam' excludes unassigned)
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Cô Lâm Mỹ Linh');

      // Rapid backspace thrashing down to empty string
      fireEvent.change(input, { target: { value: 'co l' } });
      fireEvent.change(input, { target: { value: 'co' } });
      fireEvent.change(input, { target: { value: 'c' } });
      fireEvent.change(input, { target: { value: '' } });

      // All options restored (1 unassigned + 4 teachers = 5)
      options = screen.getAllByRole('option');
      expect(options).toHaveLength(5);
      expect(options[0]).toHaveTextContent('Chưa phân công giáo viên');

      // Rapidly type another name
      fireEvent.change(input, { target: { value: 'trang' } });
      options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Cô Đỗ Thùy Trang');

      // No change callback fired during mere typing
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('1.2. clear button (schedule-teacher-combobox-clear) empties query, resets index, and focuses input', () => {
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.change(input, { target: { value: 'nguyen van an' } });

      // Clear button appears
      const clearBtn = screen.getByTestId('schedule-teacher-combobox-clear');
      expect(clearBtn).toBeInTheDocument();

      fireEvent.click(clearBtn);

      // Input retains focus and query is cleared
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(5);
      expect(input).toHaveFocus();
    });

    it('1.3. rapid toggling of dropdown via toggle button preserves existing selection', () => {
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const toggleBtn = screen.getByTestId('schedule-teacher-combobox-toggle');
      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;

      // Closed initially
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
      expect(input.value).toBe('Cô Lâm Mỹ Linh');

      // Click to open
      fireEvent.click(toggleBtn);
      expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();

      // Click to close
      fireEvent.click(toggleBtn);
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
      expect(input.value).toBe('Cô Lâm Mỹ Linh');

      // Click to open again
      fireEvent.click(toggleBtn);
      expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();
    });

    it('1.4. query matching 0 teachers displays empty state message and Enter does not corrupt selection', () => {
      const handleChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={handleChange}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.change(input, { target: { value: 'xyz123khongtontai' } });

      const emptyState = screen.getByTestId('schedule-teacher-empty-state');
      expect(emptyState).toBeInTheDocument();
      expect(emptyState).toHaveTextContent('Không tìm thấy giáo viên phù hợp với “xyz123khongtontai”');

      // Press Enter while 0 options match
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      expect(handleChange).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // SUITE 2: SearchableTeacherCombobox — Diacritic Normalization Edge Cases
  // ===========================================================================
  describe('Suite 2: SearchableTeacherCombobox — Diacritic Normalization & Out-of-Order Permutations', () => {
    it('2.1. combined diacritics with d/đ and accents: Đỗ Thùy Trang matches do, đo, ĐỖ, and do thuy trang', () => {
      const testQueries = ['do', 'đo', 'ĐỖ', 'DO THUY TRANG', 'đỗ thùy', 'thuy trang'];

      for (const query of testQueries) {
        const { unmount } = render(
          <SearchableTeacherCombobox
            value=""
            onChange={vi.fn()}
            teachers={ALL_MOCK_TEACHERS}
          />
        );

        const input = screen.getByTestId('schedule-teacher-combobox-input');
        fireEvent.change(input, { target: { value: query } });

        const options = screen.getAllByRole('option');
        const hasTrang = options.some((opt) => opt.textContent?.includes('Cô Đỗ Thùy Trang'));
        expect(hasTrang).toBe(true);

        unmount();
      }
    });

    it('2.2. uppercase and lowercase accents: CÔ LÂM MỸ LINH matches my linh, MY LINH, and cô lâm', () => {
      const testQueries = ['my linh', 'MY LINH', 'mỹ linh', 'CÔ LÂM', 'linh.lam', 'gv-ktn-08'];

      for (const query of testQueries) {
        const { unmount } = render(
          <SearchableTeacherCombobox
            value=""
            onChange={vi.fn()}
            teachers={ALL_MOCK_TEACHERS}
          />
        );

        const input = screen.getByTestId('schedule-teacher-combobox-input');
        fireEvent.change(input, { target: { value: query } });

        const options = screen.getAllByRole('option');
        const hasLinh = options.some((opt) => opt.textContent?.includes('Cô Lâm Mỹ Linh'));
        expect(hasLinh).toBe(true);

        unmount();
      }
    });

    it('2.3. decomposed Unicode (NFD) query matches precomposed NFC teacher names identically', () => {
      // 'ố' in NFC is '\u1ED1', in NFD is 'o\u0302\u0301'
      const nfdQuery = 'Đo\u0302\u0301 Thu\u0300y Trang'; // NFD for Đỗ Thùy Trang
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.change(input, { target: { value: nfdQuery } });

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Cô Đỗ Thùy Trang');
    });

    it('2.4. token permutation: out-of-order words (Linh Lâm, An Nguyễn) match multi-word names', () => {
      const { unmount: unmount1 } = render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      let input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.change(input, { target: { value: 'Linh Lâm' } });
      let options = screen.getAllByRole('option');
      expect(options.some((opt) => opt.textContent?.includes('Cô Lâm Mỹ Linh'))).toBe(true);
      unmount1();

      const { unmount: unmount2 } = render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );
      input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.change(input, { target: { value: 'An Nguyễn' } });
      options = screen.getAllByRole('option');
      expect(options.some((opt) => opt.textContent?.includes('Thầy Nguyễn Văn An'))).toBe(true);
      unmount2();
    });

    it('2.5. compact alphanumeric queries without hyphens or dots match teacher codes and emails', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      // "gvktn08" without dashes
      fireEvent.change(input, { target: { value: 'gvktn08' } });

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Cô Lâm Mỹ Linh');
      expect(options[0]).toHaveTextContent('GV-KTN-08');
    });

    it('2.6. search keywords for unassigned option: chua phan cong, chưa, trống all filter unassigned option', () => {
      const unassignedKeywords = ['chưa', 'chua phan cong', 'trống', 'trong'];

      for (const kw of unassignedKeywords) {
        const { unmount } = render(
          <SearchableTeacherCombobox
            value=""
            onChange={vi.fn()}
            teachers={ALL_MOCK_TEACHERS}
          />
        );

        const input = screen.getByTestId('schedule-teacher-combobox-input');
        fireEvent.change(input, { target: { value: kw } });

        const unassignedOpt = screen.getByTestId('schedule-teacher-option-unassigned');
        expect(unassignedOpt).toBeInTheDocument();
        expect(unassignedOpt).toHaveTextContent('Chưa phân công giáo viên');

        unmount();
      }
    });
  });

  // ===========================================================================
  // SUITE 3: SearchableTeacherCombobox — Keyboard Interactions & Form Submission Suppression
  // ===========================================================================
  describe('Suite 3: SearchableTeacherCombobox — Keyboard Interactions & Form Suppression Invariant', () => {
    it('3.1. Enter key inside <form> suppresses form submission (calls preventDefault) and selects option', () => {
      const handleSubmit = vi.fn((e) => e.preventDefault());
      const handleChange = vi.fn();

      render(
        <form onSubmit={handleSubmit} data-testid="test-form">
          <SearchableTeacherCombobox
            value=""
            onChange={handleChange}
            teachers={ALL_MOCK_TEACHERS}
          />
        </form>
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');

      // Open dropdown via ArrowDown
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      // ArrowDown to highlight index 1 (Cô Lâm Mỹ Linh)
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });

      // Press Enter
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // Invariant: Form must NOT be submitted!
      expect(handleSubmit).not.toHaveBeenCalled();
      // Selection must be made
      expect(handleChange).toHaveBeenCalledWith('linh.lam@khongtunhi.com');
    });

    it('3.2. Enter key inside <form> suppresses form submission even when combobox dropdown is CLOSED', () => {
      const handleSubmit = vi.fn((e) => e.preventDefault());

      render(
        <form onSubmit={handleSubmit} data-testid="test-form-closed">
          <SearchableTeacherCombobox
            value="linh.lam@khongtunhi.com"
            onChange={vi.fn()}
            teachers={ALL_MOCK_TEACHERS}
          />
        </form>
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');

      // Dropdown is closed
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();

      // Press Enter
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // Invariant: Form must NOT be submitted!
      expect(handleSubmit).not.toHaveBeenCalled();
    });

    it('3.3. ArrowDown and ArrowUp cycle through options and wrap cleanly at boundaries', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');

      // ArrowDown opens at index 0 (unassigned)
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      let options = screen.getAllByRole('option');
      expect(options[0]).toHaveClass('bg-amber-50');

      // ArrowUp wraps around to index 4 (last option: Thầy Dương Quốc Bảo)
      fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
      options = screen.getAllByRole('option');
      expect(options[4]).toHaveClass('bg-sky-50');

      // ArrowDown from index 4 wraps back to index 0 (unassigned)
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      options = screen.getAllByRole('option');
      expect(options[0]).toHaveClass('bg-amber-50');
    });

    it('3.4. Escape key closes popover, resets uncommitted search text, and preserves selection', () => {
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;

      // Type some uncommitted text
      fireEvent.change(input, { target: { value: 'Thầy An' } });
      expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

      // Dropdown closed
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
      // Input display value reverted to selected teacher
      expect(input.value).toBe('Cô Lâm Mỹ Linh');
    });

    it('3.5. Tab key closes popover without changing selected teacher', () => {
      const handleChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={handleChange}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;

      // Open and type
      fireEvent.change(input, { target: { value: 'nguyen van an' } });
      expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();

      // Press Tab
      fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });

      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
      expect(handleChange).not.toHaveBeenCalled();
      expect(input.value).toBe('Cô Lâm Mỹ Linh');
    });

    it('3.6. Home, End, PageUp, PageDown do not throw errors or corrupt combobox state', () => {
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;

      expect(() => {
        fireEvent.keyDown(input, { key: 'Home', code: 'Home' });
        fireEvent.keyDown(input, { key: 'End', code: 'End' });
        fireEvent.keyDown(input, { key: 'PageUp', code: 'PageUp' });
        fireEvent.keyDown(input, { key: 'PageDown', code: 'PageDown' });
      }).not.toThrow();

      expect(input.value).toBe('Cô Lâm Mỹ Linh');
    });
  });

  // ===========================================================================
  // SUITE 4: Touch Gestures, Mobile Viewport (390px) & Focus/Blur
  // ===========================================================================
  describe('Suite 4: SearchableTeacherCombobox — Mobile Touch & Click-Outside Handling', () => {
    it('4.1. mobile touch outside (touchstart on document.body) closes popover and reverts query text', () => {
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;

      // User types query on mobile
      fireEvent.change(input, { target: { value: 'nguyen' } });
      expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();

      // User taps outside on mobile (touchstart on body)
      fireEvent.touchStart(document.body);

      // Dropdown closes, uncommitted text reverts
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
      expect(input.value).toBe('Cô Lâm Mỹ Linh');
    });

    it('4.2. mobile touch inside popover does NOT close popover before option click completes', () => {
      const handleChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={handleChange}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.click(input);

      const anOption = screen.getByTestId('schedule-teacher-option-an.nguyen@khongtunhi.com');

      // Touchstart on option inside dropdown
      fireEvent.touchStart(anOption);
      // Dropdown must remain open
      expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();

      // Click option
      fireEvent.click(anOption);
      expect(handleChange).toHaveBeenCalledWith('an.nguyen@khongtunhi.com');
    });

    it('4.3. disabled combobox rejects clicks, touches, and keyboard navigation', () => {
      const handleChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={handleChange}
          teachers={ALL_MOCK_TEACHERS}
          disabled={true}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      const toggleBtn = screen.getByTestId('schedule-teacher-combobox-toggle');

      fireEvent.click(input);
      fireEvent.click(toggleBtn);
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });

      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
      expect(handleChange).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // SUITE 5: Selection of Unassigned vs Null vs Empty & External Value Sync
  // ===========================================================================
  describe('Suite 5: Selection of Unassigned vs Null vs Empty & External Prop Sync', () => {
    it('5.1. initial value="" correctly highlights unassigned option and syncs hidden select', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      // Hidden select must have value=""
      const select = screen.getByTestId('schedule-teacher-select') as HTMLSelectElement;
      expect(select.value).toBe('');

      // Open combobox
      const toggleBtn = screen.getByTestId('schedule-teacher-combobox-toggle');
      fireEvent.click(toggleBtn);

      const unassignedOpt = screen.getByTestId('schedule-teacher-option-unassigned');
      expect(unassignedOpt).toHaveAttribute('aria-selected', 'true');
    });

    it('5.2. initial value=null or value=undefined handles safely without TypeError', () => {
      const { unmount: unmount1 } = render(
        <SearchableTeacherCombobox
          value={null as unknown as string}
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );
      expect(screen.getByTestId('schedule-teacher-combobox-input')).toBeInTheDocument();
      unmount1();

      const { unmount: unmount2 } = render(
        <SearchableTeacherCombobox
          value={undefined as unknown as string}
          onChange={vi.fn()}
          teachers={ALL_MOCK_TEACHERS}
        />
      );
      expect(screen.getByTestId('schedule-teacher-combobox-input')).toBeInTheDocument();
      unmount2();
    });

    it('5.3. selecting "Chưa phân công giáo viên" passes empty string "" to onChange', () => {
      const handleChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={handleChange}
          teachers={ALL_MOCK_TEACHERS}
        />
      );

      const toggleBtn = screen.getByTestId('schedule-teacher-combobox-toggle');
      fireEvent.click(toggleBtn);

      const unassignedOpt = screen.getByTestId('schedule-teacher-option-unassigned');
      fireEvent.click(unassignedOpt);

      expect(handleChange).toHaveBeenCalledWith('');
    });

    it('5.4. synchronizing value when parent props change externally (modal reopen or teacher switch)', () => {
      const Harness: React.FC = () => {
        const [teacherEmail, setTeacherEmail] = useState('linh.lam@khongtunhi.com');
        return (
          <div>
            <button
              data-testid="switch-to-an-btn"
              onClick={() => setTeacherEmail('an.nguyen@khongtunhi.com')}
            >
              Switch to An
            </button>
            <button
              data-testid="switch-to-unassigned-btn"
              onClick={() => setTeacherEmail('')}
            >
              Switch to Unassigned
            </button>
            <button
              data-testid="switch-to-unknown-btn"
              onClick={() => setTeacherEmail('ghost@ktn.com')}
            >
              Switch to Unknown
            </button>
            <SearchableTeacherCombobox
              value={teacherEmail}
              onChange={setTeacherEmail}
              teachers={ALL_MOCK_TEACHERS}
            />
          </div>
        );
      };

      render(<Harness />);

      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;
      expect(input.value).toBe('Cô Lâm Mỹ Linh');

      // Switch to An
      fireEvent.click(screen.getByTestId('switch-to-an-btn'));
      expect(input.value).toBe('Thầy Nguyễn Văn An');

      // Switch to Unassigned
      fireEvent.click(screen.getByTestId('switch-to-unassigned-btn'));
      expect(input.value).toBe('');
      expect(input.placeholder).toBe('Chọn giáo viên phụ trách...');

      // Switch to non-existent teacher
      fireEvent.click(screen.getByTestId('switch-to-unknown-btn'));
      expect(input.value).toBe('');
    });

    it('5.5. ClassScheduleModal synchronizes combobox teacher when classItem changes between classes', () => {
      const classWithLinh: KtnClassItem = {
        id: 'CLASS-01',
        name: 'Lớp HSK 1 Cơ Bản',
        teacher_code: 'GV-KTN-08',
        teacher_name: 'Cô Lâm Mỹ Linh',
        teacher_email: 'linh.lam@khongtunhi.com',
        total_lessons: 25,
        current_lesson: 5,
        schedule: 'Thứ 3, 5',
        active: true,
      };

      const classWithAn: KtnClassItem = {
        id: 'CLASS-02',
        name: 'Lớp HSK 2 Nâng Cao',
        teacher_code: 'GV-KTN-01',
        teacher_name: 'Thầy Nguyễn Văn An',
        teacher_email: 'an.nguyen@khongtunhi.com',
        total_lessons: 25,
        current_lesson: 1,
        schedule: 'Thứ 2, 4',
        active: true,
      };

      const classUnassigned: KtnClassItem = {
        id: 'CLASS-03',
        name: 'Lớp HSK 3 Mới',
        teacher_code: '',
        teacher_name: '',
        teacher_email: '',
        total_lessons: 25,
        current_lesson: 0,
        schedule: 'Thứ 7',
        active: true,
      };

      const ModalHarness: React.FC = () => {
        const [currentClass, setCurrentClass] = useState<KtnClassItem>(classWithLinh);
        return (
          <div>
            <button
              data-testid="select-class-an"
              onClick={() => setCurrentClass(classWithAn)}
            >
              Class An
            </button>
            <button
              data-testid="select-class-unassigned"
              onClick={() => setCurrentClass(classUnassigned)}
            >
              Class Unassigned
            </button>
            <ClassScheduleModal
              open={true}
              mode="edit_schedule"
              role="admin"
              classItem={currentClass}
              teachers={ALL_MOCK_TEACHERS}
              onClose={vi.fn()}
              onSaveClassAndSchedule={vi.fn().mockResolvedValue(undefined)}
            />
          </div>
        );
      };

      render(<ModalHarness />);

      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;
      expect(input.value).toBe('Cô Lâm Mỹ Linh');

      // Switch to class with An
      fireEvent.click(screen.getByTestId('select-class-an'));
      expect(input.value).toBe('Thầy Nguyễn Văn An');

      // Switch to unassigned class
      fireEvent.click(screen.getByTestId('select-class-unassigned'));
      expect(input.value).toBe('');
      expect(input.placeholder).toBe('Chọn giáo viên phụ trách...');
    });

    it('5.6. ClassScheduleModal saves unassigned teacher with teacherEmail: "" and teacherCode: ""', async () => {
      const handleSave = vi.fn().mockResolvedValue(undefined);

      const classWithLinh: KtnClassItem = {
        id: 'CLASS-01',
        name: 'Lớp HSK 1 Cơ Bản',
        teacher_code: 'GV-KTN-08',
        teacher_name: 'Cô Lâm Mỹ Linh',
        teacher_email: 'linh.lam@khongtunhi.com',
        total_lessons: 25,
        current_lesson: 5,
        schedule: 'Thứ 3, 5',
        active: true,
      };

      render(
        <ClassScheduleModal
          open={true}
          mode="edit_schedule"
          role="admin"
          classItem={classWithLinh}
          teachers={ALL_MOCK_TEACHERS}
          onClose={vi.fn()}
          onSaveClassAndSchedule={handleSave}
        />
      );

      // Open teacher combobox
      const toggleBtn = screen.getByTestId('schedule-teacher-combobox-toggle');
      fireEvent.click(toggleBtn);

      // Select "Chưa phân công giáo viên"
      const unassignedOpt = screen.getByTestId('schedule-teacher-option-unassigned');
      fireEvent.click(unassignedOpt);

      // Submit modal
      const saveBtn = screen.getByTestId('save-class-schedule-btn');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(handleSave).toHaveBeenCalledTimes(1);
      });

      const payload = handleSave.mock.calls[0][0];
      expect(payload.teacherEmail).toBe('');
      expect(payload.teacherCode).toBe('');
    });
  });

  // ===========================================================================
  // SUITE 6: Teacher Deletion UI — Rapid Consecutive Clicks & Pending States
  // ===========================================================================
  describe('Suite 6: Teacher Deletion UI — Rapid Clicks & Pending Mutation Invariants', () => {
    const renderAdminWorkspace = (teachers: KtnTeacherRecord[]) => {
      vi.spyOn(ktnApi, 'searchAdminTeachers').mockResolvedValue({
        ok: true,
        items: teachers,
        totalCount: teachers.length,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getOrders').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({
        ok: true,
        requests: [],
        pendingCount: 0,
      });
      vi.spyOn(ktnApi, 'getSyncStatus').mockResolvedValue({
        ok: true,
        checkedAt: new Date().toISOString(),
        summary: { totalStudents: 0, unsyncedStudents: 0, lastSyncSuccess: true },
      } as any);

      return render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/admin/teachers']}>
            <Routes>
              <Route path="/admin" element={<AdminWorkspace />} />
              <Route path="/admin/:section" element={<AdminWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    };

    it('6.1. rapid consecutive clicks on confirm-delete-teacher-btn invoke API exactly once', async () => {
      let resolveDelete: (val: any) => void = () => {};
      const deletePromise = new Promise((resolve) => {
        resolveDelete = resolve;
      });

      const deleteSpy = vi.spyOn(ktnApi, 'deleteTeacher').mockReturnValue(deletePromise as any);

      renderAdminWorkspace([MOCK_TEACHER_LAM]);

      // Find and click delete button on table row
      const deleteRowBtn = await screen.findByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com');
      fireEvent.click(deleteRowBtn);

      const confirmBtn = screen.getByTestId('confirm-delete-teacher-btn');
      expect(confirmBtn).toBeInTheDocument();

      // Click confirm button once
      fireEvent.click(confirmBtn);

      // Button enters pending state
      await waitFor(() => {
        expect(confirmBtn).toBeDisabled();
        expect(confirmBtn).toHaveTextContent('Đang xóa giáo viên...');
      });

      // Rapidly attempt 5 further clicks while pending
      fireEvent.click(confirmBtn);
      fireEvent.click(confirmBtn);
      fireEvent.click(confirmBtn);
      fireEvent.click(confirmBtn);
      fireEvent.click(confirmBtn);

      // ktnApi.deleteTeacher must only be called ONCE
      expect(deleteSpy).toHaveBeenCalledTimes(1);

      // Cancel button must also be disabled during pending
      const cancelBtn = screen.getByTestId('cancel-delete-teacher-btn');
      expect(cancelBtn).toBeDisabled();

      // Resolve API
      resolveDelete({
        ok: true,
        deleted: true,
        teacherId: 'GV-KTN-08',
        unassignedClassesCount: 2,
        unassignedClasses: ['HSK1-01', 'YCT2-04'],
        sessionRevoked: true,
        message: 'Đã xóa thành công',
      });

      // Modal closes after resolution
      await waitFor(() => {
        expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
      });
    });

    it('6.2. single-step modal shows dynamic warning banner for assigned classes and omits for unassigned', async () => {
      renderAdminWorkspace([MOCK_TEACHER_LAM, MOCK_TEACHER_AN]);

      // Teacher Lam has 2 classes -> Warning banner must show
      const deleteLinh = await screen.findByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com');
      fireEvent.click(deleteLinh);

      let modal = screen.getByTestId('admin-delete-teacher-modal');
      expect(modal).toHaveTextContent('Sẽ gỡ phân công khỏi 2 lớp (HSK1-01, YCT2-04)');
      expect(screen.getByTestId('delete-teacher-classes-warning')).toBeInTheDocument();

      // Cancel modal
      fireEvent.click(screen.getByTestId('cancel-delete-teacher-btn'));
      expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();

      // Teacher An has 0 classes -> Warning banner must NOT show
      const deleteAn = await screen.findByTestId('admin-delete-teacher-btn-an.nguyen@khongtunhi.com');
      fireEvent.click(deleteAn);

      modal = screen.getByTestId('admin-delete-teacher-modal');
      expect(modal).toHaveTextContent('Xóa giáo viên Thầy Nguyễn Văn An?');
      expect(screen.queryByTestId('delete-teacher-classes-warning')).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // SUITE 7: Teacher Deletion UI — Network Failure & Optimistic Rollback
  // ===========================================================================
  describe('Suite 7: Teacher Deletion UI — Network Failure & Cache Preservation', () => {
    it('7.1. network failure rejects deletion, keeps teacher in table, shows toast, and leaves dialog open for retry or cancel', async () => {
      vi.spyOn(ktnApi, 'searchAdminTeachers').mockResolvedValue({
        ok: true,
        items: [MOCK_TEACHER_TRANG],
        totalCount: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getOrders').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({
        ok: true,
        requests: [],
        pendingCount: 0,
      });
      vi.spyOn(ktnApi, 'getSyncStatus').mockResolvedValue({
        ok: true,
        checkedAt: new Date().toISOString(),
        summary: { totalStudents: 0, unsyncedStudents: 0, lastSyncSuccess: true },
      } as any);

      // Mock network failure
      vi.spyOn(ktnApi, 'deleteTeacher').mockRejectedValue(
        new Error('Lỗi 500: Máy chủ cơ sở dữ liệu tạm thời không phản hồi.')
      );

      const addToastSpy = vi.spyOn(useUiStore.getState(), 'addToast');

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/admin/teachers']}>
            <Routes>
              <Route path="/admin" element={<AdminWorkspace />} />
              <Route path="/admin/:section" element={<AdminWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Teacher row is present
      const deleteBtn = await screen.findByTestId('admin-delete-teacher-btn-trang.do@khongtunhi.com');
      fireEvent.click(deleteBtn);

      const confirmBtn = screen.getByTestId('confirm-delete-teacher-btn');
      fireEvent.click(confirmBtn);

      // Wait for mutation to fail
      await waitFor(() => {
        expect(addToastSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Không thể xóa giáo viên',
            variant: 'error',
          })
        );
      });

      // Confirmation modal remains open (did not auto-close on error)
      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();

      // Teacher row remains in the table (no premature cache eviction)
      expect(screen.getByTestId('admin-delete-teacher-btn-trang.do@khongtunhi.com')).toBeInTheDocument();

      // Admin clicks "Hủy" to safely dismiss
      const cancelBtn = screen.getByTestId('cancel-delete-teacher-btn');
      fireEvent.click(cancelBtn);

      expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
      expect(screen.getByTestId('admin-delete-teacher-btn-trang.do@khongtunhi.com')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // SUITE 8: Teacher Deletion UI — Drawer Auto-Close & State Cleanup
  // ===========================================================================
  describe('Suite 8: Teacher Deletion UI — TeacherDetailDrawer Auto-Close Invariant', () => {
    it('8.1. deleting currently viewed teacher from inside Drawer Tab 6 auto-closes Drawer and clears state', async () => {
      vi.spyOn(ktnApi, 'searchAdminTeachers').mockResolvedValue({
        ok: true,
        items: [MOCK_TEACHER_LAM],
        totalCount: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      vi.spyOn(ktnApi, 'getTeachers').mockResolvedValue([MOCK_TEACHER_LAM]);
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getOrders').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({
        ok: true,
        requests: [],
        pendingCount: 0,
      });
      vi.spyOn(ktnApi, 'getSyncStatus').mockResolvedValue({
        ok: true,
        checkedAt: new Date().toISOString(),
        summary: { totalStudents: 0, unsyncedStudents: 0, lastSyncSuccess: true },
      } as any);

      vi.spyOn(ktnApi, 'deleteTeacher').mockResolvedValue({
        ok: true,
        deleted: true,
        teacherId: 'GV-KTN-08',
        unassignedClassesCount: 2,
        unassignedClasses: ['HSK1-01', 'YCT2-04'],
        sessionRevoked: true,
        message: 'Đã xóa thành công',
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/admin/teachers']}>
            <Routes>
              <Route path="/admin" element={<AdminWorkspace />} />
              <Route path="/admin/:section" element={<AdminWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Open Drawer for Teacher Lam by clicking row
      const rowLinh = await screen.findByTestId('admin-teacher-row-linh.lam@khongtunhi.com');
      fireEvent.click(rowLinh);

      // Drawer is open
      const drawer = await screen.findByTestId('teacher-detail-drawer');
      expect(drawer).toBeInTheDocument();

      // Click Tab 6: "Tài khoản & Phân quyền"
      const accountTab = screen.getByTestId('teacher-drawer-tab-account');
      fireEvent.click(accountTab);

      // Click delete button inside drawer
      const drawerDeleteBtn = screen.getByTestId('admin-drawer-delete-teacher-btn');
      fireEvent.click(drawerDeleteBtn);

      // Confirmation modal is open
      const confirmModal = screen.getByTestId('admin-delete-teacher-modal');
      expect(confirmModal).toBeInTheDocument();

      // Confirm delete
      const confirmBtn = screen.getByTestId('confirm-delete-teacher-btn');
      fireEvent.click(confirmBtn);

      // Invariant: Both modal AND drawer must be closed after success!
      await waitFor(() => {
        expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
        expect(screen.queryByTestId('teacher-detail-drawer')).not.toBeInTheDocument();
      });
    });

    it('8.2. deleting Teacher B does NOT close Drawer if Teacher A is currently open in Drawer', async () => {
      vi.spyOn(ktnApi, 'searchAdminTeachers').mockResolvedValue({
        ok: true,
        items: [MOCK_TEACHER_LAM, MOCK_TEACHER_AN],
        totalCount: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      vi.spyOn(ktnApi, 'getTeachers').mockResolvedValue([MOCK_TEACHER_LAM, MOCK_TEACHER_AN]);
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getOrders').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({
        ok: true,
        requests: [],
        pendingCount: 0,
      });
      vi.spyOn(ktnApi, 'getSyncStatus').mockResolvedValue({
        ok: true,
        checkedAt: new Date().toISOString(),
        summary: { totalStudents: 0, unsyncedStudents: 0, lastSyncSuccess: true },
      } as any);

      vi.spyOn(ktnApi, 'deleteTeacher').mockResolvedValue({
        ok: true,
        deleted: true,
        teacherId: 'GV-KTN-01',
        unassignedClassesCount: 0,
        unassignedClasses: [],
        sessionRevoked: true,
        message: 'Đã xóa thành công',
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/admin/teachers']}>
            <Routes>
              <Route path="/admin" element={<AdminWorkspace />} />
              <Route path="/admin/:section" element={<AdminWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Open Drawer for Teacher Lam
      const rowLinh = await screen.findByTestId('admin-teacher-row-linh.lam@khongtunhi.com');
      fireEvent.click(rowLinh);

      const drawer = await screen.findByTestId('teacher-detail-drawer');
      expect(drawer).toBeInTheDocument();

      // Delete Teacher An from the background table
      const deleteAnBtn = screen.getByTestId('admin-delete-teacher-btn-an.nguyen@khongtunhi.com');
      fireEvent.click(deleteAnBtn);

      const confirmBtn = screen.getByTestId('confirm-delete-teacher-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
      });

      // Invariant: Teacher Lam's drawer must STAY OPEN because Teacher Lam was not deleted!
      expect(screen.getByTestId('teacher-detail-drawer')).toBeInTheDocument();
      expect(screen.getByTestId('teacher-detail-drawer')).toHaveTextContent('Cô Lâm Mỹ Linh');
    });
  });

  // ===========================================================================
  // SUITE 9: Teacher Deletion UI — Mobile Card (390px Viewport) Accessibility
  // ===========================================================================
  describe('Suite 9: Teacher Deletion UI — Mobile Card (390px Viewport) Accessibility & Event Propagation', () => {
    it('9.1. mobile card delete button has min touch target, title, and stops propagation from opening drawer', async () => {
      vi.spyOn(ktnApi, 'searchAdminTeachers').mockResolvedValue({
        ok: true,
        items: [MOCK_TEACHER_LAM],
        totalCount: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      vi.spyOn(ktnApi, 'getTeachers').mockResolvedValue([MOCK_TEACHER_LAM]);
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getOrders').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({
        ok: true,
        requests: [],
        pendingCount: 0,
      });
      vi.spyOn(ktnApi, 'getSyncStatus').mockResolvedValue({
        ok: true,
        checkedAt: new Date().toISOString(),
        summary: { totalStudents: 0, unsyncedStudents: 0, lastSyncSuccess: true },
      } as any);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/admin/teachers']}>
            <Routes>
              <Route path="/admin" element={<AdminWorkspace />} />
              <Route path="/admin/:section" element={<AdminWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Find mobile delete button
      const mobileDeleteBtn = await screen.findByTestId('admin-delete-teacher-btn-mobile-linh.lam@khongtunhi.com');
      expect(mobileDeleteBtn).toBeInTheDocument();
      expect(mobileDeleteBtn).toHaveClass('min-h-[32px]');

      // Click mobile delete button
      fireEvent.click(mobileDeleteBtn);

      // Invariant: Confirmation modal opens, but TeacherDetailDrawer MUST NOT open
      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();
      expect(screen.queryByTestId('teacher-detail-drawer')).not.toBeInTheDocument();
    });
  });
});
