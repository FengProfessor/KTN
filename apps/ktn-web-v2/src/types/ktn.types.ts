export type UserRole = 'student' | 'teacher' | 'admin';
export type StudentCase = 'both' | 'online_only' | 'sll_only' | 'unassigned';

export interface OnlineCourseEntitlement {
  id: string;
  _id?: string;
  code?: string;
  title: string;
  shortTitle?: string;
}

export interface KtnUserSession {
  id: string;
  userId?: string;
  studentId?: string;
  code?: string;
  email: string;
  name: string;
  role: UserRole;
  roles: UserRole[];
  classCode: string | null;
  hasLiveClass: boolean;
  hasOnlineCourses: boolean;
  onlineCourses: OnlineCourseEntitlement[];
  studentCase?: StudentCase | string;
  token?: string;
}

export interface KtnCourse {
  id: string;
  code: string;
  title: string;
  shortTitle: string;
  badge: string;
  ageGroup?: string;
  lessonsCount: number;
  price: number;
  oldPrice: number;
  thumb?: string;
  isBundle?: boolean;
  bundleCourseIds?: string[];
}

export interface KtnAudioTrack {
  name: string;
  url: string;
}

export interface KtnLessonUnit {
  _id: string;
  id?: string;
  num: number;
  course: string;
  title: string;
  titleZh?: string;
  titleVi?: string;
  grammar?: string;
  duration?: string;
  sgkPage?: number;
  sbtPage?: number;
  voVietPage?: number;
  type: string;
  video: string;
  streamUrl?: string;
  posterUrl?: string;
  audioTracks?: KtnAudioTrack[];
  workbookTitle?: string;
}

export interface KtnClassItem {
  id: string;
  name: string;
  teacher_code: string;
  teacher_email?: string;
  teacher_name: string;
  schedule: string;
  total_lessons: number;
  current_lesson: number;
  active: boolean;
}

export interface KtnSessionExercise {
  id: string;
  num: number;
  title: string;
  prompt: string;
  instruction?: string;
  type: 'audio' | 'photo' | 'video' | string;
}

export interface KtnClassSession {
  id?: string;
  classCode: string;
  session_num: number;
  sessionNum: number;
  session_title: string;
  title: string;
  session_date?: string | null;
  summary?: string | null;
  exercises: KtnSessionExercise[];
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export type HomeworkStatus = 'pending' | 'graded' | 'revision_requested';

export interface HomeworkAttachment {
  title: string;
  fileUrl: string;
  cdnUrl?: string;
  mediaType: string;
  size?: number;
}

export interface KtnHomework {
  id: string;
  student_code?: string;
  student_email: string;
  student_name: string;
  class_code?: string | null;
  course_id: string;
  lesson_num: number;
  lesson_title: string;
  file_url: string;
  file_type: string;
  attachments: HomeworkAttachment[];
  workbook_answers?: Record<string, unknown>;
  student_note?: string;
  status: HomeworkStatus;
  score?: number | null;
  teacher_feedback?: string | null;
  teacher_audio_url?: string | null;
  graded_by?: string | null;
  graded_at?: string | null;
  submitted_at: string;
  updated_at?: string;
}

export type NotificationType =
  | 'homework_graded'
  | 'homework_submitted'
  | 'homework_assigned'
  | 'chat_message'
  | 'class_announcement'
  | 'announcement_pinned'
  | 'order_pending';

export interface KtnNotification {
  id: string;
  type: NotificationType;
  classCode?: string;
  roomId?: string;
  messageId?: string;
  homeworkId?: string;
  courseId?: string;
  lessonNum?: number;
  title: string;
  body: string;
  actionUrl: string;
  createdAt: string;
  read: boolean;
}

export interface KtnStudentRecord {
  code: string;
  email: string;
  name: string;
  parent_name?: string;
  phone?: string;
  cognito_user_id?: string | null;
  class_code: string | null;
  has_live_class: boolean;
  has_online_courses: boolean;
  online_courses: OnlineCourseEntitlement[];
  studentCase: StudentCase;
  updated_at?: string;
}

export interface KtnOrder {
  order_id: string;
  student_name: string;
  student_email: string;
  phone: string;
  course_id: string;
  course_name: string;
  amount: number;
  payment_method: string;
  payment_status: 'pending_verification' | 'paid' | 'refunded' | 'cancelled';
  approval_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}
