// Shared 5-column multi-line CSV/TSV parser for Khổng Tử Nhí Bulk Import
// Columns: LỚP · LỊCH HỌC | GIÁO VIÊN | HỌC SINH | SĐT | PHỤ HUYNH

export interface BulkImportParsedClass {
  code: string;
  title: string;
  schedule: string;
  teacherKey: string;
  teacherDisplayName: string;
  teacherCode: string;
  teacherEmail: string;
  isArchived: boolean;
  studentCount: number;
}

export interface BulkImportParsedTeacher {
  key: string;
  code: string;
  email: string;
  name: string;
  preferredCode?: string;
  preferredEmail?: string;
  assignedClasses: string[];
  defaultPassword: string;
  isExisting: boolean;
}

export interface BulkImportParsedStudent {
  code: string;
  email: string;
  name: string;
  phone: string;
  parentName: string;
  classCode: string;
  classTitle: string;
  schedule: string;
  teacherCode: string;
  teacherEmail: string;
  teacherName: string;
  status: 'active' | 'archived';
  defaultPassword: string;
  rowIndex: number;
}

export interface BulkImportParseResult {
  classes: BulkImportParsedClass[];
  teachers: BulkImportParsedTeacher[];
  students: BulkImportParsedStudent[];
  warnings: string[];
  summary: {
    classCount: number;
    activeClassCount: number;
    archivedClassCount: number;
    teacherCount: number;
    studentCount: number;
    activeStudentCount: number;
    archivedStudentCount: number;
    warningCount: number;
    defaultPassword: string;
  };
}

