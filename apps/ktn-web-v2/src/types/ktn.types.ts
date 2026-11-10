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
  phone?: string;
  parentName?: string;
  role: UserRole;
  roles: UserRole[];
  classCode: string | null;
  assignedClasses?: string[];
  assignedCourses?: string[];
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
  description?: string;
  lessonsCount: number;
  price: number;
  oldPrice: number;
  thumb?: string | null;
  demoVideoUrl?: string | null;
  demoDurationSeconds?: number;
  lessonSample?: string;
  isBundle?: boolean;
  bundleCourseIds?: string[];
}

export interface KtnAudioTrack {
  id?: string;
  name: string;
  url: string;
  category?: 'mp3_sgk' | 'mp3_sbt' | string;
  filename?: string;
  size?: number;
  mimeType?: string;
  httpStatus?: number;
}

export interface KtnLearningMaterial {
  id: string;
  title: string;
  type?: 'sgk_pdf' | 'sbt_pdf' | 'voviet_pdf' | 'vocab_pdf' | 'reference_pdf' | 'lesson_pdf' | 'lesson_doc' | 'teacher_attachment' | string;
  category?: string;
  url: string;
  baseUrl?: string;
  fileUrl?: string;
  objectKey?: string;
  page?: number | null;
  bookPage?: number | null;
  size?: number | null;
  mime?: string;
  mimeType?: string;
  actionLabel?: string;
  canView?: boolean;
  canDownload?: boolean;
  httpStatus?: number;
}

export interface KtnHomeworkAssignment {
  assigned: boolean;
  mandatory?: boolean;
  title?: string;
  instructions?: string;
  relatedPages?: string | null;
  allowedTypes?: string[];
  maxFiles?: number;
  deadline?: string | null;
  completionCriteria?: string | null;
  sampleAttachmentUrl?: string | null;
  updatedBy?: string;
  updatedAt?: string;
}

export interface KtnLessonVideoPart {
  unitId: string;
  partNumber?: string | number | null;
  rawTitle?: string;
  title: string;
  videoId?: string;
  duration?: string;
  durationSec?: number;
  url?: string;
  streamUrl?: string;
  posterUrl?: string;
}

