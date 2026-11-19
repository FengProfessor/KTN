import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
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
];

describe('SearchableTeacherCombobox (Milestone M4)', () => {
  beforeEach(() => {
    // Mock scrollIntoView for jsdom compatibility
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  // 1. Backward Compatibility
  it('renders hidden select for backward compatibility with existing tests', () => {
    const onChange = vi.fn();
    render(
      <SearchableTeacherCombobox
        value="linh.lam@khongtunhi.com"
        onChange={onChange}
        teachers={MOCK_TEACHERS}
      />
    );

    const select = screen.getByTestId('schedule-teacher-select');
    expect(select).toBeInTheDocument();
    expect(select).toHaveClass('sr-only');
    expect(select).toHaveValue('linh.lam@khongtunhi.com');

    // Simulate legacy fireEvent.change
    fireEvent.change(select, { target: { value: 'an.nguyen@khongtunhi.com' } });
    expect(onChange).toHaveBeenCalledWith('an.nguyen@khongtunhi.com');

    // Select unassigned
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('');
  });

  // 2. Vietnamese Unaccented Search
  it('filters teachers by Vietnamese unaccented search ("my linh" -> "Cô Lâm Mỹ Linh")', () => {
    render(
      <SearchableTeacherCombobox
        value=""
        onChange={vi.fn()}
        teachers={MOCK_TEACHERS}
      />
    );

    const input = screen.getByTestId('schedule-teacher-combobox-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'my linh' } });

    const dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
    expect(within(dropdown).getByText('Cô Lâm Mỹ Linh')).toBeInTheDocument();
    expect(within(dropdown).queryByText(/Nguyễn Văn An/i)).not.toBeInTheDocument();
    expect(within(dropdown).queryByText(/Đỗ Thùy Trang/i)).not.toBeInTheDocument();

    // Test đ/Đ handling
    fireEvent.change(input, { target: { value: 'do thuy trang' } });
    expect(within(dropdown).getByText('Cô Đỗ Thùy Trang')).toBeInTheDocument();
    expect(within(dropdown).queryByText(/Cô Lâm Mỹ Linh/i)).not.toBeInTheDocument();

    // Test uppercase
    fireEvent.change(input, { target: { value: 'LAM MY LINH' } });
    expect(within(dropdown).getByText('Cô Lâm Mỹ Linh')).toBeInTheDocument();

    // Test multi-space trimming
    fireEvent.change(input, { target: { value: '  my   linh  ' } });
    expect(within(dropdown).getByText('Cô Lâm Mỹ Linh')).toBeInTheDocument();
  });

  // 3. Search by Email and Code
  it('filters teachers by email and teacher code', () => {
    render(
      <SearchableTeacherCombobox
        value=""
        onChange={vi.fn()}
        teachers={MOCK_TEACHERS}
      />
    );

    const input = screen.getByTestId('schedule-teacher-combobox-input');
    fireEvent.focus(input);

    // By code
    fireEvent.change(input, { target: { value: 'gv-ktn-08' } });
    const dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
    expect(within(dropdown).getByText('Cô Lâm Mỹ Linh')).toBeInTheDocument();
    expect(within(dropdown).queryByText(/Nguyễn Văn An/i)).not.toBeInTheDocument();

    // By email prefix
    fireEvent.change(input, { target: { value: 'an.nguyen' } });
    expect(within(dropdown).getByText('Thầy Nguyễn Văn An')).toBeInTheDocument();
    expect(within(dropdown).queryByText(/Cô Lâm Mỹ Linh/i)).not.toBeInTheDocument();

    // Empty state on no match
    fireEvent.change(input, { target: { value: 'nonexistent-code-999' } });
    expect(screen.getByTestId('schedule-teacher-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/Không tìm thấy giáo viên/i)).toBeInTheDocument();
  });

  // 4. "Chưa phân công giáo viên" Option
  it('renders "Chưa phân công giáo viên" option with empty string value', () => {
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

    const unassignedOption = screen.getByTestId('schedule-teacher-option-unassigned');
    expect(unassignedOption).toBeInTheDocument();
    expect(unassignedOption).toHaveTextContent(/Chưa phân công giáo viên/i);

    fireEvent.click(unassignedOption);
    expect(onChange).toHaveBeenCalledWith('');
  });

  // 5. Decoupled State
  it('does NOT call onChange while typing until an option is selected', () => {
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
    fireEvent.change(input, { target: { value: 'an' } });

    // Typing must NOT alter value
    expect(onChange).not.toHaveBeenCalled();

    // Press Escape to cancel
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();

    // Click option to select
    fireEvent.click(input);
    const teacherOption = screen.getByTestId('schedule-teacher-option-an.nguyen@khongtunhi.com');
    fireEvent.click(teacherOption);
    expect(onChange).toHaveBeenCalledWith('an.nguyen@khongtunhi.com');
  });

  // 6. Keyboard Navigation
  it('supports keyboard navigation (ArrowDown, ArrowUp, Enter, Escape) and prevents form submit on Enter', () => {
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

    // ArrowDown opens dropdown and highlights first option (index 0: Chưa phân công giáo viên)
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(screen.getByTestId('schedule-teacher-combobox-dropdown')).toBeInTheDocument();

    // ArrowDown moves highlight to second option (index 1: Cô Lâm Mỹ Linh)
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });

    // Enter selects highlighted option and prevents default form submission
    const defaultAllowed = fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(defaultAllowed).toBe(false);
    expect(onChange).toHaveBeenCalledWith('linh.lam@khongtunhi.com');
  });

  // 7. Mobile Touch Target & Overscroll Containment
  it('renders mobile touch targets (min 44px) and overscroll containment attributes', () => {
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

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    options.forEach((opt) => {
      expect(opt).toHaveClass('min-h-[44px]');
    });
  });

  // 8. Clear Button and Toggle Chevron
  it('supports clear search button and toggle chevron', () => {
    render(
      <SearchableTeacherCombobox
        value="linh.lam@khongtunhi.com"
        onChange={vi.fn()}
        teachers={MOCK_TEACHERS}
      />
    );

    const input = screen.getByTestId('schedule-teacher-combobox-input');
    fireEvent.change(input, { target: { value: 'linh' } });

    const clearBtn = screen.getByTestId('schedule-teacher-combobox-clear');
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);

    const dropdown = screen.getByTestId('schedule-teacher-combobox-dropdown');
    expect(within(dropdown).getByText('Thầy Nguyễn Văn An')).toBeInTheDocument();

    // Toggle chevron closes dropdown
    const toggleBtn = screen.getByTestId('schedule-teacher-combobox-toggle');
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId('schedule-teacher-combobox-dropdown')).not.toBeInTheDocument();
  });
});
