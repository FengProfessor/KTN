import type { ChatMessage, ChatRoom, PinnedAnnouncement } from '@/features/chat/types/chat.types';
import type {
  KtnClassItem,
  KtnClassSession,
  KtnCourse,
  KtnHomework,
  KtnLessonUnit,
  KtnNotification
} from '@/types/ktn.types';

export const DEMO_CHAT_ROOMS: ChatRoom[] = [
  {
    roomId: 'class:YCT2-04',
    type: 'class',
    classCode: 'YCT2-04',
    teacherName: 'Cô Lâm Mỹ Linh',
    label: 'Lớp YCT 2 — Ca tối Thứ 3 & Thứ 6',
    shortLabel: 'Lớp YCT2-04',
    lastMessage: 'Cô Lâm Mỹ Linh: Cô gửi phiếu ôn tập chữ Hán Buổi 18 nhé!',
    lastSenderName: 'Cô Lâm Mỹ Linh',
    lastSenderRole: 'teacher',
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    unreadCount: 2,
    unread: true,
    memberCount: 16
  },
  {
    roomId: 'course:6adadba969897b0002482ca5',
    type: 'course',
    courseId: '6adadba969897b0002482ca5',
    teacherName: 'Ban Giảng Huấn KTN',
    label: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
    shortLabel: 'Khóa HSK1 3.0',
    lastMessage: 'Bé Nguyễn Hoàng Ngân: Con vừa nộp bài thu âm Bài 2 ạ!',
    lastSenderName: 'Bé Nguyễn Hoàng Ngân',
    lastSenderRole: 'student',
    updatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    unreadCount: 0,
    unread: false,
    memberCount: 48
  },
  {
    roomId: 'student:hoangngan@khongtunhi.com',
    type: 'student',
    studentEmail: 'hoangngan@khongtunhi.com',
    studentName: 'Bé Nguyễn Hoàng Ngân',
    teacherName: 'Cô Lâm Mỹ Linh',
    label: 'Cô Lâm Mỹ Linh (Trao đổi 1-1)',
    shortLabel: 'Cô Lâm Mỹ Linh',
    lastMessage: 'Cô đã chấm bài Buổi 1 của Ngân đạt 9.5/10 điểm nhé mẹ!',
    lastSenderName: 'Cô Lâm Mỹ Linh',
    lastSenderRole: 'teacher',
    updatedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    unreadCount: 1,
    unread: true,
    memberCount: 2
  }
];

export const DEMO_PINNED_ANNOUNCEMENT: PinnedAnnouncement = {
  roomId: 'class:YCT2-04',
  content:
    '[DEMO] Lịch học cố định: 19:30 Thứ 3 & Thứ 6. Các con hoàn thành bài thu âm hội thoại trang 12 trước 18:00 hôm nay nhé!',
  pinnedBy: 'Cô Lâm Mỹ Linh',
  updatedAt: new Date(Date.now() - 3600 * 1000).toISOString()
};