export function tokenizeMultilineCsv(rawText: string): string[][] {
  const text = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstQuoteIdx = text.indexOf('"');
  const sampleSlice = firstQuoteIdx >= 0 ? text.slice(0, firstQuoteIdx) : text.slice(0, 600);
  const tabCount = (sampleSlice.match(/\t/g) || []).length;
  const commaCount = (sampleSlice.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (ch === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }
  return rows;
}

function stripViAccents(str: string): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function deriveCanonicalClassCode(rawClassCell: string): {
  code: string;
  title: string;
  schedule: string;
  isArchived: boolean;
} | null {
  const lines = String(rawClassCell || '')
    .split(/\n+/)
    .map((l) => l.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const titleLine = lines[0];
  const scheduleLine = lines.slice(1).join(' · ').trim() || 'Đang cập nhật lịch học';
  const upperNoAccent = stripViAccents(titleLine).toUpperCase().replace(/\s+/g, ' ').trim();

  const isArchived = upperNoAccent.includes('BAO LUU');
  const isUnassignedGroup =
    upperNoAccent.includes('CHUA RO NHOM') ||
    upperNoAccent.includes('CHO XEP NHOM') ||
    upperNoAccent.includes('CHUA XEP NHOM');
  const groupMatch = upperNoAccent.match(/NHOM\s*(\d+)/i);
  const groupSuffix = groupMatch
    ? `N${String(parseInt(groupMatch[1], 10)).padStart(2, '0')}`
    : isUnassignedGroup
      ? 'CHO'
      : 'N01';

  let prefix = '';
  const loMiniMatch = upperNoAccent.match(/LO\s*MINI\s*(\d+)/i);
  const loMatch = upperNoAccent.match(/\bLO\s*(\d+)/i);
  if (loMiniMatch) {
    prefix = `LOMINI${loMiniMatch[1]}`;
  } else if (loMatch) {
    prefix = `LO${loMatch[1]}`;
  } else if (upperNoAccent.includes('HSK')) {
    prefix = 'HSK';
  } else if (upperNoAccent.includes('1 BUOI') || upperNoAccent.includes('1BT')) {
    prefix = '1BT';
  } else if (upperNoAccent.includes('1-1') || upperNoAccent.includes('1V1') || upperNoAccent.includes('1:1')) {
    prefix = '1V1';
  } else if (isArchived) {
    prefix = 'BAOLUU';
  } else {
    const explicitCode = upperNoAccent.replace(/[^A-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!groupMatch && !isUnassignedGroup && explicitCode) {
      return {
        code: explicitCode.slice(0, 24),
        title: titleLine,
        schedule: scheduleLine,
        isArchived
      };
    }
    prefix = explicitCode.split('-')[0] || 'LOP';
  }

  return {
    code: `${prefix}-${groupSuffix}`,
    title: titleLine,
    schedule: scheduleLine,
    isArchived
  };
}

export interface CanonicalTeacherDefinition {
  code: string;
  email: string;
  cleanName: string;
  displayName: string;
  key: string;
  keys: string[];
}

export const KTN_CANONICAL_TEACHER_DEFINITIONS: CanonicalTeacherDefinition[] = [
  { code: 'GV001', email: 'gv001@khongtunhi.com', cleanName: 'Đặng Thùy Dương', displayName: 'Cô Đặng Thùy Dương', key: 'dangthuyduong', keys: ['dangduong', 'dangthuyduong', 'thuyduong'] },
  { code: 'GV002', email: 'gv002@khongtunhi.com', cleanName: 'Thu Phương', displayName: 'Cô Thu Phương', key: 'thuphuong', keys: ['thuphuong'] },
  { code: 'GV003', email: 'gv003@khongtunhi.com', cleanName: 'Linh Chi', displayName: 'Cô Linh Chi', key: 'linhchi', keys: ['chi', 'linhchi'] },
  { code: 'GV004', email: 'gv004@khongtunhi.com', cleanName: 'Quỳnh Chi', displayName: 'Cô Quỳnh Chi', key: 'quynhchi', keys: ['quynhchi'] },
  { code: 'GV005', email: 'gv005@khongtunhi.com', cleanName: 'Linh SCP', displayName: 'Cô Linh SCP', key: 'linhscp', keys: ['linh', 'linhscp'] },
  { code: 'GV006', email: 'gv006@khongtunhi.com', cleanName: 'Nguyễn Thị Huyền', displayName: 'Cô Nguyễn Thị Huyền', key: 'nguyenthihuyen', keys: ['nguyenthihuyen'] },
  { code: 'GV007', email: 'gv007@khongtunhi.com', cleanName: 'Đinh Huyền', displayName: 'Cô Đinh Huyền', key: 'dinhhuyen', keys: ['dinhhuyen'] },
  { code: 'GV008', email: 'gv008@khongtunhi.com', cleanName: 'Bùi Huyền', displayName: 'Cô Bùi Huyền', key: 'buihuyen', keys: ['buihuyen'] },
  { code: 'GV009', email: 'gv009@khongtunhi.com', cleanName: 'Thanh Huyền', displayName: 'Cô Thanh Huyền', key: 'thanhhuyen', keys: ['thanhhuyen'] },
  { code: 'GV010', email: 'gv010@khongtunhi.com', cleanName: 'Huyền', displayName: 'Cô Huyền', key: 'huyen', keys: ['huyen', 'huyenchuaroho'] },
  { code: 'GV011', email: 'gv011@khongtunhi.com', cleanName: 'Đỗ Bình', displayName: 'Cô Đỗ Bình', key: 'dobinh', keys: ['dobinh'] },
  { code: 'GV012', email: 'gv012@khongtunhi.com', cleanName: 'Ánh Nguyệt', displayName: 'Cô Ánh Nguyệt', key: 'anhnguyet', keys: ['anhnguyet', 'nguyet'] },
  { code: 'GV013', email: 'gv013@khongtunhi.com', cleanName: 'Nguyễn Hà', displayName: 'Cô Nguyễn Hà', key: 'nguyenha', keys: ['ha', 'hanguyen', 'nguyenha'] },
  { code: 'GV014', email: 'gv014@khongtunhi.com', cleanName: 'Lê Lý', displayName: 'Cô Lê Lý', key: 'lely', keys: ['lely'] },
  { code: 'GV015', email: 'gv015@khongtunhi.com', cleanName: 'Diệu Thảo', displayName: 'Cô Diệu Thảo', key: 'dieuthao', keys: ['dieuthao'] },
  { code: 'GV016', email: 'gv016@khongtunhi.com', cleanName: 'Đào Nhẫn', displayName: 'Cô Đào Nhẫn', key: 'daonhan', keys: ['daonhan'] },
  { code: 'GV017', email: 'gv017@khongtunhi.com', cleanName: 'Thúy Hằng', displayName: 'Cô Thúy Hằng', key: 'thuyhang', keys: ['hang', 'thuyhang'] },
  { code: 'GV018', email: 'gv018@khongtunhi.com', cleanName: 'Ánh Ly', displayName: 'Cô Ánh Ly', key: 'anhly', keys: ['anhly'] },
  { code: 'GV019', email: 'gv019@khongtunhi.com', cleanName: 'Trần Phương Anh', displayName: 'Cô Trần Phương Anh', key: 'tranphuonganh', keys: ['tranphuonganh'] },
  { code: 'GV020', email: 'gv020@khongtunhi.com', cleanName: 'Việt Linh', displayName: 'Cô Việt Linh', key: 'vietlinh', keys: ['vietlinh'] },
  { code: 'GV021', email: 'gv021@khongtunhi.com', cleanName: 'Minh Ngọc', displayName: 'Cô Minh Ngọc', key: 'minhngoc', keys: ['minhngoc'] },
  { code: 'GV022', email: 'gv022@khongtunhi.com', cleanName: 'Ngọc Anh', displayName: 'Cô Ngọc Anh', key: 'ngocanh', keys: ['ngocanh'] },
  { code: 'GV023', email: 'gv023@khongtunhi.com', cleanName: 'Thanh Ngọc', displayName: 'Cô Thanh Ngọc', key: 'thanhngoc', keys: ['ngoc', 'thanhngoc'] },
  { code: 'GV024', email: 'gv024@khongtunhi.com', cleanName: 'Linh Trang', displayName: 'Cô Linh Trang', key: 'linhtrang', keys: ['linhtrang'] },
  { code: 'GV025', email: 'gv025@khongtunhi.com', cleanName: 'Kim Trang', displayName: 'Cô Kim Trang', key: 'kimtrang', keys: ['kimtrang', 'trang'] },
  { code: 'GV026', email: 'gv026@khongtunhi.com', cleanName: 'Tào Quỳnh', displayName: 'Cô Tào Quỳnh', key: 'taoquynh', keys: ['taoquynh'] },
  { code: 'GV027', email: 'gv027@khongtunhi.com', cleanName: 'Hà Thùy', displayName: 'Cô Hà Thùy', key: 'hathuy', keys: ['hathuy', 'thuy'] },
  { code: 'GV028', email: 'gv028@khongtunhi.com', cleanName: 'Lý Kim Anh', displayName: 'Cô Lý Kim Anh', key: 'lykimanh', keys: ['lykimanh'] },
  { code: 'GV029', email: 'gv029@khongtunhi.com', cleanName: 'Trinh Phạm', displayName: 'Cô Trinh Phạm', key: 'trinhpham', keys: ['trinhpham'] },
  { code: 'GV030', email: 'gv030@khongtunhi.com', cleanName: 'Minh Hà', displayName: 'Cô Minh Hà', key: 'minhha', keys: ['minhha'] },
  { code: 'GV031', email: 'gv031@khongtunhi.com', cleanName: 'Hiểu Linh', displayName: 'Cô Hiểu Linh', key: 'hieulinh', keys: ['hieulinh'] },
  { code: 'GV032', email: 'gv032@khongtunhi.com', cleanName: 'Duyên', displayName: 'Cô Duyên', key: 'duyen', keys: ['duyen'] },
  { code: 'GV033', email: 'gv033@khongtunhi.com', cleanName: 'Kim Ngân', displayName: 'Cô Kim Ngân', key: 'kimngan', keys: ['kimngan'] },
  { code: 'GV034', email: 'gv034@khongtunhi.com', cleanName: 'Hân Giang', displayName: 'Cô Hân Giang', key: 'hangiang', keys: ['hangiang'] },
  { code: 'GV035', email: 'gv035@khongtunhi.com', cleanName: 'Khánh Linh', displayName: 'Cô Khánh Linh', key: 'khanhlinh', keys: ['khanhlinh'] },
  { code: 'GV036', email: 'gv036@khongtunhi.com', cleanName: 'Trâm', displayName: 'Cô Trâm', key: 'tram', keys: ['tram'] },
  { code: 'GV037', email: 'gv037@khongtunhi.com', cleanName: 'Thoa', displayName: 'Cô Thoa', key: 'thoa', keys: ['thoa'] },
  { code: 'GV038', email: 'gv038@khongtunhi.com', cleanName: 'Cầm (Bản Ngữ)', displayName: 'Cô Cầm (Bản Ngữ)', key: 'cambanngu', keys: ['cambanngu'] },
  { code: 'GV039', email: 'gv039@khongtunhi.com', cleanName: 'Hà My', displayName: 'Cô Hà My', key: 'hamy', keys: ['hamy'] },
  { code: 'GV040', email: 'gv040@khongtunhi.com', cleanName: 'Thùy Linh', displayName: 'Cô Thùy Linh', key: 'thuylinh', keys: ['thuylinh'] },
  { code: 'GV041', email: 'gv041@khongtunhi.com', cleanName: 'Vy', displayName: 'Cô Vy', key: 'vy', keys: ['vy'] },
  { code: 'GV042', email: 'gv042@khongtunhi.com', cleanName: 'Hoàng Hiền', displayName: 'Cô Hoàng Hiền', key: 'hoanghien', keys: ['hoanghien'] },
  { code: 'GV043', email: 'gv043@khongtunhi.com', cleanName: 'Hồng Điệp', displayName: 'Cô Hồng Điệp', key: 'hongdiep', keys: ['hongdiep'] },
  { code: 'GV044', email: 'gv044@khongtunhi.com', cleanName: 'Phương Thảo', displayName: 'Cô Phương Thảo', key: 'phuongthao', keys: ['phuongthao'] }
];

const CANONICAL_TEACHER_BY_ALIAS_KEY = new Map<string, CanonicalTeacherDefinition>();
for (const def of KTN_CANONICAL_TEACHER_DEFINITIONS) {
  for (const k of def.keys) {
    CANONICAL_TEACHER_BY_ALIAS_KEY.set(k, def);
  }
}

export function normalizeBulkTeacherIdentity(rawTeacherCell: string): {
  key: string;
  displayName: string;
  cleanName: string;
  preferredCode: string;
  preferredEmail: string;
  isUnassigned: boolean;
} {
  const trimmed = String(rawTeacherCell || '').replace(/\s+/g, ' ').trim();
  const noAccent = stripViAccents(trimmed).toLowerCase();
  if (
    !trimmed ||
    noAccent.includes('chua phan cong') ||
    noAccent.includes('chua ro') ||
    noAccent === 'trong' ||
    noAccent === 'n/a'
  ) {
    return {
      key: '__unassigned__',
      displayName: 'Chưa phân công',
      cleanName: 'Chưa phân công',
      preferredCode: '',
      preferredEmail: '',
      isUnassigned: true
    };
  }
  const isMalePrefix = /^thầy\b|^thay\b/i.test(trimmed);
  const strippedPrefix = trimmed
    .replace(/^(cô\s*giáo|co\s*giao|thầy\s*giáo|thay\s*giao|cô|co|thầy|thay|gv|giáo viên|giao vien)\s+/i, '')
    .trim();
  const words = (strippedPrefix || trimmed)
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const cleanName = words.join(' ');
  const rawKey = stripViAccents(cleanName).toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!rawKey) {
    return {
      key: '__unassigned__',
      displayName: 'Chưa phân công',
      cleanName: 'Chưa phân công',
      preferredCode: '',
      preferredEmail: '',
      isUnassigned: true
    };
  }
  const canonical = CANONICAL_TEACHER_BY_ALIAS_KEY.get(rawKey);
  if (canonical) {
    return {
      key: canonical.key,
      displayName: canonical.displayName,
      cleanName: canonical.cleanName,
      preferredCode: canonical.code,
      preferredEmail: canonical.email,
      isUnassigned: false
    };
  }
  const prefix = isMalePrefix ? 'Thầy ' : 'Cô ';
  const displayName = `${prefix}${cleanName}`;
  return {
    key: rawKey,
    displayName,
    cleanName,
    preferredCode: '',
    preferredEmail: '',
    isUnassigned: false
  };
}

export function cleanBulkPhoneValue(rawPhone: string): { phone: string; warning: string | null } {
  const raw = String(rawPhone || '').trim();
  if (!raw) return { phone: '', warning: null };
  const hadTrailingLetters = /[a-zA-Z]/.test(raw);
  let digits = raw.replace(/\D+/g, '');
  if (!digits) {
    return { phone: '', warning: `SĐT không hợp lệ ("${raw}") đã được làm trống.` };
  }
  if (digits.startsWith('84') && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.length === 9 && !digits.startsWith('0')) {
    digits = `0${digits}`;
  }
  const warning =
    hadTrailingLetters || digits !== raw.replace(/\s+/g, '')
      ? `Đã làm sạch SĐT "${raw}" -> "${digits}".`
      : null;
  return { phone: digits, warning };
}

export function parseKtnCenterBulkCsv(
  rawCsvText: string,
  options: {
    startTeacherSeq?: number;
    startStudentSeq?: number;
    existingTeachers?: Array<{ code?: string; email?: string; name?: string }>;
    existingStudents?: Array<{ code?: string; email?: string; name?: string; phone?: string; class_code?: string; classCode?: string }>;
    defaultPassword?: string;
  } = {}
): BulkImportParseResult {
  const existingTeacherByKey = new Map<string, { code: string; email: string; seqNum: number }>();
  const existingCodeOrEmailSet = new Set<string>();
  let maxTeacherSeq = Math.max(44, Number(options.startTeacherSeq ? options.startTeacherSeq - 1 : 44));
  if (Array.isArray(options.existingTeachers)) {
    for (const t of options.existingTeachers) {
      const codeStr = String(t?.code || '').trim().toUpperCase();
      const emailStr = String(t?.email || '').trim().toLowerCase();
      if (codeStr) existingCodeOrEmailSet.add(codeStr);
      if (emailStr) existingCodeOrEmailSet.add(emailStr);
      let seqNum = Infinity;
      const mCode = codeStr.match(/^GV(\d+)$/i);
      if (mCode) {
        const n = Number(mCode[1]);
        if (Number.isFinite(n)) {
          seqNum = Math.min(seqNum, n);
        }
      }
      const mEmail = emailStr.match(/^gv(\d+)@khongtunhi\.com$/i);
      if (mEmail) {
        const n = Number(mEmail[1]);
        if (Number.isFinite(n)) {
          seqNum = Math.min(seqNum, n);
        }
      }
      if (!options.startTeacherSeq && t?.name && (codeStr || emailStr)) {
        const ident = normalizeBulkTeacherIdentity(String(t.name));
        if (!ident.isUnassigned) {
          if (ident.preferredCode && ident.preferredEmail) {
            existingTeacherByKey.set(ident.key, {
              code: ident.preferredCode,
              email: ident.preferredEmail,
              seqNum: Number(ident.preferredCode.slice(2)) || 1
            });
          } else {
            if (Number.isFinite(seqNum) && seqNum > maxTeacherSeq) {
              maxTeacherSeq = seqNum;
            }
            const resolvedCode = codeStr || (mEmail ? `GV${String(Number(mEmail[1])).padStart(3, '0')}` : '');
            const resolvedEmail = emailStr || (resolvedCode ? `${resolvedCode.toLowerCase()}@khongtunhi.com` : '');
            if (resolvedCode && resolvedEmail && (!Number.isFinite(seqNum) || seqNum > 44)) {
              const prev = existingTeacherByKey.get(ident.key);
              if (!prev || seqNum < prev.seqNum) {
                existingTeacherByKey.set(ident.key, {
                  code: resolvedCode,
                  email: resolvedEmail,
                  seqNum
                });
              }
            }
          }
        }
      }
    }
  }

  const existingStudentCandidates: Array<{
    code: string;
    email: string;
    classCode: string;
    normName: string;
    cleanPhone: string;
    seqNum: number;
    used: boolean;
  }> = [];
  let maxStudentSeq = Math.max(0, Number(options.startStudentSeq ? options.startStudentSeq - 1 : 0));
  if (Array.isArray(options.existingStudents)) {
    for (const s of options.existingStudents) {
      const codeStr = String(s?.code || '').trim();
      const emailStr = String(s?.email || '').trim().toLowerCase();
      let seqNum = Infinity;
      const mCode = codeStr.match(/^2026(\d{4,})$/);
      if (mCode) {
        const n = Number(mCode[1]);
        if (Number.isFinite(n)) {
          seqNum = Math.min(seqNum, n);
          if (n > maxStudentSeq) maxStudentSeq = n;
        }
      }
      const mEmail = emailStr.match(/^2026(\d{4,})@khongtunhi\.com$/i);
      if (mEmail) {
        const n = Number(mEmail[1]);
        if (Number.isFinite(n)) {
          seqNum = Math.min(seqNum, n);
          if (n > maxStudentSeq) maxStudentSeq = n;
        }
      }
      if (!options.startStudentSeq && s?.name && (mCode || mEmail)) {
        const resolvedCode = codeStr || (mEmail ? `2026${mEmail[1]}` : '');
        const resolvedEmail = emailStr || (resolvedCode ? `${resolvedCode.toLowerCase()}@khongtunhi.com` : '');
        const clsCode = String(s?.class_code || s?.classCode || '').trim().toUpperCase();
        const normName = stripViAccents(String(s.name || ''))
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
        const cleanPhone = cleanBulkPhoneValue(String(s?.phone || '')).phone;
        if (resolvedCode && resolvedEmail && normName) {
          existingStudentCandidates.push({
            code: resolvedCode,
            email: resolvedEmail,
            classCode: clsCode,
            normName,
            cleanPhone,
            seqNum,
            used: false
          });
        }
      }
    }
  }
  existingStudentCandidates.sort((a, b) => a.seqNum - b.seqNum);

  const rows = tokenizeMultilineCsv(rawCsvText);
  const warnings: string[] = [];
  const classesMap = new Map<string, BulkImportParsedClass>();
  const teachersByKey = new Map<string, BulkImportParsedTeacher>();
  const rawStudents: Array<{
    name: string;
    phone: string;
    parentName: string;
    classCode: string;
    classTitle: string;
    schedule: string;
    teacherKey: string;
    teacherDisplayName: string;
    isArchived: boolean;
    rowIndex: number;
  }> = [];

  let currentClass: {
    code: string;
    title: string;
    schedule: string;
    isArchived: boolean;
  } | null = null;
  let currentTeacher = normalizeBulkTeacherIdentity('');

  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const col0 = String(row[0] || '').trim();
    const col1 = String(row[1] || '').trim();
    const col2 = String(row[2] || '').trim();
    const col3 = String(row[3] || '').trim();
    const col4 = String(row[4] || '').trim();

    if (!col0 && !col1 && !col2 && !col3 && !col4) continue;

    const headerProbe = stripViAccents(`${col0}|${col1}|${col2}`).toUpperCase();
    if (
      (headerProbe.includes('LOP') && headerProbe.includes('LICH HOC')) ||
      (headerProbe.includes('GIAO VIEN') && headerProbe.includes('HOC SINH'))
    ) {
      continue;
    }

    if (col0) {
      const parsedCls = deriveCanonicalClassCode(col0);
      if (parsedCls) {
        currentClass = parsedCls;
      }
    }

    if (col1) {
      currentTeacher = normalizeBulkTeacherIdentity(col1);
    } else if (col0 && !col1) {
      currentTeacher = normalizeBulkTeacherIdentity('');
    }

    if (!currentClass) {
      warnings.push(`Dòng ${idx + 1}: Bỏ qua vì chưa xác định được Lớp học.`);
      continue;
    }

    if (!classesMap.has(currentClass.code)) {
      classesMap.set(currentClass.code, {
        code: currentClass.code,
        title: currentClass.title,
        schedule: currentClass.schedule,
        teacherKey: currentTeacher.key,
        teacherDisplayName: currentTeacher.displayName,
        teacherCode: '',
        teacherEmail: '',
        isArchived: currentClass.isArchived,
        studentCount: 0
      });
    } else {
      const existingCls = classesMap.get(currentClass.code)!;
      if (existingCls.teacherKey === '__unassigned__' && !currentTeacher.isUnassigned) {
        existingCls.teacherKey = currentTeacher.key;
        existingCls.teacherDisplayName = currentTeacher.displayName;
      }
    }

    if (!currentTeacher.isUnassigned) {
      if (!teachersByKey.has(currentTeacher.key)) {
        teachersByKey.set(currentTeacher.key, {
          key: currentTeacher.key,
          code: currentTeacher.preferredCode || '',
          email: currentTeacher.preferredEmail || '',
          name: currentTeacher.displayName,
          preferredCode: currentTeacher.preferredCode || '',
          preferredEmail: currentTeacher.preferredEmail || '',
          assignedClasses: [],
          defaultPassword: options.defaultPassword || '12345678',
          isExisting: false
        });
      }
      const tEntry = teachersByKey.get(currentTeacher.key)!;
      if (!currentClass.isArchived && !tEntry.assignedClasses.includes(currentClass.code)) {
        tEntry.assignedClasses.push(currentClass.code);
      }
    }

    if (!col2 && !col3 && !col4) continue;

    let studentName = col2.replace(/\s+/g, ' ').trim();
    let rawPhone = col3.trim();
    const parentName = col4.replace(/\s+/g, ' ').trim();

    const studentLooksLikePhone =
      /^0?\d{8,11}[a-zA-Z]*$/.test(studentName.replace(/\s+/g, '')) &&
      !/[a-zA-ZÀ-ỹ]{2,}/.test(studentName);
    if (studentLooksLikePhone) {
      if (!rawPhone) {
        rawPhone = studentName;
      }
      const fallbackParent = parentName || 'Chưa rõ';
      warnings.push(
        `Dòng ${idx + 1} (${currentClass.code}): Cột Học sinh chứa SĐT "${studentName}" -> chuyển sang SĐT và đặt tên tạm "Học viên (PH ${fallbackParent})".`
      );
      studentName = `Học viên (PH ${fallbackParent})`;
    }

    if (!studentName) {
      if (parentName || rawPhone) {
        studentName = `Học viên (PH ${parentName || rawPhone})`;
        warnings.push(`Dòng ${idx + 1} (${currentClass.code}): Thiếu tên học sinh -> đặt tên tạm "${studentName}".`);
      } else {
        continue;
      }
    }

    const cleanedPhone = cleanBulkPhoneValue(rawPhone);
    if (cleanedPhone.warning) {
      warnings.push(`Dòng ${idx + 1} (${currentClass.code} - ${studentName}): ${cleanedPhone.warning}`);
    }

    const clsEntry = classesMap.get(currentClass.code)!;
    clsEntry.studentCount += 1;

    rawStudents.push({
      name: studentName,
      phone: cleanedPhone.phone,
      parentName,
      classCode: currentClass.code,
      classTitle: currentClass.title,
      schedule: currentClass.schedule,
      teacherKey: clsEntry.teacherKey,
      teacherDisplayName: clsEntry.teacherDisplayName,
      isArchived: currentClass.isArchived,
      rowIndex: idx + 1
    });
  }

  let nextTeacherSeq = Math.max(45, maxTeacherSeq + 1);
  const defaultPassword = String(options.defaultPassword || '12345678');

  const teachers: BulkImportParsedTeacher[] = [];
  for (const tEntry of teachersByKey.values()) {
    if (tEntry.preferredCode && tEntry.preferredEmail) {
      tEntry.code = tEntry.preferredCode;
      tEntry.email = tEntry.preferredEmail;
      tEntry.isExisting =
        existingCodeOrEmailSet.has(tEntry.preferredCode) ||
        existingCodeOrEmailSet.has(tEntry.preferredEmail) ||
        existingTeacherByKey.has(tEntry.key);
    } else {
      const existingMatch = existingTeacherByKey.get(tEntry.key);
      if (existingMatch && existingMatch.code && existingMatch.email) {
        tEntry.code = existingMatch.code;
        tEntry.email = existingMatch.email;
        tEntry.isExisting = true;
      } else {
        const code = `GV${String(nextTeacherSeq).padStart(3, '0')}`;
        const email = `${code.toLowerCase()}@khongtunhi.com`;
        nextTeacherSeq += 1;
        tEntry.code = code;
        tEntry.email = email;
        tEntry.isExisting = false;
      }
    }
    tEntry.defaultPassword = defaultPassword;
    teachers.push(tEntry);
  }
  teachers.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  for (const cls of classesMap.values()) {
    const tEntry = teachersByKey.get(cls.teacherKey);
    if (tEntry) {
      cls.teacherCode = tEntry.code;
      cls.teacherEmail = tEntry.email;
      cls.teacherDisplayName = tEntry.name;
    }
  }

  let nextStudentSeq = maxStudentSeq + 1;
  const students: BulkImportParsedStudent[] = rawStudents.map((stu) => {
    const stuClass = String(stu.classCode || '').trim().toUpperCase();
    const stuNormName = stripViAccents(String(stu.name || ''))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const stuPhone = String(stu.phone || '').trim();

    let matchedCand = existingStudentCandidates.find(
      (c) => !c.used && c.classCode === stuClass && c.normName === stuNormName && c.cleanPhone === stuPhone
    );
    if (!matchedCand) {
      matchedCand = existingStudentCandidates.find(
        (c) => !c.used && c.classCode === stuClass && c.normName === stuNormName && (!c.cleanPhone || !stuPhone)
      );
    }

    let code = '';
    let email = '';
    if (matchedCand) {
      matchedCand.used = true;
      code = matchedCand.code;
      email = matchedCand.email;
    } else {
      code = `2026${String(nextStudentSeq).padStart(4, '0')}`;
      email = `${code}@khongtunhi.com`;
      nextStudentSeq += 1;
    }

    const tEntry = teachersByKey.get(stu.teacherKey);
    return {
      code,
      email,
      name: stu.name,
      phone: stu.phone,
      parentName: stu.parentName,
      classCode: stu.classCode,
      classTitle: stu.classTitle,
      schedule: stu.schedule,
      teacherCode: tEntry?.code || '',
      teacherEmail: tEntry?.email || '',
      teacherName: tEntry?.name || stu.teacherDisplayName || 'Chưa phân công',
      status: stu.isArchived ? 'archived' : 'active',
      defaultPassword,
      rowIndex: stu.rowIndex
    };
  });

  const classes = Array.from(classesMap.values());
  return {
    classes,
    teachers,
    students,
    warnings,
    summary: {
      classCount: classes.length,
      activeClassCount: classes.filter((c) => !c.isArchived).length,
      archivedClassCount: classes.filter((c) => c.isArchived).length,
      teacherCount: teachers.length,
      studentCount: students.length,
      activeStudentCount: students.filter((s) => s.status !== 'archived').length,
      archivedStudentCount: students.filter((s) => s.status === 'archived').length,
      warningCount: warnings.length,
      defaultPassword
    }
  };
}

export const KTN_CENTER_SAMPLE_CSV: string = "LỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH\r\n\"LỘ MINI 23 · Chưa rõ nhóm\nT5 - CN 19H-20H\",Thùy,Trương Minh Khang,0983983320,diệp\r\n,,Trâm Anh,0965526556,Giang Mỹ zalo\r\n,,Bảo Anh,0902241199,BS Hà zalo\r\n\"LỘ MINI 23 · Nhóm 1\nT3 - T5: 20h-21h\",cô Lý Kim Anh,Hồng quân,0989530577,Doan Hai Yen\r\n,,Quang Huy,0888694686,Nguyễn Thị ÁnhTuyết\r\n\"LỘ MINI 23 · Nhóm 2\nT2-T4 19-20H\",DIỆU THẢO,Nguyễn Thảo Nguyên,0915641636,Kye Thu\r\n,,Bùi Minh Lâm,0347682336,HuyềnTrang\r\nLỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH\r\nLỘ 2 · Chưa rõ nhóm,,minh quang,0939926000,thái thuỷ hsk\r\n\"LỘ 2 · Nhóm 1\nT2-T4_ 20h-21h\",Dao Nhan,Minh Châu,0985788288,Tuyết Ngân\r\n,,uyển trân,,Phuong Luu\r\n,,Thiên HƯơng,0941240291,lily Nguyễn\r\n,,khang,0332244286,hanh tran\r\n\"LỘ 2 · Nhóm 2\nT2 - T4  20H-21H\",Đặng Thùy Dương,Gia Bảo,0972687781,Hồng\r\n,,Thiên đan,0978597071,Châu hồng nhiên\r\n,,Hà My,0904239820,Hoang Yen\r\n\"LỘ 2 · Nhóm 3\nT3-T5 19H-20H\",Thu Phương,nhật dương,0912992642,kim liên\r\n,,Phúc Long,0345142241,Lan Anhh\r\n,,hoàng bách,0973026573,tuyet dinh (zalo lộ 1)\r\n,,sam thai lam,0913787150,sam quyen\r\n,,Thùy Linh,0974404440,Huynh Thi Kim Oanh\r\n\"LỘ 2 · Nhóm 4\nT3-T5 19H-20H\",Quỳnh Chi,nguyễn ngọc như ý,0989113694,ngọc như\r\n,,Phương Nam,0902611068,Hien Pham\r\n,,Tê An Thy,0976940694,Huệ\r\n,,Gia Linh,0974131631,Thanh Thảo\r\n\"LỘ 2 · Nhóm 5\nT5-CN 20h-21h\",Thuý Hằng,An Thiên,0978355978,Huỳnh Cầm\r\n,,Hoàng Anh Tuấn,0399628222,Mai Huong\r\n,,Linh San,0977507517,Hoang uyen\r\n,,dương khánh nghi,0938080805,linda le\r\n\"LỘ 2 · Nhóm 6\nT3 - T5 -20H-21H\",Đỗ Bình,Trúc Anh,0936543123,Việt Hà\r\n,,Thượng Minh,0967362333,Lương Thị Hiền\r\n,,Phúc an,0984399518,Queenvet\r\n,,Gia bảo,0984451275,Hồng Thái\r\n\"LỘ 2 · Nhóm 7\nT2-T4 20H-21H\",,Tuệ Minh,0984645640,Bích Vân\r\n,,Bảo Nhi,0868347899,Quế\r\n,,lê bảo an,0943386476,lê thị tuyển\r\n,,Phương Trang,0365054226,Tạ Huyên\r\n\"LỘ 2 · Nhóm 8\nT2 - T4 _20-21H\",TRINH PHẠM,Lưu Khải Anh,0938498088,lan hương\r\n,,Bảo Khang,0905715079,Thanh\r\n,,Chí Công,0359661776,Trịnh Hằng\r\n,,Quỳnh Chi,0326932183,Nguyễn Thị Hường\r\n\"LỘ 2 · Nhóm 9\nT3 - T5 19-20H\",LINH CHI,Tiểu An,0931536319,Le sa nguyen\r\n,,Quang thanh,0949435386,Bùi thu hiền\r\n,,Gia Khang,0972427134,Trần Thị Hiên\r\n,,Tố Chi,0983855492,Băng Hy\r\n,,Lê Ngọc Diệp,0936639077,Nhung phạm\r\n,,Hương Giang,0969503330,Xuân Trang\r\n\"LỘ 2 · Nhóm 10\nT7 - CN 20-21H\",Diệu Thảo,Bùi Quang khải,0984959247,Bui Hoan\r\n,,Ngọc Mai,0985792886,Dr Tien Am Procare\r\n,,Huy hoàng,0975066334,Thuý liễu\r\n,,Phương đan,0349731786,Nguyệt hr\r\n,,Khánh linh,0986818678,Hong diep vu\r\n\"LỘ 2 · Nhóm 11\nT5 _20-21H\",Ánh Ly,bảo hân,0983118456,kim thành\r\n,,cát tiên,0985193183,ngô thuỷ\r\n,,Anh Khoa,0966444905,Dangthihuyentrinh\r\n,,Ngọc hà,0867627931,Tạ thị mai loan\r\n,,Phương Nghi,0931635835,Nguyễn Thuha\r\n,,Gia An,0986166534,Kỳ Duyên\r\n\"LỘ 2 · Nhóm 12\nT7- CN 20-21H\",Ánh Ly,Đoàn Minh Hà,0976514510,Cuc Tran\r\n,,Thảo Tiên,0966888628,dao le trang anh\r\n\"LỘ 2 · Nhóm 13\nT2 - T5 20-21H\",Thuỳ Dương,Lê Thảo Nghi Quân,0939814047,Oanh Oanh Thảo\r\n,,Thục Anh,0349734328,Alva\r\n,,Minh Khuê,0973819019,Liên Hà\r\n,,Nguyễn Ngọc Đăng,0976933833,\"Nguyễn Hằng,\"\r\n,,Bùi mỹ kỳ,0977677968,Sơn (zl sa my ky)\r\n\"LỘ 2 · Nhóm 14\nT2 - T4 20-21H\",Quỳnh Chi,Nguyễn trần trà my,0358130667,Trần Thị Quyên\r\n,,ĐINH HUỲNH THU NHIÊN,0918005654,Thường Huỳnh\r\n,,ngoc diep,0906021985,Chu Hong Nhung\r\n,,quỳnh nga,0352016869,Trần văn tân\r\n,,Vũ Tiến Đạt,0968305250,Nguyễn Thị Bốn\r\n,,Trần Minh Đăng,0971145995,Điêu ly\r\n\"LỘ 2 · Nhóm 15\nT2-T4 20H-21H\",Trần Phương Anh,Thuỳ Lâm,0933143388,xuan thu\r\n,,Nguyễn Phước An,0935414079,Dương Thị Thùy Trang\r\n,,Duy,0979905094,\"Trang Vo,\"\r\n,,Lê Đăng Minh Khôi,0965995878,Mymy\r\n,,trọng đạt,0937089560,Vân manu (zl)\r\n\"LỘ 2 · Nhóm 16\nT3-T5 20H-21H\",Trần Phương Anh,hồng ân,0919670677,châu oanh\r\n,,hoàng bách,0907512558,my thy\r\n,,Ngọc Ngân,0915641636,Kye Thu\r\n,,yến linh,0985132739,haiyen\r\n\"LỘ 2 · Nhóm 17\nT3-T5 20H-21H\",Ngọc,Nguyễn Mộc An Nhiên,0986414332,Nga Nguyễn\r\n,,Minh Đan,0912355718,LẠC VINH\r\n,,Trần Nhã Tuệ,0969445447,Hằng Phương\r\n\"LỘ 2 · Nhóm 18\nT4-T6 20H-21H\",,Hoàng Nhân,0944005568,Nhâm\r\n\"LỘ 2 · Nhóm 19\nT7-CN 20-21H\",Minh hà,vân trang,0945090907,Vân ANh\r\n,,Khôi,0976663664,Hồng Trang\r\n,,Trần Bích Phương,0974902347,In Bích Phương giang\r\n,,Lê hà an,0383222226,Mẹ của bin\r\n,,quang khải,0987871672,khanh khải nguyễn\r\n,,ĐƯC MINH,0984328776,TUYẾT NHI\r\n\"LỘ 2 · Nhóm 20\nT3-CN 20H-21H\",LINH CHI,Nhật Minh,0988435836,Nguyen Hien\r\n,,Ngọc diệp,0912754504,Hằng - Trăng Trên Trời\r\n,,An Mây,0858768613,Nguyễn Đắc Tuấn\r\n,,CaoThe Dan,0986969279,Nguyet Tsk Group\r\n,,Thanh Trà,0983723770,An Giapan\r\n\"LỘ 2 · Nhóm 21\nT2-T6 19H-20H\",Việt Linh,Nguyễn Hà Anh Tuấn,0799843660,Hà Phương\r\n,,Minh Trí,0376883199,Triệu huyền\r\n,,Nguyễn Lê Trung -,0919529269,Le Thuy Trang\r\n\"LỘ 2 · Nhóm 22\nT2-T4 20-21H\",Hiểu Linh,NHẬT NAM,0343327689,DƯƠNG THUÝ\r\n,,Trâm Anh,0984507509,Thuy Linh Nguyen\r\nLỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH\r\nLỘ 3 · Chưa rõ nhóm,Thu Phương,Linh Chi,0983340288,Long Hoàng\r\n,,uyên,0938612604,Teakhousedalat\r\n\"LỘ 3 · Nhóm 1\nT2-T4_20h-21h\",,Nam Anh,0989864485,Nguyễn Hà\r\n\"LỘ 3 · Nhóm 2\nTHỨ 4 - THỨ 6 _20H-21H\",cô Hằng,phương anh,0937169170,do thanh\r\n,,Thu Hà,0909023609,Thuỷ Tiên\r\n,,Tú Anh,0362514868,Vương Thu Hà Trần\r\n\"LỘ 3 · Nhóm 3\nTHỨ 7 - CHỦ NHẬT-20H-21H\",Ánh Nguyệt,Xuân Khánh,0332244286,Hạnh\r\n,,tuấn kiệt,0989459195,thúy nguyễn\r\n,,HÀ An,0912912844,Nguyễn thị Chi zl\r\n,,Đoàn Huệ Linh,,Vu Minh Phuong\r\n\"LỘ 3 · Nhóm 4\nT6-T7 19h-20h\",Duyên,Phạm Nghĩa,0963776238,Nguyên Thị Hằng\r\n,,Bảo Chi,0949030456,Nguyễn Thanh Huyền\r\n\"LỘ 3 · Nhóm 5\nT2 - T4 -20H-21H\",Nguyễn Hà,Xuân Hải,0788080078,Cao Thủy\r\n,,lâm,0981383999,thuỳ linh\r\n,,Tú Anh,0984899535,Xuyên Thảo\r\n\"LỘ 3 · Nhóm 6\nT3 - T5 -20H-21H\",Kim Ngân,Ngọc Anh,0983556529,teddy tuấn\r\n,,Phương Thảo,0932270388,Thuỳ Anh\r\n,,Nguyễn Huyền Trang,0973026573,vân\r\n,,Bảo Long,,thuý đinh\r\n,,Nguyễn Hoàng Quỳnh Anh,0938776877,Thu Trần\r\n,,Nguyễn Hoàng Anh Khôi,,Thu Trần\r\n\"LỘ 3 · Nhóm 7\nT7 - CN -20H-21H\",Thu Phương,Diệu Minh,0908399903,Thuy Diêu\r\n,,Nguyễn Ngọc Linh,0986736873,Hăng Trinh\r\n,,trần ngọc bảo nghi,0905414703,buingocbaovi\r\n,,Hà Anh,0368183608,Kylie Trần\r\n,,ngô quang vinh,0984744007,quang vinh\r\n\"LỘ 3 · Nhóm 8\nT4-T6 20H-21H\",minh ngọc,ngọc anh,0332244286,hanh tran\r\n,,đoàn ngọc diệp,0931635835,nguyen thu ha\r\n,,Hà My,0904239820,Hoang Yen\r\n\"LỘ 3 · Nhóm 9\nT3-T5 19H-20H\",Thu Phương,nhật dương,0912992642,kim liên\r\n,,Phúc Long,0345142241,Lan Anhh\r\n,,sam thai lam,0913787150,sam quyen\r\nLỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH\r\n\"LỘ 4 · Nhóm 1\nT5-T7 20-21H\",cô Linh Trang,Nguyễn phương thảo,,MinhDuc Nguyen\r\n,,Trang,,Đặng Huyên\r\n,,Nguyễn Trần Bảo Ngân,0938881882,Loura Tran\r\n,,Khang,0909189781,Quynh linh\r\n,,Hoài Anh,0988760655,Cao Nhung\r\n\"LỘ 4 · Nhóm 2\nT3 - T5 20H-21H\",Đinh Huyền,nguyễn hồng anh,0912807325,vân đàm zl ktn\r\n,,Uyên nhi,0937850606,Van\r\n,,An Nhiên,0978360104,Yến\r\n,,Nguyễn Lâm Vi Thảo,0842654654,Trần Vân\r\n,,Gia Thuận,0974478346,Kim Thao\r\n,,Nguyễn Đại Thành,0968234444,Tony hải\r\n\"LỘ 4 · Nhóm 3\nT7 -CN 19H - 20H\",linh chi,Hoàng Đỗ Bảo Nam,0979850967,đỗ thi gấm\r\n,,trần minh nhật,0388942212,thanh hà\r\n\"LỘ 4 · Nhóm 4\nT4 - T6_ 20H - 21H\",linh chi,Quỳnh như,0977260789,Hồ yến\r\n,,Mỹ Anh,0965494848,Mỹ Anh\r\n,,Khánh Tiên,0982593111,Lâm Hiền\r\n\"LỘ 4 · Nhóm 5\nT7 -CN 19H - 20H\",huyền,Hồ Lâm Bảo,0982493531,thu phương\r\n,,vũ linh lan,0915723236,kiều hạnh\r\n,,vũ linh đan,,kiều hạnh\r\n,,Phúc An,0988942509,Mai Phương\r\n,,Hoàng Tùng,0971606386,Thanh xuka\r\n\"LỘ 4 · Nhóm 6\nT2 -T4 20H - 21H\",CÔ LINH SCP,Mai Chi,,\r\n,,hoàng mai,0985960357,hang nlk\r\n\"LỘ 4 · Nhóm 7\nT3 - T6_ 20H - 21H\",thu phương,An,0382991541,Thu\r\n,,lâm hoàng,0842654654,Trần Vân\r\n,,Trần quang đăng,0386664056,Duyên Lê\r\n\"LỘ 4 · Nhóm 8\nT7-CN_20H-21H\",Bùi Huyền,Minh Nhiên,0907534168,Nguyễn Thị Kim Huyền\r\n,,song vũ,0905068118,8lylyly\r\n,,Thiên Ngân,,Lệ anh vlxd\r\n,,Tiến Đạt,0946184247,Minh Hằng\r\n,,Nguyễn Huỳnh Minh Tuấn,,áo cưới hoàng gia\r\n\"LỘ 4 · Nhóm 9\nT3-T5_20H-21H\",nguyen thi huyen,mĩ ái,0988364892,Cô chủ nhỏ\r\n,,Hiển Long,0907554193,Loan\r\nLỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH\r\n\"LỘ 5 · Nhóm 1\nT6 19h30-20h30 - CN 19h-20h\",cô Đặng Dương,Trần Xuân Gia Cát,0985710332,Vĩnh Trinh 永 贞\r\n,,Uyên,0961562640,anana\r\n,,Anh Khôi,0984864029,Nguyễn Thiêm\r\n,,Gia Khiêm,0945633055,Hồng Nhung Đại lý máy bay\r\n\"LỘ 5 · Nhóm 2\nT3 19h-20h -T7 20-21H\",Cô Thanh Huyền,Ngô Tú Anh,0963962946,Phương Thảo\r\n,,giáp anh,0334001122,Lemai Trang\r\n,,Lê Hoàng Ngân,0942818816,Hoang Yen\r\n\"LỘ 5 · Nhóm 3\nT2-T4 19H - 20H KG 23/6\",Cô Đặng Thùy Dương,Huyền an,,Pham Nguyet\r\n,,đoàn vy oanh,0982135313,đoàn phương\r\n\"LỘ 5 · Nhóm 4\nT2-T6 20-21H\",Hân Giang,Hoàng Minh Anh,0393309727,Thuỷ\r\n,,Bảo Trân,0965938648,mỹ mỹ\r\n,,Đoàn Lê Ngọc Quyên,0967549482,Bich Thuy Le\r\n,,ngọc hân,0973744086,ha anh\r\n,,Ngọc Hân,0939271125,Huynh Tran\r\n\"LỘ 5 · Nhóm 5\nT3 -T5 20-21H KG 22/7\",LÊ LÝ,Nguyễn ngọc minh thành,0339060500,NguyễnThu\r\n,,nguyễn xuÂN LỘC,0942252790,vũ thị hoà\r\nLỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH\r\n\"LỘ 6 · Nhóm 1\nT4-T6: 19h-20h\",CÔ THANH NGỌC,Gia Bảo,0343449592,Vũ Vân\r\n,,Lê ngọc uyên,0363570559,Ngoọc Uyên\r\n,,Hoài An,0972972158,Duyên Phạm\r\n,,Ngọc Anh,0901786268,Lương Thuỷ Lighting\r\n,,Lê Ngọc Bảo Anh,0912240079n,Lê Vân\r\n\"LỘ 6 · Nhóm 2\nT2-T6_20H-21H\",Đỗ Bình,Minh Trí,0976009238,Nguyễn Thị Tri Lí\r\n,,minh châu,,Như ý\r\n\"LỘ 6 · Nhóm 3\nT6_20-21H\",Cô Linh,Nguyễn Lê Phúc,0933162633,Lê Ngọc Phượng\r\n,,Sỹ Thượng,0982084565,Đoàn Thu\r\n,,Nhật Mai-,0904819909,Minh Thu\r\n,,Le tran khoi nguyen,0909712577,Vanessa Tran\r\n\"LỘ 6 · Nhóm 4\nT6 20-21H\",Khánh Linh,Nguyễn Minh Bảo,0975416725,Phạm Lan Anh\r\n,,Khánh nam,0989358591,Ngân khổng\r\n,,phương thảo,0888127557,thanh hoài\r\n,,Minh Tuệ,0939971672,Thao Trang tran\r\n,,Tư Hào,0973971313,Chuyên Gia Công Đèn Led Giá Sỉ\r\n\"LỘ 6 · Nhóm 5\nT2-T6 20-21H\",Cô Ánh Nguyệt,Châu Ngân,0902662669,Rose Hm\r\nLỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH\r\n\"LỘ 7 · Nhóm 1\n18h-18h30_T3-T5\",CÔ LINH SCP,Gia Linh,0979837352,Chu Thi Ha\r\n\"LỘ 7 · Nhóm 2\nT2-T7:20h-21h\",Nguyen Thi Huyen,Kim Tiến,0389578184,Nhã Nhà Đẹp\r\n,,Tuán tú,0986370792,Chung Trần\r\n,,Như Ý,0932099915,Phạm Thi Tuyet Nga\r\n,,Gia Khang,0972956722,Hà Vũ\r\n,,Trung Kiên,0978150289,Hoài Thương\r\n\"LỘ 7 · Nhóm 3\nT2-T7_20-21H\",CÔ THÙY DƯƠNG,ngọc hà,0336059998,Truonghuong\r\n,,Ngọc Anh,0936164789,zeny\r\n,,bùi thảo nguyên,0904471111,lê phương thuỷ\r\nLỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH\r\n\"HSK · Nhóm 1\nT5- CN lúc 20h-21h30\",Cô Tào Quỳnh,Minh Anh,0911837141,Thuy Ngan Nguyen\r\n,,Phước Huy,0938598887,Văn Thị Ngọc Hiệp\r\n,,Đăng Duy,0904093859,Nguyễn Thị Hạnh\r\n,,Minh Nhật,0976859069,Van Ngan\r\n,,Nhật Vương,0948201201,Phương Thuý\r\n,,thiên thư,0972999192,nguyen thu\r\n,,Minh Hưng,0962120685,Song Tử\r\n\"HSK · Nhóm 2\nT5 - CN : 20H-21H\",Cô Linh SCP,Kiều Khanh,,Thuyhang\r\n\"HSK · Nhóm 3\nT4- CN 20h-21h\",Cô Ngọc,Nguyễn Nhật Minh,0944019886,Bich Huyen\r\n,,Minh Khang,0903775402,Lý Hoàng\r\n\"HSK · Nhóm 4\nT3-5 lúc 20h-21h\",kim trang,Thanh Thanh,0944688512,Trang Võ\r\n,,Gia Hân,,Lan Anh\r\n\"HSK · Nhóm 5\nT4-T7:20h-21h\",Cô Lê Lý,Thiên Quang,0914190375,Thiện Quang\r\n,,Tuấn Kiệt,0389266859,Lien\r\n,,Gia Huy,0931595289,Thu Trang\r\n\"HSK · Nhóm 6\nT7-CN: 11H-12H\",CÔ LINH CHI,Chi Anh,0965467648,Linh\r\n,,Linh Nhiên,,\r\n\"HSK · Nhóm 7\nT3-5 lúc 20h-21h\",Cô Đặng Dương,Nhã Trúc,0367943791,Nguyễn Thị Dịu\r\n,,Duy Hoàng,0909525174,Minhminh\r\n\"HSK · Nhóm 8\nT3-T7 20h-21h30\",cô trang,hoàng dung,0389543748,hoàng hương\r\n,,nghiêm thanh vũ,0904499335,yến phạm\r\n\"HSK · Nhóm 9\nT2-T7 lúc 20h-21h\",Cô Tào Quỳnh,Thúy Hạnh,0388850700,Bich\r\n,,quỳnh lam,0902090239,Lưới thép hồng hà\r\n,,Kỳ Nam,0918268540,Tran Tran\r\n\"HSK · Nhóm 10\nT7-CN: 20h-21h\",CÔ ĐÀO NHẪN,Bảo Trân,0364780652,Dung Nguyen\r\n,,Hạnh My,0983732823,Hanh Nguyen Vo Ly\r\n\"HSK · Nhóm 11\nt6-CN lúc 19h-20h\",Cô Trâm,Khánh Huyền,0349611330,Nguyễn Chi\r\n,,Hải Anh,0917454021,Hồng Ân\r\n,,Vương Khanh,0914303014,Lê trang\r\n\"HSK · Nhóm 12\nT7-CN: 1h30-2h15\",Cô Đặng Dương,Hoàng Ân,0916587838,Tuyết Nhung\r\n\"HSK · Nhóm 13\nT3-T5 lúc 17h-18h\",Cô Đặng Dương,Thiên Thành,0909227186,BS Tú Anh\r\n,,Khánh Vân,0852858323,Phuong Nguyen\r\n,,Thái Hà,0902543404,Thái Hà Shop\r\n,,Huỳnh,0365385208,Trân\r\n,,Yến Phương,,Nguyễn Thanh Huê\r\n\"HSK · Nhóm 14\nT4-T7 lúc 20h-21h\",Cô Ngọc Anh,Quốc Bảo,0915222027,Kiều Chinh\r\n,,Bảo Anh,0963972350,Lê Huyên\r\n,,Bảo Anh,0904500984,Nguyễn Thị Nga\r\n\"HSK · Nhóm 15\nT3-T5 lúc 20h-21h\",Cô Nguyệt,Khánh Ly,0973438977,Hoa Hồng Xứ Lạ\r\n,,Trọng Nghĩa,0385216165,Huyền\r\n\"HSK · Nhóm 16\nT7 8H-10H\",cô Thuỳ,Anh Khôi,0773003068,Nguyễn Ngân\r\n,,Phước,0902396116d,Thanh Hang\r\n\"HSK · Nhóm 17\nT2-T6 lúc 19h-20h\",Cô Đỗ Bình,Minh Thư,0961880708,Hương Bùi\r\n,,ngọc diệp,0985795939,thuy dương dương\r\n,,Diệp Anh,0934633165,Nguyễn Cẩm Hương\r\n\"HSK · Nhóm 18\nT2 - T6 20H-21H30\",cô Việt Linh,hân,0974430859,võ phan tuyết hà\r\n,,bảo,,võ phan tuyết hà\r\n\"HSK · Nhóm 19\nT3-T5 20-21H\",Huyền,Nguyễn Thanh Quỳnh,,Hoàng Tâm\r\n,,Thùy Anh,0945263333,tạ thị thu hương\r\n\"HSK · Nhóm 20\nT4-CN: 19h-20h\",Hà Nguyễn,Thanh Phong,0909228021,Nguyễn Kim Phụng\r\n,,Mẫn Nhi,0372981915,Trinh Nguyễn\r\n,,Bảo Ngọc,0978940550,Cao Mai\r\n,,0948000580,,Vinh Trang\r\n,,0906390691,,Thanhtrang\r\n\"HSK · Nhóm 21\nTHỨ 7 - CN 20H-21H30\",cô thoa,914341531,,Hoàng Oanh\r\n,,985200061,,Đàm Quyên\r\n,,0982849198,,Âu Nga\r\nLỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH\r\n\"LỚP 1 BUỔI-TUẦN · Nhóm 1\nT7 9H30-10H30\",CÔ HUYỀN,Quế Chi,0393585717,Ngoc Uyển\r\n,,Thùy Linh,0963995814,Đào Thu Huệ\r\nLỚP 1 BUỔI-TUẦN · Nhóm 2,Thu Phương,Hà Anh,0987318668,Hoàng Hà\r\n,,Bảo Châu,0971068489,Khánh Đan\r\n\"LỚP 1 BUỔI-TUẦN · Nhóm 3\nT6 20h-21h\",cô Quỳnh Chi,Nam,0392150714,Phùng Hoa\r\n,,Nguyệt Ánh,0972160087,Vũ hằng\r\n,,Ngọc Bích,0985232235,Triệu Yến\r\n,,Phương Thuý,0979684498,Nguyễn Thị Thanh Phương\r\nLỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH\r\nLỚP 1-1 · Chưa rõ nhóm,Cô Cầm ( Bản Ngữ ),Yến,0918999163,Ni\r\n,,Huy,,\r\nLỚP 1-1 · Nhóm 1,Cô Linh Trang,Hưng,,\r\n\"LỚP 1-1 · Nhóm 2\nT2-T4\",Cô Chi,Hà My,0942998969,Thanh Nga\r\n\"LỚP 1-1 · Nhóm 3\nT3-T5\",Cô Lê Lý,Tú Anh,,\r\n\"LỚP 1-1 · Nhóm 5\nT2-T6\",Cô Hà,Khải Nguyên,0914711750,Nhuhuynh\r\n\"LỚP 1-1 · Nhóm 6\nHSK 4\",cô huyền,Đặng Hùng,0987080826,Phương Chi\r\n\"LỚP 1-1 · Nhóm 7\n20H -21H Thứ 5\",Quỳnh Chi,đức,0986944388,van khanh le\r\n\"LỚP 1-1 · Nhóm 8\nT2 -T7 19h-20h30\",hà thuỳ,uyên,0916762657,Luongnguyen Dulka\r\n\"LỚP 1-1 · Nhóm 9\nT4 - T6 18H - 19H30\",ngọc anh,doanh doanh,0916762657,\r\n\"LỚP 1-1 · Nhóm 10\nT2 18h30-19h30 T7 11h-12h\",nguyen thị huyền,Vĩnh Khang,0919669966,Diễm Hằng\r\n,,Ngọc Quyên,,\r\n\"LỚP 1-1 · Nhóm 11\nt2-t4 20h- 20h45\",hà my,đông phúc,0961562640,annas\r\n\"LỚP 1-1 · Nhóm 12\nt5-t7 18h-19h\",minh ngọc,Xu Khải Lạc,0916363669,Niki Tao\r\nLỚP 1-1 · Nhóm 13,thuỳ linh,Đoàn Nhật Minh,0931635835,Nguyễnthu Hà\r\n\"LỚP 1-1 · Nhóm 14\nt7-CN 20h-21h\",linh chi,hari,0909004501,thuỷ tiên\r\n,,Bảo Hân,0942899992,hoài linh\r\n\"LỚP 1-1 · Nhóm 15\nt4-t6 19h30-20h30\",vy,mai hồng,0989944427,mai thanh hoa\r\n\"LỚP 1-1 · Nhóm 16\n1-1_T3-T5_19H-20H\",Hoàng Hiền,Sỹ Huy,0774999368,Minh nguyệt\r\nLỚP 1-1 · Nhóm 17,Hồng Điệp,Phú Vinh,0917200725,Han nguyen\r\nLỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH\r\n\"BẢO LƯU · Nhóm 1\nT3, học 30p/buổi\",,Trà,,Vũ Mi\r\n,,Di Linh,,Ngân Ngân\r\n,,Khả Ái,,Lê Thị Ngọc Hạnh\r\n,,Nhật Toàn,,\"Một hai ba,\"\r\n,,gia phát,,Sm Saigondoor\r\n,,Phương Tuyên,,Phương Nhung Sushi\r\n,,Phạm Minh Quân,,Zin Kin\r\n,,Phúc An,,xuân hiền\r\n";
