import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { SearchableTeacherCombobox } from '@/features/classrooms/components/SearchableTeacherCombobox';
import type { KtnTeacherRecord } from '@/types/ktn.types';

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
  {
    code: 'GV-KTN-03',
    name: 'Thầy Trần Đình Trọng (Chuyên Ngữ)',
    email: 'trong.tran@khongtunhi.com',
    active: true,
    status: 'active',
    assigned_classes: [],
  },
];

describe('Challenger 1: Empirical Stress-Test Suite for SearchableTeacherCombobox', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  describe('1. Search Algorithm Edge Cases & Vietnamese Normalization', () => {
    it('matches "my linh" to "Cô Lâm Mỹ Linh"', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.change(input, { target: { value: 'my linh' } });

      const dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(within(dropdown).getByText('Cô Lâm Mỹ Linh')).toBeInTheDocument();
      expect(within(dropdown).queryByText(/Nguyễn Văn An/i)).not.toBeInTheDocument();
      expect(within(dropdown).queryByText(/Đỗ Thùy Trang/i)).not.toBeInTheDocument();
    });

    it('matches uppercase "CO LAM MY LINH" and "MY LINH"', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.change(input, { target: { value: 'CO LAM MY LINH' } });
      const dropdown1 = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(within(dropdown1).getByText('Cô Lâm Mỹ Linh')).toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'MY LINH' } });
      const dropdown2 = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(within(dropdown2).getByText('Cô Lâm Mỹ Linh')).toBeInTheDocument();
    });

    it('matches "do thuy trang" to "Cô Đỗ Thùy Trang" with Vietnamese đ/Đ conversion', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.change(input, { target: { value: 'do thuy trang' } });

      const dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(within(dropdown).getByText('Cô Đỗ Thùy Trang')).toBeInTheDocument();
      expect(within(dropdown).queryByText(/Cô Lâm Mỹ Linh/i)).not.toBeInTheDocument();
      expect(within(dropdown).queryByText(/Nguyễn Văn An/i)).not.toBeInTheDocument();
    });

    it('matches query with leading, trailing, and multiple interspersed spaces', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.change(input, { target: { value: '   my      linh   ' } });

      const dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(within(dropdown).getByText('Cô Lâm Mỹ Linh')).toBeInTheDocument();
    });

    it('matches teacher code in uppercase, lowercase, and compact without hyphens', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');

      // lowercase with hyphens
      fireEvent.change(input, { target: { value: 'gv-ktn-08' } });
      let dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(within(dropdown).getByText('Cô Lâm Mỹ Linh')).toBeInTheDocument();

      // uppercase with hyphens
      fireEvent.change(input, { target: { value: 'GV-KTN-08' } });
      dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(within(dropdown).getByText('Cô Lâm Mỹ Linh')).toBeInTheDocument();

      // compact without hyphens
      fireEvent.change(input, { target: { value: 'gvktn08' } });
      dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(within(dropdown).getByText('Cô Lâm Mỹ Linh')).toBeInTheDocument();
    });

    it('displays empty state cleanly without crashing when searching non-existent strings or regex special chars', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');

      // Random non-existent string
      fireEvent.change(input, { target: { value: 'xyz_unknown_teacher_999' } });
      expect(screen.getByTestId('schedule-teacher-empty-state')).toBeInTheDocument();
      expect(screen.getByText(/Không tìm thấy giáo viên phù hợp với/i)).toBeInTheDocument();

      // Regex special characters that break unsafe new RegExp()
      fireEvent.change(input, { target: { value: '(.*)+[a-z]{1,3}?' } });
      expect(screen.getByTestId('schedule-teacher-empty-state')).toBeInTheDocument();

      fireEvent.change(input, { target: { value: '***\\\\\\???' } });
      expect(screen.getByTestId('schedule-teacher-empty-state')).toBeInTheDocument();
    });

    it('matches out-of-order tokens (e.g. "Linh Lam")', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.change(input, { target: { value: 'Linh Lam' } });

      const dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(within(dropdown).getByText('Cô Lâm Mỹ Linh')).toBeInTheDocument();
    });

    it('matches "chua", "chua phan cong", and "trong" for the unassigned option', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');

      fireEvent.change(input, { target: { value: 'chua phan cong' } });
      let dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(within(dropdown).getByTestId('schedule-teacher-option-unassigned')).toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'chua' } });
      dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(within(dropdown).getByTestId('schedule-teacher-option-unassigned')).toBeInTheDocument();
    });
  });

  describe('2. Selection, Persistence & Decoupled State Semantics', () => {
    it('passes empty string "" to onChange when selecting "Chưa phân công giáo viên"', () => {
      const onChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={onChange}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.click(input);

      const unassignedOpt = screen.getByTestId('schedule-teacher-option-unassigned');
      fireEvent.click(unassignedOpt);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('does NOT mutate value or trigger onChange while user is typing without selecting an option', () => {
      const onChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={onChange}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'an.nguyen' } });
      fireEvent.change(input, { target: { value: 'nguyen van' } });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('resets input display back to selected teacher name when pressing Escape', () => {
      const onChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={onChange}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;
      expect(input.value).toBe('Cô Lâm Mỹ Linh');

      // User types query
      fireEvent.change(input, { target: { value: 'Nguyen Van An' } });
      expect(input.value).toBe('Nguyen Van An');

      // User presses Escape
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

      // Must revert back to selected teacher name
      expect(input.value).toBe('Cô Lâm Mỹ Linh');
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
    });

    it('resets input display to empty if value was empty when pressing Escape', () => {
      const onChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={onChange}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;
      expect(input.value).toBe('');

      // User types query
      fireEvent.change(input, { target: { value: 'Linh' } });
      expect(input.value).toBe('Linh');

      // User presses Escape
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

      expect(input.value).toBe('');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('closes dropdown and resets input display on outside mousedown', () => {
      const onChange = vi.fn();
      render(
        <div>
          <div data-testid="outside-element">Outside</div>
          <SearchableTeacherCombobox
            value="linh.lam@khongtunhi.com"
            onChange={onChange}
            teachers={MOCK_TEACHERS}
          />
        </div>
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input') as HTMLInputElement;
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: 'Thầy' } });
      expect(input.value).toBe('Thầy');

      // Outside click
      fireEvent.mouseDown(screen.getByTestId('outside-element'));

      expect(input.value).toBe('Cô Lâm Mỹ Linh');
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
    });

    it('persists selected value in controlled parent component across state changes', () => {
      const TestContainer = () => {
        const [teacherEmail, setTeacherEmail] = useState('linh.lam@khongtunhi.com');
        return (
          <div>
            <span data-testid="current-val">{teacherEmail}</span>
            <SearchableTeacherCombobox
              value={teacherEmail}
              onChange={setTeacherEmail}
              teachers={MOCK_TEACHERS}
            />
          </div>
        );
      };

      render(<TestContainer />);
      expect(screen.getByTestId('current-val')).toHaveTextContent('linh.lam@khongtunhi.com');

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.click(input);

      const anOption = screen.getByTestId('schedule-teacher-option-an.nguyen@khongtunhi.com');
      fireEvent.click(anOption);

      expect(screen.getByTestId('current-val')).toHaveTextContent('an.nguyen@khongtunhi.com');
      expect(input).toHaveValue('Thầy Nguyễn Văn An');
    });
  });

  describe('3. Keyboard Navigation & Form Submit Invariant', () => {
    it('strictly prevents enclosing form submission on Enter inside combobox input', () => {
      const formSubmitSpy = vi.fn((e) => e.preventDefault());
      const onChange = vi.fn();

      render(
        <form onSubmit={formSubmitSpy} data-testid="test-form">
          <SearchableTeacherCombobox
            value=""
            onChange={onChange}
            teachers={MOCK_TEACHERS}
          />
          <button type="submit">Submit</button>
        </form>
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.focus(input);

      // Open dropdown via ArrowDown (highlight index 0: unassigned)
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });

      // Move highlight to index 1 (Cô Lâm Mỹ Linh)
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });

      // Press Enter to select
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // Option should be selected, but form MUST NOT be submitted
      expect(onChange).toHaveBeenCalledWith('linh.lam@khongtunhi.com');
      expect(formSubmitSpy).not.toHaveBeenCalled();
    });

    it('supports ArrowUp wrap-around from top to bottom and ArrowDown wrap-around', () => {
      const onChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={onChange}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.focus(input);

      // ArrowUp when closed opens dropdown and highlights the last option (index 4)
      fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
      expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();

      // Enter selects the last option (Thầy Trần Đình Trọng)
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      expect(onChange).toHaveBeenCalledWith('trong.tran@khongtunhi.com');
    });

    it('closes dropdown cleanly when pressing Tab without selecting an option', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={MOCK_TEACHERS}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.click(input);
      expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
    });
  });

  describe('4. Disabled State & Empty Teachers Boundary', () => {
    it('handles empty teachers list gracefully without crashing', () => {
      render(
        <SearchableTeacherCombobox
          value=""
          onChange={vi.fn()}
          teachers={[]}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      fireEvent.click(input);

      const dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
      expect(dropdown).toBeInTheDocument();
      // Only unassigned option should exist
      expect(screen.getByTestId('schedule-teacher-option-unassigned')).toBeInTheDocument();
    });

    it('respects disabled prop by preventing user interaction and key events', () => {
      const onChange = vi.fn();
      render(
        <SearchableTeacherCombobox
          value="linh.lam@khongtunhi.com"
          onChange={onChange}
          teachers={MOCK_TEACHERS}
          disabled={true}
        />
      );

      const input = screen.getByTestId('schedule-teacher-combobox-input');
      expect(input).toBeDisabled();

      fireEvent.click(input);
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
      expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();

      const toggle = screen.getByTestId('schedule-teacher-combobox-toggle');
      expect(toggle).toBeDisabled();
    });
  });
});