export const DEMO_RICH_MESSAGES: ChatMessage[] = [
  {
    id: 'DEMO-MSG-01',
    room_id: 'class:YCT2-04',
    class_code: 'YCT2-04',
    sender_email: 'linh.lam@khongtunhi.com',
    sender_name: 'Cô Lâm Mỹ Linh',
    sender_role: 'teacher',
    content:
      'Chào ba mẹ và các con lớp YCT2-04! Cô gửi tài liệu PDF tóm tắt từ vựng và bảng nét chữ Hán Buổi 18 để các con ôn tập nhé.',
    attachment: {
      kind: 'pdf',
      url: 'https://d21acfi38wn3iy.cloudfront.net/materials/yct2-04-lesson18.pdf',
      name: 'Phieu_On_Tap_Buoi_18_YCT2.pdf',
      sizeLabel: '1.8 MB'
    },
    reactions: [{ emoji: '❤️', count: 4, users: ['PH Hoàng Ngân', 'PH An Mẫn'] }],
    created_at: new Date(Date.now() - 86400 * 1000 - 3600 * 1000).toISOString(),
    status: 'seen'
  },
  {
    id: 'DEMO-MSG-02',
    room_id: 'class:YCT2-04',
    class_code: 'YCT2-04',
    sender_email: 'linh.lam@khongtunhi.com',
    sender_name: 'Cô Lâm Mỹ Linh',
    sender_role: 'teacher',
    content: 'Các con nghe mẫu phát âm 4 câu hội thoại của cô dưới đây rồi luyện đọc theo nhé:',
    attachment: {
      kind: 'audio',
      url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-1.mp3',
      name: 'Ghi_am_mau_Co_Linh_Buoi18.mp3',
      sizeLabel: '240 KB',
      durationSec: 18
    },
    reactions: [{ emoji: '👏', count: 3, users: ['PH Hoàng Ngân'] }],
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    status: 'seen'
  },
  {
    id: 'DEMO-MSG-03',
    room_id: 'class:YCT2-04',
    class_code: 'YCT2-04',
    sender_email: 'hoangngan@khongtunhi.com',
    sender_name: 'Bé Nguyễn Hoàng Ngân',
    sender_role: 'student',
    content: 'Dạ con chào cô Linh! Con gửi ảnh vở luyện viết chữ Hán bài hôm nay cho cô xem trước ạ.',
    replyTo: {
      id: 'DEMO-MSG-01',
      senderName: 'Cô Lâm Mỹ Linh',
      content: 'Chào ba mẹ và các con lớp YCT2-04! Cô gửi tài liệu PDF tóm tắt từ vựng...'
    },
    attachment: {
      kind: 'image',
      url: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/thumbnail.jpg',
      name: 'Vo_luyen_viet_Hoang_Ngan_B18.jpg',
      sizeLabel: '420 KB'
    },
    reactions: [{ emoji: '👍', count: 2, users: ['Cô Lâm Mỹ Linh'] }],
    created_at: new Date(Date.now() - 1800 * 1000).toISOString(),
    status: 'seen'
  },
  {
    id: 'DEMO-MSG-04',
    room_id: 'class:YCT2-04',
    class_code: 'YCT2-04',
    sender_email: 'linh.lam@khongtunhi.com',
    sender_name: 'Cô Lâm Mỹ Linh',
    sender_role: 'teacher',
    content: 'Nét sổ và nét phẩy của Ngân hôm nay đều tay lắm! Tối nay vào lớp cô thưởng sao cho con nhé.',
    created_at: new Date(Date.now() - 300 * 1000).toISOString(),
    status: 'delivered'
  }
];

export const DEMO_NOTIFICATIONS: KtnNotification[] = [
  {
    id: 'DEMO-NOTIF-1',
    type: 'homework_graded',
    classCode: 'YCT2-04',
    homeworkId: 'HW-hoangngan@khongtunhi.com-6adadba969897b0002482ca5-L1',
    courseId: '6adadba969897b0002482ca5',
    lessonNum: 1,
    title: 'Cô Linh vừa chấm bài của con',
    body: 'Lớp YCT2-04 · Bài 1: AI小语，你好！ · 9,5/10 điểm',
    actionUrl: '/learning/6adadba969897b0002482ca5/lesson/1?tab=homework',
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    read: false
  },
  {
    id: 'DEMO-NOTIF-2',
    type: 'chat_message',
    classCode: 'YCT2-04',
    roomId: 'class:YCT2-04',
    title: 'Tin nhắn mới từ Cô Lâm Mỹ Linh',
    body: 'Lớp YCT2-04: Cô gửi phiếu ôn tập chữ Hán Buổi 18 để các con ôn tập nhé.',
    actionUrl: '/chat?room=class:YCT2-04',
    createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    read: false
  },
  {
    id: 'DEMO-NOTIF-3',
    type: 'homework_assigned',
    classCode: 'YCT2-04',
    lessonNum: 2,
    title: 'Cô giáo giao bài tập mới',
    body: 'Lớp YCT2-04 · Buổi 2: Thu âm giới thiệu các thành viên trong gia đình',
    actionUrl: '/classrooms/YCT2-04?session=2',
    createdAt: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
    read: true
  }
];

