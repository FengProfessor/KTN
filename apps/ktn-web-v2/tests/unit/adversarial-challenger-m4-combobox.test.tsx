import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { SearchableTeacherCombobox } from '@/features/classrooms/components/SearchableTeacherCombobox';
import type { KtnTeacherRecord } from '@/types/ktn.types';
import fs from 'fs';
import path from 'path';

const MOCK_TEACHERS: KtnTeacherRecord[] = [
  {
    code: 'GV-KTN-08',
    name: 'Cô Lâm Mỹ Linh',
    email: 'linh.lam@khongtunhi.com',
    active: true,
    status: 'active',
    assigned_classes: ['HSK1-01'],
  },
  {
    code: 'GV-KTN-01',
    name: 'Thầy Nguyễn Văn An',
    email: 'an.nguyen@khongtunhi.com',
    active: true,
    status: 'active',
    assigned_classes: [],
  },
  {
    code: 'GV-KTN-02',
    name: 'Cô Đỗ Thùy Trang',
    email: 'trang.do@khongtunhi.com',
    active: true,
    status: 'active',
    assigned_classes: [],
  },
];

describe('Challenger 2 — Adversarial Stress Test Suite: SearchableTeacherCombobox', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  // ==========================================
  // SECTION 1: KEYBOARD NAVIGATION STRESS TEST
  // ==========================================

  describe('1. Keyboard Navigation Cycling & Boundaries', () => {
    it('ArrowDown cycles downward cleanly and wraps around from last option back to first option', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.focus(input);

      // Press ArrowDown while closed -> opens and highlights index 0 (Unassigned)
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      let options = screen.getAllByRole('option');
      expect(options).toHaveLength(4); // 1 unassigned + 3 teachers
      expect(options[0]).toHaveClass('bg-amber-50'); // index 0 highlighted

      // ArrowDown to index 1 (Lâm Mỹ Linh)
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      options = screen.getAllByRole('option');
      expect(options[1]).toHaveClass('bg-sky-50');

      // ArrowDown to index 2 (Nguyễn Văn An)
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      options = screen.getAllByRole('option');
      expect(options[2]).toHaveClass('bg-sky-50');

      // ArrowDown to index 3 (Đỗ Thùy Trang - last option)
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      options = screen.getAllByRole('option');
      expect(options[3]).toHaveClass('bg-sky-50');

      // ArrowDown from index 3 (last) wraps around to index 0 (Unassigned)
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      options = screen.getAllByRole('option');
      expect(options[0]).toHaveClass('bg-amber-50');
    });

    it('ArrowUp cycles upward cleanly, opens to last option when closed, and wraps around from first to last option', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.focus(input);

      // Press ArrowUp while closed -> opens and highlights last option (index 3)
      fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
      let options = screen.getAllByRole('option');
      expect(options).toHaveLength(4);
      expect(options[3]).toHaveClass('bg-sky-50');

      // ArrowUp to index 2 (Nguyễn Văn An)
      fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
      options = screen.getAllByRole('option');
      expect(options[2]).toHaveClass('bg-sky-50');

      // ArrowUp to index 1 (Lâm Mỹ Linh)
      fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
      options = screen.getAllByRole('option');
      expect(options[1]).toHaveClass('bg-sky-50');

      // ArrowUp to index 0 (Unassigned)
      fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
      options = screen.getAllByRole('option');
      expect(options[0]).toHaveClass('bg-amber-50');

      // ArrowUp from index 0 wraps around to index 3 (last option)
      fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
      options = screen.getAllByRole('option');
      expect(options[3]).toHaveClass('bg-sky-50');
    });

    it('handles ArrowUp/ArrowDown safely when 0 options match (empty state)', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'nonexistent-xyz-999' } });

      expect(screen.getByTestId('schedule-teacher-empty-state')).toBeInTheDocument();
      expect(screen.queryAllByRole('option')).toHaveLength(0);

      // Press ArrowDown & ArrowUp — must not throw or error
      expect(() => {
        fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      }).not.toThrow();
    });

    it('handles ArrowUp/ArrowDown when exactly 1 option matches', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'GV-KTN-08' } });

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveClass('bg-sky-50');

      // ArrowDown wraps 0 -> 0
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      expect(screen.getAllByRole('option')[0]).toHaveClass('bg-sky-50');

      // ArrowUp wraps 0 -> 0
      fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
      expect(screen.getAllByRole('option')[0]).toHaveClass('bg-sky-50');
    });
  });

  // ==========================================
  // SECTION 2: FORM SUBMISSION GUARD & ENTER KEY
  // ==========================================

  describe('2. Form Submission Prevention on Enter Key', () => {
    it('Enter key selects option AND explicitly halts form submission in an enclosing <form>', () => {
      const onFormSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      const onComboboxChange = vi.fn();

      const TestHarness = () => {
        const [val, setVal] = useState('an.nguyen@khongtunhi.com');
        return (
          <form onSubmit={onFormSubmit} data-testid="test-form">
            <SearchableTeacherCombobox
              value={val}
              onChange={(newVal) => {
                setVal(newVal);
                onComboboxChange(newVal);
              }}
              teachers={MOCK_TEACHERS}
            />
            <button type="submit" data-testid="submit-btn">
              Submit Form
            </button>
          </form>
        );
      };

      render(<TestHarness />);

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.focus(input);

      // Open dropdown with ArrowDown (highlights index 0: Unassigned)
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      // Move to index 1: Cô Lâm Mỹ Linh
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });

      // Press Enter to select Cô Lâm Mỹ Linh
      const keyEvent = fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // 1. Enter key event must be defaultPrevented
      expect(keyEvent).toBe(false);

      // 2. Form submission must NOT have been called!
      expect(onFormSubmit).not.toHaveBeenCalled();

      // 3. Combobox value updated to linh.lam@khongtunhi.com
      expect(onComboboxChange).toHaveBeenCalledWith('linh.lam@khongtunhi.com');

      // 4. Dropdown is closed
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
    });

    it('Enter key when dropdown is CLOSED does NOT submit the enclosing form', () => {
      const onFormSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      const onComboboxChange = vi.fn();

      render(
        <form onSubmit={onFormSubmit}>
          <SearchableTeacherCombobox
            value="linh.lam@khongtunhi.com"
            onChange={onComboboxChange}
            teachers={MOCK_TEACHERS}
          />
        </form>
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.focus(input);

      // Press Enter while dropdown is closed
      const keyEvent = fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      expect(keyEvent).toBe(false);
      expect(onFormSubmit).not.toHaveBeenCalled();
      expect(onComboboxChange).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // SECTION 3: ESCAPE & TAB DISMISSAL
  // ==========================================

  describe('3. Escape & Tab Dismissal without Mutation', () => {
    it('Escape closes dropdown and restores original teacher name without altering value', () => {
      const onChange = vi.fn();

      const TestHarness = () => {
        const [val, setVal] = useState('linh.lam@khongtunhi.com');
        return (
          <SearchableTeacherCombobox
            value={val}
            onChange={(newVal) => {
              setVal(newVal);
              onChange(newVal);
            }}
            teachers={MOCK_TEACHERS}
          />
        );
      };

      render(<TestHarness />);

      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;
      expect(input.value).toBe('Cô Lâm Mỹ Linh');

      // Type search query "an"
      fireEvent.change(input, { target: { value: 'an' } });
      expect(input.value).toBe('an');
      expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

      // Dropdown must be closed
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();

      // Value must NOT have been changed
      expect(onChange).not.toHaveBeenCalled();

      // Display value must revert to original teacher name
      expect(input.value).toBe('Cô Lâm Mỹ Linh');
    });

    it('Tab key closes dropdown without altering value', () => {
      const onChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value="trang.do@khongtunhi.com"
          onChange={onChange}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'linh' } });
      expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();

      // Press Tab
      fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });

      // Dropdown closed, onChange not called
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // SECTION 4: MOBILE & LAYOUT VERIFICATION
  // ==========================================

  describe('4. Mobile UX, Touch Targets & Dropdown Stacking', () => {
    it('all options satisfy minimum 44px touch target height (min-h-[44px])', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.click(input);

      const options = screen.getAllByRole('option');
      expect(options.length).toBe(4);

      // Unassigned option
      const unassigned = screen.getByTestId('schedule-teacher-option-unassigned');
      expect(unassigned).toHaveClass('min-h-[44px]');

      // Teacher options
      options.forEach((opt) => {
        expect(opt).toHaveClass('min-h-[44px]');
      });
    });

    it('dropdown popover includes overscroll-contain, max-h-60, overflow-y-auto, and shadow-2xl', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.click(input);

      const dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(dropdown).toHaveClass('overscroll-contain');
      expect(dropdown).toHaveClass('overflow-y-auto');
      expect(dropdown).toHaveClass('max-h-60');
      expect(dropdown).toHaveClass('shadow-2xl');
      expect(dropdown).toHaveClass('absolute');
      expect(dropdown).toHaveClass('top-full');
      expect(dropdown).toHaveClass('mt-1.5');
      expect(dropdown).toHaveClass('z-50');
      expect(dropdown).toHaveClass('left-0');
      expect(dropdown).toHaveClass('right-0');
    });

    it('closes dropdown cleanly when user touches or clicks outside (desktop mousedown and mobile touchstart)', () => {
      render(
        <div>
          <div data-testid="outside-area">Outside content</div>
          <SearchableTeacherCombobox
            value=""
            onChange={vi.fn()}
            teachers={MOCK_TEACHERS}
          />
        </div>
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.click(input);
      expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();

      // Mobile touch outside
      const outsideArea = screen.getByTestId('outside-area');
      fireEvent.touchStart(outsideArea);
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();

      // Desktop click outside
      fireEvent.click(input);
      expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();
      fireEvent.mouseDown(outsideArea);
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
    });

    it('verifies ClassScheduleModal container styles: relative z-30 sm:col-span-2', () => {
      const modalFilePath = path.resolve(
        __dirname,
        '../../src/features/classrooms/components/ClassScheduleModal.tsx'
      );
      const modalContent = fs.readFileSync(modalFilePath, 'utf8');

      // Check relative z-30 container wrapping SearchableTeacherCombobox
      expect(modalContent).toContain('<div className="relative z-30 sm:col-span-2">');
      expect(modalContent).toContain('<SearchableTeacherCombobox');
    });
  });

  // ==========================================
  // SECTION 5: BACKWARD COMPATIBILITY
  // ==========================================

  describe('5. Hidden Select Invariant & Backward Compatibility', () => {
    it('maintains hidden select with exact testId, sr-only, and options for legacy automation', () => {
      const onChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value="GV-KTN-01"
          onChange={onChange}
          teachers={MOCK_TEACHERS}
        />
      );

      const select = screen.getByTestId('schedule-teacher-select') as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      expect(select.tagName).toBe('SELECT');
      expect(select).toHaveClass('sr-only');
      expect(select).toHaveAttribute('tabindex', '-1');
      expect(select).toHaveAttribute('aria-hidden', 'true');

      // Check all option tags
      const options = select.querySelectorAll('option');
      expect(options).toHaveLength(4);
      expect(options[0].value).toBe('');
      expect(options[1].value).toBe('linh.lam@khongtunhi.com');
      expect(options[2].value).toBe('an.nguyen@khongtunhi.com');
      expect(options[3].value).toBe('trang.do@khongtunhi.com');

      // Dispatched fireEvent.change triggers onChange
      fireEvent.change(select, { target: { value: 'trang.do@khongtunhi.com' } });
      expect(onChange).toHaveBeenCalledWith('trang.do@khongtunhi.com');
    });
  });

  // ==========================================
  // SECTION 6: EDGE CASES & RESILIENCE
  // ==========================================

  describe('6. Edge Cases, Disabled Mode & Empty Teachers Array', () => {
    it('respects disabled={true} prop and prevents open or interaction', () => {
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
          disabled={true}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      expect(input).toBeDisabled();

      // Click does not open
      fireEvent.click(input);
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();

      // Keyboard does not open
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();

      // Toggle button is disabled
      const toggleBtn = screen.getByTestId('schedule-teacher-combobox-toggle');
      expect(toggleBtn).toBeDisabled();
      fireEvent.click(toggleBtn);
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
    });

    it('works safely when teachers array is empty []', () => {
      const onChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={onChange}
          teachers={[]}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.click(input);

      // Only "Chưa phân công giáo viên" option exists
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent(/Chưa phân công giáo viên/i);

      // Keyboard cycling stays at 0
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      expect(options[0]).toHaveClass('bg-amber-50');

      // Selecting unassigned calls onChange with ''
      fireEvent.click(options[0]);
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('updates displayed teacher name when value prop changes externally (modal reopen simulation)', () => {
      const TestReopen = () => {
        const [teacherEmail, setTeacherEmail] = useState('');
        return (
          <div>
            <button
              data-testid="reopen-with-teacher"
              onClick={() => setTeacherEmail('linh.lam@khongtunhi.com')}
            >
              Reopen with Teacher
            </button>
            <SearchableTeacherCombobox
              value={teacherEmail}
              onChange={setTeacherEmail}
              teachers={MOCK_TEACHERS}
            />
          </div>
        );
      };

      render(<TestReopen />);

      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;
      expect(input.placeholder).toBe('Chọn giáo viên phụ trách...');
      expect(input.value).toBe('');

      // Simulate modal reopened with class assigned to Cô Lâm Mỹ Linh
      fireEvent.click(screen.getByTestId('reopen-with-teacher'));
      expect(input.value).toBe('Cô Lâm Mỹ Linh');
    });
  });
});
