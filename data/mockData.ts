// =============================================================================
// BuildUp – Mock data (source of truth for the prototype)
// =============================================================================
// IMPORTANT: this is the ONLY place that invents data. Every value shown in
// any UI screen must be traceable back to one of the objects below, or to
// something the user created at runtime (registration, job posting, etc.).
// =============================================================================

import {
  Admin,
  Worker,
  Contractor,
  JobPost,
  Application,
  Invitation,
  LegacyConversationRecord,
  AppNotification,
  RegistrationRecord,
  SupportTicket,
  MatchResult,
} from '../types';
import { rankWorkersForJob } from '../utils/matching';

// ---------------------------------------------------------------------------
// Admin body
// ---------------------------------------------------------------------------

export const MOCK_ADMINS: Admin[] = [
  {
    id: 'adm1',
    idNumber: '000000001',
    fullName: 'מנהל המערכת',
    phone: '03-0000000',
    email: 'admin@buildup.co.il',
    role: 'admin',
    status: 'approved',
    createdAt: '2022-01-01',
    permissions: [
      'approve_registrations',
      'reject_registrations',
      'block_users',
      'unblock_users',
      'handle_support',
    ],
  },
];

// ---------------------------------------------------------------------------
// Approved workers (active customers in the worker pool)
// ---------------------------------------------------------------------------

