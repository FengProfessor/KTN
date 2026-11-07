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
  assignedClasses?: string[];
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

export interface ClassScheduleException {
  date: string;
  type: 'rescheduled' | 'postponed' | 'holiday' | 'cancelled';
  newDate?: string;
  startTime?: string;
  endTime?: string;
  note?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface CustomClassSession {
  date: string;
  startTime: string;
  endTime: string;
  title?: string;
  meetingUrl?: string;
}

export interface UpcomingClassSession {
  classCode: string;
  sessionDate: string;
  originalDate?: string;
  dayOfWeek: number;
  dayLabel: string;
  startTime: string;
  endTime: string;
  startEpochMs: number;
  endEpochMs: number;
  timezone: string;
  status: 'scheduled' | 'rescheduled' | 'postponed' | 'holiday' | 'cancelled';
  note?: string;
  title?: string;
  meetingUrl?: string;
}

export interface ClassScheduleConfig {
  classCode: string;
  daysOfWeek: number[];
  dayOfWeek?: string;
  startTime: string;
  endTime: string;
  timezone: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  mode: 'weekly' | 'custom_sessions';
  scheduleMode?: 'weekly' | 'custom_sessions';
  customSessions: CustomClassSession[];
  exceptions: ClassScheduleException[];
  meetingUrl?: string;
  status: 'confirmed' | 'unconfirmed' | 'paused';
  updatedBy?: string | null;
  updatedAt?: string | null;
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
  scheduleStatus?: 'confirmed' | 'legacy_unconfirmed' | 'unconfirmed' | 'paused';
  officialScheduleText?: string;
  legacyScheduleText?: string;
  scheduleConfig?: ClassScheduleConfig | null;
  upcomingSessions?: UpcomingClassSession[];
  nextSession?: UpcomingClassSession | null;
  suggestedFromLegacyText?: {
    daysOfWeek?: number[];
    startTime?: string;
    endTime?: string;
    legacyText?: string;
  } | null;
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
  | 'class_reminder'
  | 'schedule_changed'
  | 'session_cancelled'
  | 'course_granted'
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
  sessionDate?: string;
  title: string;
  body: string;
  actionUrl: string;
  actionLabel?: string;
  priority?: 'high' | 'normal';
  coalescedCount?: number;
  createdAt: string;
  read: boolean;
}

export interface UserNotificationSettings {
  chat: boolean;
  homework: boolean;
  grades?: boolean;
  schedule: boolean;
  important: boolean;
  reminder10Min: boolean;
  updatedAt?: string | null;
}

export type AccountStatus = 'ready_to_login' | 'pending_activation' | 'error';
export type SyncStatus = 'synced' | 'pending_activation' | 'partial_failure' | 'sync_failed' | 'drift_detected';

export interface KtnStudentRecord {
  code: string;
  email: string;
  name: string;
  parent_name?: string;
  phone?: string;
  cognito_user_id?: string | null;
  izteach_student_id?: string | null;
  class_code: string | null;
  has_live_class: boolean;
  has_online_courses: boolean;
  online_courses: OnlineCourseEntitlement[];
  studentCase: StudentCase;
  accountStatus?: AccountStatus | string;
  syncStatus?: SyncStatus | string;
  account_status?: AccountStatus | string;
  sync_status?: SyncStatus | string;
  readyToLogin?: boolean;
  fullySynced?: boolean;
  last_sync_error?: string | null;
  internal_note?: string | null;
  updated_at?: string;
}

export interface KtnStudentSearchResult {
  ok: boolean;
  items: KtnStudentRecord[];
  students: KtnStudentRecord[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextCursor: string | null;
  query: string;
  queryMs: number;
}

export interface KtnProvisionStudentResponse {
  ok: boolean;
  operationId: string;
  idempotentReplay?: boolean;
  syncStatus: string;
  accountStatus: string;
  accountProvisioned: boolean;
  readyToLogin: boolean;
  fullySynced: boolean;
  accountCreated: boolean;
  existingAccount: boolean;
  credentialMode: string;
  initialPassword?: string | null;
  student: KtnStudentRecord;
  message: string;
}

export interface KtnTeacherRecord {
  code: string;
  name: string;
  email: string;
  phone?: string;
  specialty?: string;
  assigned_classes: string[];
  active: boolean;
  cognito_user_id?: string | null;
  provisioningStatus?: string;
  syncStatus?: string;
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
  provisioning_status?: string;
  provisioningStatus?: string;
  assigned_user_id?: string | null;
  created_at: string;
}

export interface KtnSyncDriftItem {
  id: string;
  driftCode: string;
  severity: 'error' | 'warning';
  entityType: 'student' | 'order' | 'homework' | 'class' | string;
  entityKey: string;
  title: string;
  detail: string;
  studentName?: string;
  studentEmail?: string;
  reason?: string;
  retryAction?: {
    type:
      | 'student_sync'
      | 'student_provision'
      | 'teacher_provision'
      | 'order_approve'
      | 'homework_sync'
      | 'bulk_sync';
    email?: string;
    orderId?: string;
    homeworkId?: string;
  };
}

export interface KtnSyncStatusResponse {
  ok: boolean;
  checkedAt: string;
  summary: {
    totalStudents: number;
    healthyCount: number;
    needsResyncCount: number;
    manualReviewCount: number;
    driftTotal: number;
    totalDriftItems?: number;
  };
  driftItems: KtnSyncDriftItem[];
}

export interface KtnAttendanceRecord {
  id: string;
  class_code: string;
  session_num: number;
  student_email: string;
  student_name: string;
  status: 'present' | 'absent_excused' | 'absent_unexcused' | 'late' | 'excused' | 'absent';
  note?: string;
  recorded_by?: string;
  session_date?: string;
  updated_at?: string;
}

export interface KtnAttendanceResponse {
  ok: boolean;
  classCode: string;
  sessionNum: number | null;
  records: KtnAttendanceRecord[];
  attendance?: KtnAttendanceRecord[];
  summary: {
    total: number;
    present: number;
    late: number;
    absent?: number;
    excused?: number;
    absentExcused: number;
    absentUnexcused: number;
  };
}