export interface KtnLessonUnit {
  _id: string;
  id?: string;
  unitId?: string;
  videoUnitId?: string;
  chapterId?: string;
  num: number;
  lessonNumber?: number | null;
  partNumber?: string | number | null;
  partLabel?: string | null;
  unitType?: 'lesson' | 'workbook' | string;
  rawTitle?: string;
  course: string;
  title: string;
  titleZh?: string;
  titleVi?: string;
  grammar?: string;
  duration?: string;
  durationSec?: number;
  sgkPage?: number | null;
  sbtPage?: number | null;
  voVietPage?: number | null;
  type: string;
  video: string;
  videoId?: string;
  streamUrl?: string;
  posterUrl?: string;
  audioTracks?: KtnAudioTrack[];
  materials?: KtnLearningMaterial[];
  homeworkAssignment?: KtnHomeworkAssignment | null;
  parts?: KtnLessonVideoPart[];
  resourceIds?: string[];
  confidence?: 'HIGH' | 'NEEDS_REVIEW' | string;
  verified?: boolean;
  workbookTitle?: string | null;
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
  | 'class_created'
  | 'class_joined'
  | 'class_teacher_changed'
  | 'homework_graded'
  | 'homework_submitted'
  | 'homework_assigned'
  | 'chat_message'
  | 'chat_group_message'
  | 'chat_private_message'
  | 'chat_course_message'
  | 'class_reminder'
  | 'schedule_changed'
  | 'session_cancelled'
  | 'course_granted'
  | 'class_announcement'
  | 'announcement_pinned'
  | 'order_pending'
  | 'forum_question'
  | 'forum_question_created'
  | 'forum_answer'
  | 'forum_answer_posted'
  | 'forum_answer_accepted'
  | 'course_request_pending'
  | 'course_request_reviewed';

export interface KtnNotification {
  id: string;
  eventId?: string;
  type: NotificationType;
  classCode?: string;
  roomId?: string;
  messageId?: string;
  homeworkId?: string;
  courseId?: string;
  unitId?: string;
  questionId?: string;
  lessonNum?: number;
  sessionNum?: number;
  sessionDate?: string;
  teacherName?: string;
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
  forumPushMode?: 'immediate' | 'digest' | 'off';
  updatedAt?: string | null;
}

export type AccountStatus = 'ready_to_login' | 'pending_activation' | 'error' | 'active' | 'suspended' | 'archived' | 'deleted';
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
  lifecycleStatus?: 'active' | 'suspended' | 'archived' | 'deleted' | string;
  lifecycleReason?: string | null;
  lifecycleUpdatedAt?: string | null;
  lifecycleUpdatedBy?: string | null;
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

export interface KtnTeacherContributionEvent {
  event_id: string;
  teacher_id: string;
  teacher_email: string;
  teacher_name?: string;
  question_id?: string | null;
  answer_id?: string | null;
  event_type:
    | 'answer_created'
    | 'helpful_vote'
    | 'accepted_answer'
    | 'video_attached'
    | 'long_pending_resolved'
    | 'admin_adjust'
    | 'admin_revoke'
    | string;
  points_delta: number;
  reason?: string;
  verified_at?: string | null;
  created_by_email?: string | null;
  created_at: string;
}

export interface KtnTeacherPerformanceStats {
  scheduledSessionsCount: number;
  confirmedTaughtSessionsCount: number;
  cancelledOrSubstituteSessionsCount: number;
  unverifiedTeachingLog: boolean;
  submissionsReviewedCount: number;
  pendingGradingCount: number;
  avgGradingHours: number | null;
  forumAnswersCount: number;
  acceptedAnswersCount: number;
  videoAnswersCount: number;
  totalContributionPoints: number;
}

export interface KtnTeacherRecord {
  code: string;
  name: string;
  email: string;
  phone?: string;
  specialty?: string;
  specialization?: string;
  bio?: string;
  notes?: string;
  status?: 'active' | 'locked' | 'inactive' | string;
  assigned_classes: string[];
  assigned_courses?: string[];
  active: boolean;
  cognito_user_id?: string | null;
  provisioningStatus?: string;
  readyToLogin?: boolean;
  syncStatus?: string;
  managedStudentsCount?: number;
  scheduledSessionsCount?: number;
  recordedClassSessionsCount?: number;
  activitySessionsCount?: number;
  confirmedSessionsCount?: number;
  attendanceConfirmedSessionsCount?: number;
  teachingVerificationStatus?: 'verified' | 'unverified';
  teachingVerificationLabel?: string;
  gradedHomeworksCount?: number;
  pendingHomeworksCount?: number;
  avgGradingTurnaroundHours?: number | null;
  forumAnswersCount?: number;
  acceptedAnswersCount?: number;
  forumAcceptedAnswersCount?: number;
  helpfulVotesCount?: number;
  videoGuidesCount?: number;
  forumVideoAnswersCount?: number;
  monthlyContributionPoints?: number;
  totalContributionPoints?: number;
  recentContributionEvents?: KtnTeacherContributionEvent[];
  courseRequestsCount?: number;
  pendingCourseRequestsCount?: number;
  stats?: KtnTeacherPerformanceStats;
}

export interface KtnForumAttachment {
  id?: string;
  name: string;
  url: string;
  type: 'image' | 'audio' | 'video' | 'pdf' | 'file' | string;
  kind?: 'image' | 'audio' | 'video' | 'pdf' | 'file' | string;
  size?: number;
}

export interface KtnForumAnswer {
  id: string;
  question_id: string;
  author_email?: string;
  author_name: string;
  author_role: 'teacher' | 'admin' | 'student' | string;
  teacher_id?: string | null;
  teacher_email?: string | null;
  teacher_name?: string;
  teacher_title?: string;
  content: string;
  attachments?: KtnForumAttachment[];
  video_url?: string | null;
  video_duration_seconds?: number | null;
  video_file_size?: number | null;
  video_verified?: boolean;
  is_accepted: boolean;
  helpful_count: number;
  viewerHasVotedHelpful?: boolean;
  status?: 'visible' | 'hidden' | string;
  created_at: string;
  updated_at?: string;
}

export interface KtnForumQuestion {
  id: string;
  course_id: string;
  course_title?: string;
  unit_id: string;
  lesson_number?: number;
  lesson_num?: number;
  lesson_title_snapshot: string;
  student_id: string;
  student_email?: string;
  student_name: string;
  class_code?: string | null;
  title: string;
  content: string;
  video_timestamp_seconds?: number | null;
  video_timestamp_label?: string | null;
  attachments?: KtnForumAttachment[];
  status: 'open' | 'claimed' | 'answered' | 'resolved' | 'hidden';
  claimed_by_email?: string | null;
  claimed_by_name?: string | null;
  claimed_by_teacher_id?: string | null;
  claimed_by_teacher_name?: string | null;
  claimed_at?: string | null;
  accepted_answer_id?: string | null;
  answers_count?: number;
  answer_count?: number;
  answersCount?: number;
  answers?: KtnForumAnswer[];
  isFollowing?: boolean;
  followCount?: number;
  isOwnQuestion?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface KtnForumLeaderboardEntry {
  teacherId: string;
  teacherEmail: string;
  teacherName: string;
  title: string;
  avatar?: string | null;
  active: boolean;
  totalPoints: number;
  monthlyPoints: number;
  answersCount: number;
  acceptedAnswersCount: number;
  helpfulVotesCount: number;
  videoGuidesCount: number;
  longPendingResolvedCount: number;
  recentEvents: KtnTeacherContributionEvent[];
}

export interface KtnForumLeaderboardResponse {
  ok: boolean;
  month?: string;
  leaderboard: KtnForumLeaderboardEntry[];
}

export interface KtnCourseGrantRequest {
  id: string;
  teacher_id: string;
  teacher_email: string;
  teacher_name: string;
  student_id: string;
  student_email: string;
  student_name: string;
  class_code: string;
  course_id: string;
  course_title: string;
  requested_course_id?: string;
  requested_course_title?: string;
  requested_course_ids?: string[];
  requested_course_titles?: string[];
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by_email?: string | null;
  reviewed_at?: string | null;
  review_note?: string;
  entitlement_result?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string;
}

export interface KtnVietQrPaymentInfo {
  bankId: string;
  bankName: string;
  accountNo?: string;
  accountNumber?: string;
  accountName: string;
  amount: number;
  transferContent: string;
  qrUrl: string;
}

export type OrderContactStatus =
  | 'not_called'
  | 'called'
  | 'no_answer'
  | 'callback'
  | 'callback_scheduled';
export type OrderPaymentDetailedStatus =
  | 'unpaid'
  | 'customer_reported'
  | 'checking_tx'
  | 'verifying_tx'
  | 'verified_paid'
  | 'refunded'
  | 'mismatch'
  | 'amount_mismatch';
export type OrderAccountDetailedStatus =
  | 'no_account'
  | 'existing_account'
  | 'pending_account_creation'
  | 'pending_creation'
  | 'activated'
  | 'sync_error'
  | 'awaiting_password_or_handoff'
  | 'credentials_handed_off';
export type StudentOrderTrackerStage =
  | 'received'
  | 'contacted'
  | 'awaiting_payment'
  | 'awaiting_payment_verification'
  | 'payment_verified'
  | 'activating'
  | 'unlocked'
  | 'needs_support';

export interface KtnOrder {
  order_id: string;
  student_name: string;
  parent_name?: string;
  student_email: string;
  raw_student_email?: string;
  has_valid_email?: boolean;
  phone: string;
  parent_phone?: string;
  zalo_url?: string | null;
  course_id: string;
  course_name: string;
  amount: number;
  server_course_price?: number;
  course_valid?: boolean;
  amount_valid?: boolean;
  payment_method: string;
  payment_status: 'pending_verification' | 'paid' | 'refunded' | 'cancelled';
  approval_status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  note?: string;
  customer_note?: string;
  contact_status?: OrderContactStatus;
  contact_note?: string;
  consultation_note?: string;
  contact_updated_at?: string | null;
  contact_updated_by?: string | null;
  payment_detailed_status?: OrderPaymentDetailedStatus;
  payment_verified_by?: string | null;
  payment_verified_at?: string | null;
  payment_tx_ref?: string;
  payment_received_amount?: number | null;
  payment_proof_auto?: boolean;
  source?: 'website' | 'authenticated_student' | string;
  source_label?: string;
  can_activate?: boolean;
  activation_block_reasons?: string[];
  account_detailed_status?: OrderAccountDetailedStatus;
  account_created?: boolean | null;
  credential_handed_off?: boolean;
  credential_handed_off_at?: string | null;
  credential_handed_off_by?: string | null;
  existing_student_code?: string | null;
  existing_student_email?: string | null;
  existing_student?: {
    code?: string;
    email?: string;
    name?: string;
    class_code?: string | null;
    online_courses_count?: number;
  } | null;
  student_tracker_stage?: StudentOrderTrackerStage;
  student_tracker_label?: string;
  provisioning_status?: string;
  provisioningStatus?: string;
  assigned_user_id?: string | null;
  assigned_student_id?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  created_at: string;
  updated_at?: string;
  paymentInfo?: KtnVietQrPaymentInfo | null;
  payment_info?: KtnVietQrPaymentInfo | null;
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