export const MOCK_WORKERS: Worker[] = [
  {
    id: 'w1',
    idNumber: '311223344',
    fullName: 'משה לוי',
    phone: '052-1234567',
    email: 'moshe@example.com',
    role: 'worker',
    status: 'approved',
    createdAt: '2023-01-15',
    city: 'תל אביב',
    profession: 'חשמלאי',
    professionCategory: 'חשמל',
    experienceYears: 12,
    skills: ['חשמל תעשייתי', 'חשמל ביתי', 'לוחות חשמל', 'תשתיות'],
    certifications: ['חשמלאי מוסמך מ׳', 'תעודת בטיחות'],
    preferredAreas: ['מרכז', 'שרון'],
    isAvailable: true,
    hourlyRate: 120,
    dailyRate: 800,
    bio: 'חשמלאי מוסמך עם 12 שנות ניסיון בפרויקטים גדולים ובניה רב-קומתית.',
    completedJobsCount: 134,
  },
  {
    id: 'w2',
    idNumber: '322334455',
    fullName: 'יוסי כהן',
    phone: '053-2345678',
    email: 'yossi@example.com',
    role: 'worker',
    status: 'approved',
    createdAt: '2023-03-20',
    city: 'ירושלים',
    profession: 'אינסטלטור',
    professionCategory: 'אינסטלציה',
    experienceYears: 8,
    skills: ['אינסטלציה ביתית', 'ביוב', 'חימום', 'מיזוג'],
    certifications: ['אינסטלטור מוסמך'],
    preferredAreas: ['ירושלים'],
    isAvailable: true,
    hourlyRate: 110,
    dailyRate: 750,
    bio: 'אינסטלטור מנוסה עם התמחות בפרויקטים מורכבים ושיפוצים.',
    completedJobsCount: 89,
  },
  {
    id: 'w3',
    idNumber: '333445566',
    fullName: 'דוד אברהם',
    phone: '054-3456789',
    email: 'david@example.com',
    role: 'worker',
    status: 'approved',
    createdAt: '2022-06-10',
    city: 'חיפה',
    profession: 'בנאי',
    professionCategory: 'בנייה',
    experienceYears: 15,
    skills: ['בנייה רטובה', 'יציקות בטון', 'בלוקים', 'טיח'],
    certifications: ['בנאי מוסמך', 'עגורנאי'],
    preferredAreas: ['צפון'],
    isAvailable: false,
    availableFrom: '2024-08-01',
    hourlyRate: 95,
    dailyRate: 650,
    bio: 'בנאי ותיק עם ניסיון בבניית מבנים מכל הסוגים. עובד עם תכניות ומדויק מאוד.',
    completedJobsCount: 210,
  },
  {
    id: 'w4',
    idNumber: '344556677',
    fullName: 'אחמד חלבי',
    phone: '055-4567890',
    email: 'ahmad@example.com',
    role: 'worker',
    status: 'approved',
    createdAt: '2023-05-12',
    city: 'נצרת',
    profession: 'גבסן',
    professionCategory: 'גבס ותקרות',
    experienceYears: 6,
    skills: ['תקרות גבס', 'קירות גבס', 'חיפויים', 'פרופילים'],
    certifications: ['קורס גבסנות מקצועי'],
    preferredAreas: ['צפון'],
    isAvailable: true,
    hourlyRate: 100,
    dailyRate: 680,
    bio: 'גבסן מיומן עם עין אסתטית מצוינת. מתמחה בתקרות מיוחדות ועיצוביות.',
    completedJobsCount: 67,
  },
  {
    id: 'w5',
    idNumber: '355667788',
    fullName: 'ראובן שמש',
    phone: '050-5678901',
    email: 'reuven@example.com',
    role: 'worker',
    status: 'approved',
    createdAt: '2023-08-01',
    city: 'באר שבע',
    profession: 'רצף',
    professionCategory: 'ריצוף',
    experienceYears: 9,
    skills: ['ריצוף קרמיקה', 'פורצלן', 'אבן טבעית', 'חיפוי קירות'],
    certifications: ['קורס ריצוף מתקדם'],
    preferredAreas: ['דרום'],
    isAvailable: true,
    hourlyRate: 105,
    dailyRate: 720,
    bio: 'רצף מקצועי עם ניסיון בסוגי אריחים מגוונים. עבודה מדויקת ונקייה.',
    completedJobsCount: 78,
  },
  {
    id: 'w6',
    idNumber: '366778899',
    fullName: 'שלמה פרץ',
    phone: '052-6789012',
    email: 'shlomo@example.com',
    role: 'worker',
    status: 'approved',
    createdAt: '2023-09-15',
    city: 'רמת גן',
    profession: 'צבע',
    professionCategory: 'צבע וסיוד',
    experienceYears: 7,
    skills: ['צביעת קירות', 'ספרינג', 'אפקטים מיוחדים'],
    certifications: [],
    preferredAreas: ['מרכז'],
    isAvailable: true,
    hourlyRate: 90,
    dailyRate: 620,
    bio: 'צבע מנוסה עם ידע בטכניקות צביעה מתקדמות ועיצוב פנים.',
    completedJobsCount: 55,
  },
  {
    id: 'w7',
    idNumber: '377889900',
    fullName: 'נסים בוזגלו',
    phone: '053-7890123',
    email: 'nissim@example.com',
    role: 'worker',
    status: 'approved',
    createdAt: '2021-11-20',
    city: 'אשדוד',
    profession: 'מסגר',
    professionCategory: 'מסגרות ואלומיניום',
    experienceYears: 18,
    skills: ['מסגרות ברזל', 'אלומיניום', 'שערים', 'גדרות', 'מעקות'],
    certifications: ['מסגר מוסמך', 'רתך מוסמך'],
    preferredAreas: ['דרום', 'מרכז'],
    isAvailable: true,
    hourlyRate: 130,
    dailyRate: 900,
    bio: 'מסגר בכיר עם מעל 18 שנות ניסיון. מתמחה בעבודות מתכת מורכבות.',
    completedJobsCount: 312,
  },
  {
    id: 'w8',
    idNumber: '388990011',
    fullName: 'אריה גולדברג',
    phone: '054-8901234',
    email: 'arie@example.com',
    role: 'worker',
    status: 'approved',
    createdAt: '2023-04-05',
    city: 'נתניה',
    profession: 'נגר',
    professionCategory: 'עבודות עץ',
    experienceYears: 10,
    skills: ['נגרות בניין', 'ארונות', 'דלתות', 'רצפת פרקט'],
    certifications: ['נגר מוסמך'],
    preferredAreas: ['שרון'],
    isAvailable: false,
    availableFrom: '2024-07-15',
    hourlyRate: 115,
    dailyRate: 780,
    bio: 'נגר עם ניסיון רב בנגרות בניין ועבודות גמר עץ ברמה גבוהה.',
    completedJobsCount: 91,
  },
];

