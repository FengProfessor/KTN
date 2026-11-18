import type {
  ConsultationChannel,
  ConsultationLeadMeta,
  ConsultationQuickReply,
} from '@/types/ktn.types';
import type { AppLanguage } from '@/i18n';

const EMAIL_PII_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
const PHONE_PII_RE =
  /(?<![\d.,])(?:\(?\+?84\)?|\(?0)(?:[ .()-]*[1-9])(?:[ .()-]*\d){7,10}(?![\d.,]|\s*(?:đ|vnđ|vnd|k)(?![\p{L}\p{N}_]))/iu;
const URL_PII_RE = /(?:https?:\/\/|www\.)\S+/i;
const VN_PHONE_RE = /^(?:\+?84|0)(?:3|5|7|8|9)\d{8}$/;

export function detectConsultationExamplePii(text: string): {
  hasPii: boolean;
  reasons: string[];
} {
  const raw = String(text || '');
  const reasons: string[] = [];
  if (EMAIL_PII_RE.test(raw)) reasons.push('email');
  if (PHONE_PII_RE.test(raw)) reasons.push('phone');
  if (URL_PII_RE.test(raw)) reasons.push('url');
  return { hasPii: reasons.length > 0, reasons };
}

export function normalizeVnPhone(raw: string): string {
  const cleaned = String(raw || '').replace(/[()\s.-]/g, '').trim();
  if (cleaned.startsWith('+84')) return `0${cleaned.slice(3)}`;
  if (cleaned.startsWith('84') && cleaned.length >= 11) return `0${cleaned.slice(2)}`;
  return cleaned;
}

export function validateVnPhone(raw: string): boolean {
  const normalized = normalizeVnPhone(raw);
  return VN_PHONE_RE.test(normalized);
}

export function escapeCsvCell(value: unknown): string {
  let str = String(value ?? '');
  if (/^[\t\r\n ]*[=+\-@]|^[\t\r\n]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeReportToCsv(rows: unknown[][]): string {
  return (
    '\uFEFF' +
    rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\r\n')
  );
}

export function isSafeVietQrUrl(url?: string | null): boolean {
  const clean = String(url || '').trim();
  if (!clean) return false;
  try {
    return new URL(clean).origin === 'https://img.vietqr.io';
  } catch {
    return false;
  }
}

export function extractVietQrUrlFromBody(body?: string | null): string | null {
  const raw = String(body || '');
  const match = raw.match(/https:\/\/img\.vietqr\.io\/\S+/i);
  if (!match) return null;
  const candidate = match[0].replace(/[),.;]+$/, '');
  return isSafeVietQrUrl(candidate) ? candidate : null;
}

export function formatVnDateTime(iso?: string | null, lang?: AppLanguage): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return String(iso);
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString();
  }
}

export function toVnDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const vnMs = ts + 7 * 60 * 60 * 1000;
  return new Date(vnMs).toISOString().slice(0, 16);
}