export const DEMO_COURSES: KtnCourse[] = [
  {
    id: '6adadba969897b0002482ca5',
    code: 'HSK1-30',
    title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
    shortTitle: 'HSK1 3.0',
    badge: 'TIÊU CHUẨN MỚI 3.0',
    ageGroup: 'Mọi lứa tuổi',
    lessonsCount: 15,
    price: 890000,
    oldPrice: 1500000,
    description:
      'Chương trình HSK 3.0 chuẩn 9 cấp mới nhất với giáo trình in màu, sách bài tập và luyện phát âm AI.',
    thumb:
      'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/thumbnail.jpg',
    demoVideoUrl:
      'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/playlist.m3u8',
    demoDurationSeconds: 90,
    lessonSample: 'Bài 1: AI小语，你好！ (Xin chào AI Tiểu Ngữ!)'
  },
  {
    id: '65e7704a9ea90c00080d5195',
    code: 'CFK-01',
    title: 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)',
    shortTitle: 'Chinese For Kids',
    badge: 'SONG NGỮ MẦM NON',
    ageGroup: '5 – 6 tuổi',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000,
    description:
      'Làm quen tiếng Trung qua bài hát, thẻ hình màu sắc và trò chơi phản xạ vui nhộn cho bé 5–6 tuổi.',
    thumb:
      'https://d21acfi38wn3iy.cloudfront.net/resource/products/3529cd2b-7af6-4fda-887c-392a79393d6a/d897c847-ccff-497c-bfeb-b495cebf2398.jpg',
    demoVideoUrl:
      'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/65e7dc7a8d4bf50008e77f7d/playlist.m3u8',
    demoDurationSeconds: 90,
    lessonSample: 'Bài 1: 你好 (Xin chào)'
  },
  {
    id: '65e7db908d4bf50008e77f4d',
    code: 'YCT1-01',
    title: 'Chinh phục YCT 1 cho học sinh Tiểu học',
    shortTitle: 'YCT 1',
    badge: 'TIỂU HỌC YCT 1',
    ageGroup: '6 – 8 tuổi',
    lessonsCount: 11,
    price: 890000,
    oldPrice: 1500000,
    description:
      'Nền tảng giao tiếp và 80 từ vựng chuẩn kỳ thi quốc tế YCT Cấp độ 1 dành cho học sinh Tiểu học.',
    thumb:
      'https://d21acfi38wn3iy.cloudfront.net/resource/products/3529cd2b-7af6-4fda-887c-392a79393d6a/07a5f32d-4c8f-4484-8fd2-a6df8fb5d102.jpg',
    demoVideoUrl:
      'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/65e81f708d4bf50008e78355/playlist.m3u8',
    demoDurationSeconds: 90,
    lessonSample: 'Bài 1: 你好 (Xin chào thầy cô và bạn bè)'
  },
  {
    id: '65f97e129f6493000825ef48',
    code: 'HSK1-20',
    title: 'Khóa học HSK 1 (Giáo trình chuẩn Hán ngữ)',
    shortTitle: 'HSK1 Chuẩn',
    badge: 'GIÁO TRÌNH CHUẨN',
    ageGroup: 'THCS & Người lớn',
    lessonsCount: 15,
    price: 890000,
    oldPrice: 1500000,
    description:
      'Lộ trình 15 bài Giáo trình chuẩn HSK 1 giúp nắm vững 150 từ vựng và ngữ pháp nền tảng.',
    thumb: null,
    demoVideoUrl: null,
    demoDurationSeconds: 0,
    lessonSample: 'Bài 1: 你好 (Xin chào)'
  }
];

export const DEMO_CLASSES: KtnClassItem[] = [
  {
    id: 'YCT2-04',
    name: 'Lớp YCT 2 — Ca tối Thứ 3 & Thứ 6',
    teacher_code: 'GV-KTN-08',
    teacher_email: 'linh.lam@khongtunhi.com',
    teacher_name: 'Cô Lâm Mỹ Linh',
    schedule: '19:30 Thứ 3 & Thứ 6',
    total_lessons: 25,
    current_lesson: 18,
    active: true
  }
];

export const DEMO_CLASS_SESSIONS: KtnClassSession[] = [
  {
    id: 'YCT2-04-B1',
    classCode: 'YCT2-04',
    session_num: 1,
    sessionNum: 1,
    session_title: 'Buổi 1: Hỏi thăm sức khỏe & Số đếm 1–20',
    title: 'Buổi 1: Hỏi thăm sức khỏe & Số đếm 1–20',
    exercises: [
      {
        id: 'YCT2-04-B1-E1',
        num: 1,
        title: 'Bài 1: Thu âm đọc 5 câu hội thoại hỏi thăm sức khỏe (Trang 12)',
        prompt: 'Con bấm Thu âm đọc rõ từng câu hội thoại trong sách giáo khoa trang 12 rồi bấm Nộp bài cho cô nhé.',
        type: 'audio'
      },
      {
        id: 'YCT2-04-B1-E2',
        num: 2,
        title: 'Bài 2: Chụp ảnh vở viết chữ Hán bài 1 (你, 好, 我, 叫)',
        prompt: 'Con viết mỗi chữ 1 dòng vào vở ô mễ, sau đó chụp ảnh đính kèm gửi cô chấm nét chữ nhé.',
        type: 'photo'
      }
    ]
  }
];