// ---------------------------------------------------------------------------
// Approved contractors (active customers in the contractor pool)
// ---------------------------------------------------------------------------

export const MOCK_CONTRACTORS: Contractor[] = [
  {
    id: 'c1',
    idNumber: '411223344',
    fullName: 'יעקב ישראלי',
    phone: '054-9876543',
    email: 'yaakov@buildpro.co.il',
    role: 'contractor',
    status: 'approved',
    createdAt: '2022-01-01',
    companyName: 'בנייה פרו בע"מ',
    contractorRegistrationNumber: '101234',
    city: 'תל אביב',
    areaOfOperation: 'מרכז',
    projectTypes: ['מגורים', 'מסחר', 'ציבורי'],
    licenseDetails: 'ק100 – בניה 2 – עד 5 קומות',
    bio: 'קבלן בנייה ותיק עם ניסיון של מעל 20 שנה בפרויקטים למגורים ומסחר.',
  },
  {
    id: 'c2',
    idNumber: '422334455',
    fullName: 'גיל מזרחי',
    phone: '052-5551111',
    email: 'gil@gilbuild.co.il',
    role: 'contractor',
    status: 'approved',
    createdAt: '2022-03-10',
    companyName: 'גיל בנייה ושיפוץ',
    contractorRegistrationNumber: '105555',
    city: 'הרצליה',
    areaOfOperation: 'שרון',
    projectTypes: ['מגורים', 'יוקרה'],
    licenseDetails: 'ק100 – בניה 3 – עד 8 קומות',
    bio: 'מתמחה בפרויקטים של וילות יוקרה ושיפוצים רחבי היקף.',
  },
];

/** Convenience alias used by the current Dashboard/Profile screens. */
export const MOCK_CONTRACTOR = MOCK_CONTRACTORS[0];

// ---------------------------------------------------------------------------
// Registration pipeline (pending / rejected / blocked)
// ---------------------------------------------------------------------------
// Note: the "approved" records for the workers/contractors above are already
// represented as live Worker/Contractor objects — so we only list records
// that are NOT yet approved here. An approved registration is simply the
// Customer object itself (by design).
// ---------------------------------------------------------------------------