export function fromVnDatetimeLocalValue(localValue: string): string | null {
  const clean = String(localValue || '').trim();
  if (!clean) return null;
  const parsed = Date.parse(`${clean}:00+07:00`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function getChannelBadgeMeta(channel?: ConsultationChannel | string | null): {
  label: string;
  badgeClass: string;
} {
  if (channel === 'zalo_oa') {
    return {
      label: 'Zalo OA',
      badgeClass: 'bg-sky-100 text-sky-900 border-sky-200',
    };
  }
  if (channel === 'messenger') {
    return {
      label: 'Messenger',
      badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-200',
    };
  }
  return {
    label: 'Web Chat',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  };
}

export interface AdultWorking11Info {
  matched: boolean;
  isChildExcluded: boolean;
  adPackage: '963k' | '1500k' | 'general' | null;
  packageLabel: string;
  steps: Array<{
    step: number;
    titleVi: string;
    titleEn: string;
    promptVi: string;
    promptEn: string;
  }>;
  forbiddenClaims: string[];
}

export function detectAdultWorking11Context(
  combinedText: string,
  leadMeta?: ConsultationLeadMeta | null,
  sourceTag?: string | null
): AdultWorking11Info {
  const raw = String(combinedText || '').toLowerCase();
  const tag = String(sourceTag || leadMeta?.ad_source || '').toLowerCase();

  const hasChildMarker =
    /(?<![\p{L}\p{N}_])(?:(?:con|bé|cháu)\s+(?:của\s+)?(?:nhà\s+)?(?:chị|em|mình|tôi|anh)|cho\s+(?:bé|con|cháu)|(?:bé|con|cháu)\s+(?:nhà\s+mình|muốn|cần|học)|\d{1,2}\s*tuổi|tiểu học|học sinh)(?![\p{L}\p{N}_])/iu.test(
      raw
    ) && !/(?<![\p{L}\p{N}_])người đi làm(?![\p{L}\p{N}_])/iu.test(raw);

  const hasAdultAdMarker =
    tag.includes('963') ||
    tag.includes('1500') ||
    tag.includes('adult') ||
    /(?<![\p{L}\p{N}_.,])(?:963k|963\.000đ?|1\.?500k|1\.500\.000đ?|người đi làm|1\s*kèm\s*1\s*(?:cho\s*)?(?:người lớn|người đi làm)|giao tiếp công việc)(?![\p{L}\p{N}_]|[.,]\d)/iu.test(
      raw
    );

  const adPackage: AdultWorking11Info['adPackage'] =
    tag.includes('1500') ||
    /(?<![\p{L}\p{N}_.,])(?:1\.?500k|1\.500\.000đ?|chuyên sâu)(?![\p{L}\p{N}_]|[.,]\d)/iu.test(raw)
      ? '1500k'
      : tag.includes('963') ||
        /(?<![\p{L}\p{N}_.,])(?:963k|963\.000đ?|cơ bản)(?![\p{L}\p{N}_]|[.,]\d)/iu.test(raw)
      ? '963k'
      : hasAdultAdMarker
      ? 'general'
      : null;

  const matched = hasAdultAdMarker && !hasChildMarker;

  const packageLabel =
    adPackage === '1500k'
      ? 'Gói Chuyên sâu 1.500.000đ/tháng (8 buổi/tháng)'
      : adPackage === '963k'
      ? 'Gói Cơ bản 963.000đ/tháng (8 buổi/tháng)'
      : 'Lộ trình Người đi làm 1:1';

  return {
    matched,
    isChildExcluded: hasChildMarker,
    adPackage,
    packageLabel,
    steps: [
      {
        step: 1,
        titleVi: '1. Hỏi mục tiêu công việc',
        titleEn: '1. Ask work goal',
        promptVi:
          'Anh/chị đang cần tiếng Trung cho mục tiêu công việc nào (giao tiếp công sở, làm việc với đối tác, đọc viết hay thi HSK)?',
        promptEn:
          'What work goal do you need Chinese for (office communication, partners, reading/writing, or HSK)?',
      },
      {
        step: 2,
        titleVi: '2. Hỏi nền tảng hiện tại',
        titleEn: '2. Ask current level',
        promptVi:
          'Hiện tại anh/chị đã học qua phần phiên âm/chữ Hán hay từng học đến trình độ nào rồi ạ?',
        promptEn:
          'Have you learned Pinyin/characters yet, or what level have you studied up to?',
      },
      {
        step: 3,
        titleVi: '3. Gợi ý bước tiếp theo phù hợp',
        titleEn: '3. Suggest matching package',
        promptVi:
          adPackage === '1500k'
            ? 'Với mục tiêu chuyên sâu/cấp tốc của anh/chị, gói Chuyên sâu 1.500.000đ/tháng (8 buổi) sẽ phù hợp; nếu học đều từ nền tảng có thể cân nhắc gói Cơ bản 963.000đ/tháng (8 buổi).'
            : 'Với nhu cầu bắt đầu/xây nền tảng đều đặn, gói Cơ bản 963.000đ/tháng (8 buổi) là phù hợp (chỉ nâng lên gói Chuyên sâu 1.500k khi mục tiêu công việc thực sự cần).',
        promptEn:
          'Recommend Basic 963,000đ/month (8 sessions) for steady foundations; only suggest Intensive 1,500,000đ/month when work goals require it.',
      },
      {
        step: 4,
        titleVi: '4. Xin khung giờ rảnh để xếp lịch',
        titleEn: '4. Capture available timeslot',
        promptVi:
          'Anh/chị rảnh khung giờ nào vào buổi tối hoặc cuối tuần để bên em kiểm tra lịch trống phù hợp ạ?',
        promptEn:
          'Which evening or weekend timeslots work best for you so we can check teacher availability?',
      },
    ],
    forbiddenClaims: [
      '80% thực hành',
      'đầu ra sau 8 buổi',
      'rút ngắn một nửa thời gian',
    ],
  };
}

export type WebChatbotMenuKey =
  | 'MENU_ROOT'
  | 'MENU_FAQ'
  | 'MENU_NEED_PHONE'
  | 'MENU_PAYMENT'
  | 'MENU_HANDOFF';

export function buildQuickReplyMenu(
  menuKey: WebChatbotMenuKey = 'MENU_ROOT',
  lang: AppLanguage = 'vi'
): ConsultationQuickReply[] {
  if (menuKey === 'MENU_FAQ') {
    return [
      {
        id: 'faq_kids',
        label: lang === 'en' ? 'Kids Roadmap (YCT/Kids)' : 'Lộ trình trẻ em (YCT / Kids)',
        payload: 'Lộ trình học cho trẻ em như thế nào?',
        action: 'MENU_FAQ_KIDS',
      },
      {
        id: 'faq_adult',
        label: lang === 'en' ? 'Working Adults 1:1' : 'Tiếng Trung người đi làm 1:1',
        payload: 'Tư vấn gói học 1 kèm 1 cho người đi làm',
        action: 'MENU_FAQ_ADULT',
      },
      {
        id: 'faq_exam',
        label: lang === 'en' ? 'HSK / YCT Exam Prep' : 'Lịch & lộ trình thi HSK/YCT',
        payload: 'Lịch thi và lộ trình ôn thi HSK/YCT như thế nào?',
        action: 'MENU_FAQ_EXAM',
      },
      {
        id: 'back_root',
        label: lang === 'en' ? 'Back to main menu' : 'Quay lại menu chính',
        payload: 'MENU_ROOT',
        action: 'MENU_ROOT',
      },
    ];
  }

  if (menuKey === 'MENU_NEED_PHONE') {
    return [
      {
        id: 'need_kids',
        label: lang === 'en' ? 'For my child (5-12y)' : 'Tìm lớp cho bé (5-12 tuổi)',
        payload: 'Tôi muốn tìm lớp cho bé',
        action: 'MENU_NEED_PHONE',
      },
      {
        id: 'need_adult',
        label: lang === 'en' ? 'For working adult' : 'Tôi là người đi làm',
        payload: 'Tôi là người đi làm cần học tiếng Trung',
        action: 'MENU_NEED_PHONE',
      },
      {
        id: 'back_root',
        label: lang === 'en' ? 'Main menu' : 'Menu chính',
        payload: 'MENU_ROOT',
        action: 'MENU_ROOT',
      },
    ];
  }

  if (menuKey === 'MENU_PAYMENT') {
    return [
      {
        id: 'pay_guide',
        label: lang === 'en' ? 'Create VietQR order' : 'Tạo đơn & mã VietQR ngay',
        payload: 'OPEN_ORDER_FORM',
        action: 'OPEN_ORDER_FORM',
      },
      {
        id: 'handoff',
        label: lang === 'en' ? 'Talk to advisor' : 'Gặp tư vấn viên',
        payload: 'Tôi muốn gặp tư vấn viên',
        action: 'MENU_HANDOFF',
      },
      {
        id: 'back_root',
        label: lang === 'en' ? 'Main menu' : 'Menu chính',
        payload: 'MENU_ROOT',
        action: 'MENU_ROOT',
      },
    ];
  }

  return [
    {
      id: 'root_courses',
      label: lang === 'en' ? 'Choose Course & FAQ' : 'Chọn khóa học & FAQ',
      payload: 'Cho tôi xem các khóa học và lộ trình phù hợp',
      action: 'MENU_FAQ',
    },
    {
      id: 'root_need_phone',
      label: lang === 'en' ? 'Leave Need & Phone' : 'Để lại nhu cầu & SĐT',
      payload: 'Tôi muốn để lại nhu cầu học và số điện thoại để được tư vấn',
      action: 'MENU_NEED_PHONE',
    },
    {
      id: 'root_payment',
      label: lang === 'en' ? 'Tuition & VietQR Guide' : 'Học phí & Hướng dẫn VietQR',
      payload: 'Hướng dẫn học phí và thanh toán chuyển khoản VietQR',
      action: 'MENU_PAYMENT',
    },
    {
      id: 'root_handoff',
      label: lang === 'en' ? 'Meet Human Advisor' : 'Gặp tư vấn viên',
      payload: 'Tôi muốn gặp tư vấn viên KTN hỗ trợ trực tiếp',
      action: 'MENU_HANDOFF',
    },
  ];
}