export const DEMO_LESSONS: KtnLessonUnit[] = [
  {
    _id: '6adadbcaf75fe5000247ca71',
    id: '6adadbcaf75fe5000247ca71',
    unitId: '6adadbcaf75fe5000247ca71',
    num: 1,
    lessonNumber: 1,
    partNumber: null,
    partLabel: null,
    unitType: 'lesson',
    rawTitle: 'HSK1_Bài 1',
    course: '6adadba969897b0002482ca5',
    title: 'Bài 1: AI小语，你好！ — Xin chào AI Tiểu Ngữ!',
    titleZh: 'AI小语，你好！',
    titleVi: 'Xin chào AI Tiểu Ngữ!',
    grammar: 'Lời chào hỏi cơ bản, Đại từ xưng hô 你 (Bạn), 我 (Tôi), 您 (Ngài)',
    duration: '13:35',
    sgkPage: 17,
    sbtPage: 11,
    voVietPage: 1,
    type: 'video',
    video: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/playlist.m3u8',
    streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/playlist.m3u8',
    posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/thumbnail.jpg',
    audioTracks: [
      {
        name: 'Bài khóa 1 — MP3 01-1',
        url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-1.mp3',
        category: 'sgk'
      },
      {
        name: 'Từ mới — MP3 01-2',
        url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-2.mp3',
        category: 'vocab'
      },
      {
        name: 'Luyện nghe SBT Bài 1 — Phần 1',
        url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/01-1.mp3',
        category: 'sbt'
      }
    ],
    materials: [
      {
        id: 'hsk1-L1-sgk',
        title: 'SGK HSK 1 (3.0) — Bài 1 (Trang 17)',
        category: 'sgk_pdf',
        url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/pdf/sgk-hsk1.pdf#page=17',
        baseUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/pdf/sgk-hsk1.pdf',
        page: 17,
        size: 38196973,
        mime: 'application/pdf',
        actionLabel: 'Xem sách (Trang 17)',
        httpStatus: 200
      },
      {
        id: 'hsk1-L1-sbt',
        title: 'Sách Bài Tập HSK 1 (3.0) — Bài 1 (Trang 11)',
        category: 'sbt_pdf',
        url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/pdf/sbt-hsk1.pdf#page=11',
        baseUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/pdf/sbt-hsk1.pdf',
        page: 11,
        size: 16210150,
        mime: 'application/pdf',
        actionLabel: 'Xem bài tập (Trang 11)',
        httpStatus: 200
      },
      {
        id: 'hsk1-L1-voviet',
        title: 'Vở tập viết chữ Hán HSK 1 — Bài 1 (Trang 1)',
        category: 'voviet_pdf',
        url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/pdf/vo-tap-viet-hsk1.pdf#page=1',
        baseUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/pdf/vo-tap-viet-hsk1.pdf',
        page: 1,
        size: 866739,
        mime: 'application/pdf',
        actionLabel: 'Xem / Tải vở viết (Trang 1)',
        httpStatus: 200
      }
    ],
    homeworkAssignment: {
      assigned: true,
      mandatory: true,
      title: 'Bài tập Bài 1: AI小语，你好！ (Xin chào AI Tiểu Ngữ!)',
      instructions:
        '1. Nghe MP3 Bài khóa 1 (Trang 17 SGK) và thu âm đọc to đoạn hội thoại chào hỏi 你好 / 您好.\n2. Luyện viết chữ Hán Bài 1 trong Vở tập viết (Trang 1) hoặc làm Sách bài tập (Trang 11), chụp ảnh hoặc đính kèm tệp gửi giáo viên.',
      relatedPages: 'SGK trang 17 • SBT trang 11 • Vở tập viết trang 1',
      allowedTypes: ['audio', 'image', 'pdf', 'text'],
      maxFiles: 3,
      deadline: null,
      completionCriteria: 'Thu âm phát âm rõ thanh điệu hoặc nộp ảnh bài viết/SBT rõ nét để giáo viên nhận xét.'
    },
    workbookTitle: 'SBT Bài 1: AI小语，你好！'
  },
  {
    _id: '6adadc3b69897b0002482d22',
    id: '6adadc3b69897b0002482d22',
    unitId: '6adadc3b69897b0002482d22',
    num: 2,
    lessonNumber: 2,
    partNumber: null,
    partLabel: null,
    unitType: 'lesson',
    rawTitle: 'HSK1_Bài 2',
    course: '6adadba969897b0002482ca5',
    title: 'Bài 2: 我叫李文 — Mình tên là Lý Văn',
    titleZh: '我叫李文',
    titleVi: 'Mình tên là Lý Văn',
    grammar: 'Hỏi tên với 什么名字, Động từ 叫 (Tên là), Họ và tên tiếng Trung',
    duration: '12:00',
    sgkPage: 23,
    sbtPage: 17,
    voVietPage: 9,
    type: 'video',
    video: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadd60f8c3c60002a2b3c2/playlist.m3u8',
    streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadd60f8c3c60002a2b3c2/playlist.m3u8',
    posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadd60f8c3c60002a2b3c2/thumbnail.jpg',
    audioTracks: [
      {
        name: 'Bài khóa 1 — MP3 02-1',
        url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/02-1.mp3',
        category: 'sgk'
      }
    ],
    materials: [
      {
        id: 'hsk1-L2-sgk',
        title: 'SGK HSK 1 (3.0) — Bài 2 (Trang 23)',
        category: 'sgk_pdf',
        url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/pdf/sgk-hsk1.pdf#page=23',
        baseUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/pdf/sgk-hsk1.pdf',
        page: 23,
        size: 38196973,
        mime: 'application/pdf',
        actionLabel: 'Xem sách (Trang 23)',
        httpStatus: 200
      }
    ],
    homeworkAssignment: {
      assigned: true,
      mandatory: true,
      title: 'Bài tập Bài 2: 我叫李文 (Mình tên là Lý Văn)',
      instructions:
        '1. Thu âm tự giới thiệu họ tên bằng mẫu câu 我叫... và hỏi tên bạn bằng 你叫什么名字？\n2. Chụp ảnh trang Vở tập viết (Trang 9) hoặc Sách bài tập (Trang 17) đã hoàn thành.',
      relatedPages: 'SGK trang 23 • SBT trang 17 • Vở tập viết trang 9',
      allowedTypes: ['audio', 'image', 'pdf', 'text'],
      maxFiles: 3,
      deadline: null,
      completionCriteria: 'Thu âm rõ ràng và viết đúng thứ tự nét chữ Hán.'
    },
    workbookTitle: 'SBT Bài 2: 我叫李文'
  }
];