export const MOCK_REGISTRATIONS: RegistrationRecord[] = [
  {
    id: 'reg1',
    role: 'worker',
    status: 'pending',
    submittedAt: '2024-07-07T09:15:00',
    externalChecks: { idValid: true },
    data: {
      fullName: 'רון מזרחי',
      idNumber: '201122334',
      phone: '050-1112233',
      email: 'ron.m@example.com',
      city: 'פתח תקווה',
      password: '********',
      profession: 'חשמלאי',
      professionCategory: 'חשמל',
      skills: ['לוחות חשמל', 'תשתיות'],
      certifications: ['חשמלאי מוסמך א׳'],
      experienceYears: 4,
      preferredAreas: ['מרכז'],
      isAvailable: true,
      hourlyRate: 95,
      dailyRate: 650,
      bio: 'חשמלאי צעיר, רציני, מחפש פרויקטים באזור המרכז.',
    },
  },
  {
    id: 'reg2',
    role: 'contractor',
    status: 'pending',
    submittedAt: '2024-07-07T12:44:00',
    externalChecks: {
      idValid: true,
      contractorRegistrationValid: true,
    },
    data: {
      fullName: 'אלון דוידוב',
      companyName: 'דוידוב בניה',
      idNumber: '433445566',
      contractorRegistrationNumber: '108877',
      phone: '054-2223344',
      email: 'alon@davidov.co.il',
      city: 'חיפה',
      areaOfOperation: 'צפון',
      projectTypes: ['מגורים'],
      licenseDetails: 'ק100 – בניה 1 – עד 4 קומות',
      password: '********',
      bio: 'קבלן מתחיל עם ניסיון של 3 שנים כעצמאי.',
    },
  },
  {
    id: 'reg3',
    role: 'worker',
    status: 'rejected',
    submittedAt: '2024-07-05T08:00:00',
    processedAt: '2024-07-05T15:30:00',
    processedBy: 'adm1',
    rejectionReason: 'תעודת זהות לא אומתה במערכת הממשלתית',
    externalChecks: {
      idValid: false,
      eligibilityNotes: 'ID number format not found in registry',
    },
    data: {
      fullName: 'מיכאל כהנא',
      idNumber: '999999999',
      phone: '050-0000000',
      email: 'mk@example.com',
      city: 'אשדוד',
      password: '********',
      profession: 'צבע',
      professionCategory: 'צבע וסיוד',
      skills: ['צבע פנים'],
      certifications: [],
      experienceYears: 1,
      preferredAreas: ['דרום'],
      isAvailable: true,
      hourlyRate: 70,
      dailyRate: 500,
    },
  },
  {
    id: 'reg4',
    role: 'contractor',
    status: 'blocked',
    submittedAt: '2023-12-01T10:00:00',
    processedAt: '2024-06-20T11:00:00',
    processedBy: 'adm1',
    rejectionReason: 'תלונות חוזרות על אי-תשלום לעובדים',
    externalChecks: {
      idValid: true,
      contractorRegistrationValid: true,
    },
    data: {
      fullName: 'שי ברנע',
      companyName: 'ברנע בנייה',
      idNumber: '455667788',
      contractorRegistrationNumber: '102222',
      phone: '054-9998887',
      email: 'shai@barnea.co.il',
      city: 'באר שבע',
      areaOfOperation: 'דרום',
      projectTypes: ['מגורים'],
      licenseDetails: 'ק100 – בניה 1',
      password: '********',
    },
  },
];

// ---------------------------------------------------------------------------
// Jobs posted by approved contractors
// ---------------------------------------------------------------------------

export const MOCK_JOBS: JobPost[] = [
  {
    id: 'j1',
    contractorId: 'c1',
    title: 'חשמלאי לפרויקט בניין מגורים',
    description:
      'דרוש חשמלאי מוסמך לפרויקט בניין 8 קומות בתל אביב. עבודה כוללת תשתיות חשמל בכל הדירות ואזורים משותפים.',
    profession: 'חשמלאי',
    professionCategory: 'חשמל',
    city: 'תל אביב',
    address: 'רחוב הרצל 45, תל אביב',
    startDate: '2024-07-15',
    endDate: '2024-09-30',
    duration: '2.5 חודשים',
    dailyRate: 850,
    workersNeeded: 2,
    requiredCertifications: ['חשמלאי מוסמך', 'תעודת בטיחות'],
    requirements: ['חשמלאי מוסמך', 'ניסיון בבנייה רב-קומתית', 'תעודת בטיחות'],
    status: 'open',
    acceptingApplications: true,
    urgent: true,
    postedAt: '2024-07-01',
  },
  {
    id: 'j2',
    contractorId: 'c1',
    title: 'גבסן לפרויקט שיפוץ משרדים',
    description:
      'דרוש גבסן מנוסה לשיפוץ מקיף של קומפלקס משרדים. עבודה כוללת תקרות גבס ומחיצות.',
    profession: 'גבסן',
    professionCategory: 'גבס ותקרות',
    city: 'רמת גן',
    address: 'מגדל בסר 3, רמת גן',
    startDate: '2024-07-20',
    duration: '3 שבועות',
    dailyRate: 720,
    workersNeeded: 3,
    requiredCertifications: [],
    requirements: ['ניסיון בתקרות מיוחדות', 'יכולת עמידה בלוחות זמנים'],
    status: 'open',
    acceptingApplications: true,
    urgent: false,
    postedAt: '2024-07-03',
  },
  {
    id: 'j3',
    contractorId: 'c1',
    title: 'אינסטלטור לפרויקט בנייה חדשה',
    description: 'אינסטלטור לפרויקט בנייה של 24 יחידות דיור בירושלים.',
    profession: 'אינסטלטור',
    professionCategory: 'אינסטלציה',
    city: 'ירושלים',
    address: 'רחוב יפו 120, ירושלים',
    startDate: '2024-08-01',
    endDate: '2024-11-30',
    duration: '4 חודשים',
    dailyRate: 780,
    workersNeeded: 1,
    requiredCertifications: ['אינסטלטור מוסמך'],
    requirements: ['אינסטלטור מוסמך', 'ניסיון בבנייה חדשה'],
    status: 'in_progress',
    acceptingApplications: true,
    urgent: false,
    postedAt: '2024-06-25',
  },
  {
    id: 'j4',
    contractorId: 'c2',
    title: 'רצף לפרויקט יוקרה',
    description:
      'רצף מנוסה לפרויקט וילות יוקרה בהרצליה פיתוח. אריחים מיוחדים ועבודה ברמה גבוהה מאוד.',
    profession: 'רצף',
    professionCategory: 'ריצוף',
    city: 'הרצליה',
    address: 'רחוב השרון 8, הרצליה פיתוח',
    startDate: '2024-07-25',
    duration: '6 שבועות',
    dailyRate: 850,
    workersNeeded: 2,
    requiredCertifications: [],
    requirements: ['ניסיון באריחים יוקרתיים', 'עבודה מדויקת', 'אמינות'],
    status: 'open',
    acceptingApplications: true,
    urgent: true,
    postedAt: '2024-07-05',
  },
];