export const DEMO_HOMEWORKS: KtnHomework[] = [
  {
    id: 'HW-hoangngan@khongtunhi.com-6adadba969897b0002482ca5-L1',
    student_code: 'KTN-2026-089',
    student_email: 'hoangngan@khongtunhi.com',
    student_name: 'Bé Nguyễn Hoàng Ngân',
    class_code: 'YCT2-04',
    course_id: '6adadba969897b0002482ca5',
    lesson_num: 1,
    lesson_title: 'Bài 1: AI小语，你好！ (Xin chào AI Tiểu Ngữ!)',
    file_url: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/hoangngan_khongtunhi_com/1730000001-btvn_bai1.wav',
    file_type: 'audio/wav',
    attachments: [
      {
        title: 'Bản thu âm Bài 1 - Bé Hoàng Ngân.wav',
        fileUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/hoangngan_khongtunhi_com/1730000001-btvn_bai1.wav',
        mediaType: 'audio/wav',
        size: 148200
      }
    ],
    student_note: 'Con nộp bài đọc to hội thoại bài 1 ạ!',
    status: 'graded',
    score: 9.5,
    teacher_feedback: 'Con phát âm thanh 3 rất rõ ràng và tự nhiên! Giữ vững phong độ ở Bài 2 nhé.',
    graded_by: 'linh.lam@khongtunhi.com',
    graded_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    submitted_at: new Date(Date.now() - 7200 * 1000).toISOString()
  }
];