// ---------------------------------------------------------------------------
// Applications (worker -> job)
// ---------------------------------------------------------------------------

export const MOCK_APPLICATIONS: Application[] = [
  {
    id: 'app1',
    jobId: 'j1',
    workerId: 'w1',
    message: 'שלום, יש לי ניסיון רב בפרויקטים מסוג זה. זמין להתחיל מיד.',
    appliedAt: '2024-07-02T14:38:00',
    status: 'pending',
  },
  {
    id: 'app2',
    jobId: 'j1',
    workerId: 'w3',
    message: 'מנוסה בבניינים רב-קומתיים. ניתן לראות תיק עבודות.',
    appliedAt: '2024-07-01T09:12:00',
    respondedAt: '2024-07-02T11:05:00',
    contractorResponse: 'תודה! נחזור אליך בקרוב לתיאום.',
    status: 'accepted',
  },
  {
    id: 'app3',
    jobId: 'j2',
    workerId: 'w1',
    message: 'מנוסה בפרויקטים מסוג זה עם 12 שנות ניסיון.',
    appliedAt: '2024-07-03T16:20:00',
    status: 'pending',
  },
  {
    id: 'app4',
    jobId: 'j4',
    workerId: 'w1',
    message: 'אשמח להצטרף לפרויקט.',
    appliedAt: '2024-07-01T08:45:00',
    respondedAt: '2024-07-02T18:30:00',
    contractorResponse: 'תודה על ההתעניינות, מצאנו מועמד מתאים יותר.',
    status: 'rejected',
  },
  {
    // Second accepted worker on j1 (workersNeeded = 2). With app2 this makes
    // j1 fully staffed from first render, so the capacity reconciler
    // auto-closes its registration — a ready-made fixture for the
    // "fully staffed" UI states. app1 (w1, still pending on j1) then
    // exercises "a pending application on a job that has since filled up".
    id: 'app5',
    jobId: 'j1',
    workerId: 'w5',
    message: 'זמין להתחיל מיד, ניסיון רב בפרויקטים דומים.',
    appliedAt: '2024-07-02T09:30:00',
    respondedAt: '2024-07-03T08:10:00',
    contractorResponse: 'מעולה, נתאם התחלה.',
    status: 'accepted',
  },
];

/** Legacy export name. Points at the same array. */
export const MOCK_JOB_REQUESTS = MOCK_APPLICATIONS;

// ---------------------------------------------------------------------------
// Invitations (contractor -> worker)
// ---------------------------------------------------------------------------

export const MOCK_INVITATIONS: Invitation[] = [
  {
    id: 'inv1',
    jobId: 'j1',
    contractorId: 'c1',
    workerId: 'w7',
    message: 'היי נסים, ראיתי את הפרופיל שלך ונראה שאתה מתאים מאוד לפרויקט.',
    sentAt: '2024-07-04T14:40:00',
    status: 'pending',
  },
  {
    id: 'inv2',
    jobId: 'j2',
    contractorId: 'c1',
    workerId: 'w4',
    message: 'אחמד, אשמח לבדוק אם תוכל להצטרף לפרויקט הגבס.',
    sentAt: '2024-07-03T10:15:00',
    respondedAt: '2024-07-04T09:44:00',
    status: 'accepted',
  },
];

// ---------------------------------------------------------------------------
// Conversations & Messages
// ---------------------------------------------------------------------------

// Real, chronologically-consistent timestamps computed relative to "now" at
// load time, so the mock data always correctly exercises the app's
// today/yesterday/older display logic no matter when it's actually run.
const relativeTimestamp = (daysAgo: number, hour: number, minute: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

// These 3 records are intentionally left in their original (pre-participantIds)
// shape — id + participantId, no participantIds — so AppContext's load-time
// normalizeConversation() has real legacy records to convert, exercising the
// same migration path a future Firestore import would need. Nothing
// downstream reads this raw shape directly.
export const MOCK_CONVERSATIONS: LegacyConversationRecord[] = [
  {
    id: 'conv1',
    participantId: 'w1',
    lastMessage: 'בסדר, אני זמין ביום שני בשעה 8 בבוקר',
    unreadCount: 2,
    messages: [
      {
        id: 'm1',
        senderId: 'c1',
        receiverId: 'w1',
        content: 'שלום משה, ראיתי את הפרופיל שלך ואני מעוניין לדבר על הפרויקט',
        timestamp: relativeTimestamp(0, 9, 15),
        isRead: true,
      },
      {
        id: 'm2',
        senderId: 'w1',
        receiverId: 'c1',
        content: 'שלום! בשמחה, מה הפרויקט?',
        timestamp: relativeTimestamp(0, 9, 45),
        isRead: true,
      },
      {
        id: 'm3',
        senderId: 'c1',
        receiverId: 'w1',
        content: 'בניין מגורים 8 קומות בתל אביב, דרוש חשמלאי מוסמך לחודשיים וחצי',
        timestamp: relativeTimestamp(0, 9, 50),
        isRead: true,
      },
      {
        id: 'm4',
        senderId: 'w1',
        receiverId: 'c1',
        content: 'מצוין, מה התשלום היומי?',
        timestamp: relativeTimestamp(0, 10, 15),
        isRead: true,
      },
      {
        id: 'm5',
        senderId: 'c1',
        receiverId: 'w1',
        content: '850 ₪ ליום, כולל ביטוחים. מתי אתה יכול להתחיל?',
        timestamp: relativeTimestamp(0, 10, 20),
        isRead: true,
      },
      {
        id: 'm6',
        senderId: 'w1',
        receiverId: 'c1',
        content: 'בסדר, אני זמין ביום שני בשעה 8 בבוקר',
        timestamp: relativeTimestamp(0, 10, 32),
        isRead: false,
      },
    ],
  },
  {
    id: 'conv2',
    participantId: 'w7',
    lastMessage: 'שלח לי את הכתובת ואגיע לאמוד',
    unreadCount: 0,
    messages: [
      {
        id: 'm7',
        senderId: 'c1',
        receiverId: 'w7',
        content: 'נסים, צריך מעקות לגרמי מדרגות. 6 קומות',
        timestamp: relativeTimestamp(1, 15, 0),
        isRead: true,
      },
      {
        id: 'm8',
        senderId: 'w7',
        receiverId: 'c1',
        content: 'שלח לי את הכתובת ואגיע לאמוד',
        timestamp: relativeTimestamp(1, 15, 30),
        isRead: true,
      },
    ],
  },
  {
    id: 'conv3',
    participantId: 'w4',
    lastMessage: 'תודה רבה! יהיה לי כבוד לעבוד אתך',
    unreadCount: 0,
    messages: [
      {
        id: 'm9',
        senderId: 'c1',
        receiverId: 'w4',
        content: 'אחמד, קיבלת את העבודה! מתחיל ב-20 ליולי',
        timestamp: relativeTimestamp(3, 11, 0),
        isRead: true,
      },
      {
        id: 'm10',
        senderId: 'w4',
        receiverId: 'c1',
        content: 'תודה רבה! יהיה לי כבוד לעבוד אתך',
        timestamp: relativeTimestamp(3, 11, 5),
        isRead: true,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  // Contractor c1
  {
    id: 'n1',
    userId: 'c1',
    type: 'job_application',
    title: 'בקשה חדשה לעבודה',
    body: 'משה לוי הגיש מועמדות למשרה "חשמלאי לפרויקט בניין מגורים"',
    isRead: false,
    createdAt: '2024-07-05T10:32:00',
    relatedId: 'app1',
  },
  {
    id: 'n2',
    userId: 'c1',
    type: 'new_message',
    title: 'הודעה חדשה',
    body: 'נסים בוזגלו שלח לך הודעה',
    isRead: false,
    createdAt: '2024-07-05T09:15:00',
    relatedId: 'conv2',
  },
  {
    id: 'n3',
    userId: 'c1',
    type: 'invitation_accepted',
    title: 'הזמנה אושרה',
    body: 'אחמד חלבי אישר את הזמנתך לפרויקט הגבס',
    isRead: true,
    createdAt: '2024-07-04T14:00:00',
    relatedId: 'inv2',
  },
  // Worker w1
  {
    id: 'n4',
    userId: 'w1',
    type: 'system',
    title: 'ברוך הבא ל-BuildUp!',
    body: 'הפרופיל שלך אושר בהצלחה. התחל לחפש עבודות.',
    isRead: true,
    createdAt: '2023-01-16T08:00:00',
  },
  {
    id: 'n5',
    userId: 'w1',
    type: 'application_accepted',
    title: 'הבקשה שלך אושרה',
    body: 'הקבלן בנייה פרו בע"מ אישר את הבקשה שלך למשרה "חשמלאי"',
    isRead: false,
    createdAt: '2024-07-02T12:00:00',
    relatedId: 'app2',
  },
  // Admin
  {
    id: 'n6',
    userId: 'adm1',
    type: 'new_pending_registration',
    title: 'בקשת רישום חדשה',
    body: 'רון מזרחי הגיש בקשה לרישום כעובד',
    isRead: false,
    createdAt: '2024-07-07T09:15:00',
    relatedId: 'reg1',
  },
  {
    id: 'n7',
    userId: 'adm1',
    type: 'new_pending_registration',
    title: 'בקשת רישום חדשה',
    body: 'אלון דוידוב הגיש בקשה לרישום כקבלן',
    isRead: false,
    createdAt: '2024-07-07T12:44:00',
    relatedId: 'reg2',
  },
  {
    id: 'n8',
    userId: 'adm1',
    type: 'new_support_ticket',
    title: 'פנייה חדשה לתמיכה',
    body: 'יוסי כהן פתח פנייה: "לא מקבל תשלום"',
    isRead: false,
    createdAt: '2024-07-06T10:00:00',
    relatedId: 'tkt1',
  },
];

// ---------------------------------------------------------------------------
// Support tickets (complaints / claims / questions)
// ---------------------------------------------------------------------------

export const MOCK_SUPPORT_TICKETS: SupportTicket[] = [
  {
    id: 'tkt1',
    userId: 'w2',
    userRole: 'worker',
    type: 'complaint',
    subject: 'לא מקבל תשלום',
    description:
      'עבדתי בפרויקט של קבלן שלא מופיע במערכת, ואני לא מקבל את התשלום המגיע לי מזה חודש.',
    status: 'open',
    createdAt: '2024-07-06T10:00:00',
    updatedAt: '2024-07-06T10:00:00',
  },
  {
    id: 'tkt2',
    userId: 'c2',
    userRole: 'contractor',
    type: 'question',
    subject: 'איך אפשר לבטל משרה שכבר פורסמה',
    description: 'פרסמתי משרה אבל הפרויקט התעכב. איך אפשר להסיר או להקפיא אותה?',
    status: 'in_progress',
    createdAt: '2024-07-05T13:00:00',
    updatedAt: '2024-07-06T09:00:00',
    assignedAdminId: 'adm1',
  },
  {
    id: 'tkt3',
    userId: 'w7',
    userRole: 'worker',
    type: 'technical',
    subject: 'לא יכול להעלות תעודות',
    description: 'מנסה להעלות תעודת בטיחות חדשה לפרופיל, הכפתור לא מגיב.',
    status: 'resolved',
    createdAt: '2024-07-01T09:00:00',
    updatedAt: '2024-07-02T15:00:00',
    assignedAdminId: 'adm1',
    adminResponse: 'התקלה תוקנה בגרסה החדשה. נסה שוב ועדכן אותנו.',
    resolvedAt: '2024-07-02T15:00:00',
  },
];

// ---------------------------------------------------------------------------
// Pickers — shared taxonomies used by several forms
// ---------------------------------------------------------------------------

export const PROFESSION_CATEGORIES = [
  'כל המקצועות',
  'חשמל',
  'אינסטלציה',
  'בנייה',
  'גבס ותקרות',
  'ריצוף',
  'צבע וסיוד',
  'מסגרות ואלומיניום',
  'עבודות עץ',
  'פיגומים',
  'הריסה',
];

export const PROFESSIONS_BY_CATEGORY: Record<string, string[]> = {
  'חשמל': ['חשמלאי', 'חשמלאי מוסמך'],
  'אינסטלציה': ['אינסטלטור', 'ביובן'],
  'בנייה': ['בנאי', 'ברזלן', 'טפסן'],
  'גבס ותקרות': ['גבסן'],
  'ריצוף': ['רצף'],
  'צבע וסיוד': ['צבע', 'סייד'],
  'מסגרות ואלומיניום': ['מסגר', 'אלומיניום'],
  'עבודות עץ': ['נגר'],
  'פיגומים': ['פיגומאי'],
  'הריסה': ['פועל הריסה'],
};

export const CITIES_ISRAEL = [
  'כל הערים',
  'תל אביב',
  'ירושלים',
  'חיפה',
  'ראשון לציון',
  'פתח תקווה',
  'אשדוד',
  'נתניה',
  'באר שבע',
  'בני ברק',
  'רמת גן',
  'הרצליה',
  'רחובות',
  'נצרת',
  'אשקלון',
];

export const AREAS_ISRAEL = ['מרכז', 'שרון', 'ירושלים', 'צפון', 'דרום'];

export const PROJECT_TYPES = ['מגורים', 'מסחר', 'ציבורי', 'יוקרה', 'תעשייה'];

// ---------------------------------------------------------------------------
// Smart match — delegated to the real scoring engine
// ---------------------------------------------------------------------------

/** Legacy call site used by older SmartMatch code. Prefer rankWorkersForJob
 *  from utils/matching directly when possible. */
export const generateMatchResults = (jobId: string): MatchResult[] => {
  const job = MOCK_JOBS.find((j) => j.id === jobId);
  if (!job) return [];
  return rankWorkersForJob(MOCK_WORKERS, job);
};
