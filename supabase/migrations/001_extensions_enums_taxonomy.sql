-- =============================================================================
-- 001 · extensions, enums, taxonomy (+ seed)
-- =============================================================================
-- Phase 1 of the BuildUp backend. No RLS here (added in 008), no app wiring.
-- Enum values mirror types/index.ts; taxonomy rows mirror data/mockData.ts and
-- data/israelCities.ts exactly (review rule #5 — nothing invented).
-- =============================================================================

-- ---------- extensions ----------
create extension if not exists pgcrypto with schema extensions;

-- ---------- enums (mirror types/index.ts) ----------
create type public.user_role as enum ('admin', 'contractor', 'worker');
create type public.user_status as enum ('pending', 'approved', 'blocked', 'rejected');
create type public.admin_permission as enum (
  'approve_registrations', 'reject_registrations',
  'block_users', 'unblock_users', 'handle_support'
);
create type public.registration_role as enum ('worker', 'contractor');
-- decision #6: only human-set licence states are stored; expired / expiring /
-- review_due are DERIVED from dates, never persisted.
create type public.contractor_license_status as enum ('pending_review', 'verified', 'rejected');
create type public.job_status as enum ('open', 'in_progress', 'completed', 'cancelled');
create type public.job_closure_reason as enum ('manual', 'capacity');
create type public.application_status as enum ('pending', 'accepted', 'rejected', 'withdrawn');
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'expired', 'cancelled');
create type public.invitation_cancel_reason as enum ('manual', 'capacity_full');
create type public.assignment_source as enum ('application', 'invitation');
create type public.assignment_status as enum ('active', 'completed', 'cancelled');
create type public.assignment_actor as enum ('worker', 'contractor');
create type public.support_ticket_type as enum ('complaint', 'claim', 'question', 'technical');
create type public.support_ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
create type public.support_sender_role as enum ('admin', 'worker', 'contractor');
create type public.license_request_status as enum ('pending', 'approved', 'rejected');
-- Current (non-legacy) notification types only. Legacy values
-- (job_request / job_accepted / job_rejected) are mapped during data import.
create type public.notification_type as enum (
  'job_application', 'application_accepted', 'application_rejected',
  'invitation_received', 'invitation_accepted', 'invitation_declined', 'invitation_cancelled',
  'assignment_cancelled', 'assignment_completed',
  'new_message', 'review',
  'registration_approved', 'registration_rejected', 'account_blocked', 'account_unblocked',
  'support_response', 'new_pending_registration', 'new_support_ticket',
  'license_update_submitted', 'license_update_approved', 'license_update_rejected',
  'license_attention', 'license_renewal_requested', 'contractor_registration_number_updated',
  'system'
);

-- ---------- shared trigger fn: updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- taxonomy tables ----------
create table public.profession_categories (
  slug        text primary key,
  name        text not null unique,
  sort_order  int  not null default 0
);

create table public.professions (
  slug           text primary key,
  name           text not null unique,
  category_slug  text not null references public.profession_categories(slug),
  sort_order     int  not null default 0
);
create index professions_category_idx on public.professions (category_slug);

create table public.areas (
  slug        text primary key,
  name        text not null unique,
  sort_order  int  not null default 0
);

create table public.project_types (
  slug        text primary key,
  name        text not null unique,
  sort_order  int  not null default 0
);

create table public.cities (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  area_slug  text references public.areas(slug),
  lat        double precision not null,
  lon        double precision not null,
  aliases    text[] not null default '{}'
);
create index cities_area_idx on public.cities (area_slug);

-- ---------- seed: profession_categories (types/index.ts ProfessionCategory) ----------
insert into public.profession_categories (slug, name, sort_order) values
  ('construction',        'בנייה',              1),
  ('electrical',          'חשמל',               2),
  ('plumbing',            'אינסטלציה',          3),
  ('drywall_ceilings',    'גבס ותקרות',         4),
  ('flooring',            'ריצוף',              5),
  ('painting',            'צבע וסיוד',          6),
  ('metalwork_aluminum',  'מסגרות ואלומיניום',  7),
  ('woodwork',            'עבודות עץ',          8),
  ('scaffolding',         'פיגומים',            9),
  ('demolition',          'הריסה',              10);

-- ---------- seed: professions (data/mockData.ts PROFESSIONS_BY_CATEGORY) ----------
insert into public.professions (slug, name, category_slug, sort_order) values
  ('electrician',           'חשמלאי',        'electrical',         1),
  ('certified_electrician', 'חשמלאי מוסמך',  'electrical',         2),
  ('plumber',               'אינסטלטור',     'plumbing',           1),
  ('sewage_worker',         'ביובן',         'plumbing',           2),
  ('builder',               'בנאי',          'construction',       1),
  ('steel_fixer',           'ברזלן',         'construction',       2),
  ('formworker',            'טפסן',          'construction',       3),
  ('drywaller',             'גבסן',          'drywall_ceilings',   1),
  ('tiler',                 'רצף',           'flooring',           1),
  ('painter',               'צבע',           'painting',           1),
  ('whitewasher',           'סייד',          'painting',           2),
  ('metalworker',           'מסגר',          'metalwork_aluminum', 1),
  ('aluminum_worker',       'אלומיניום',     'metalwork_aluminum', 2),
  ('carpenter',             'נגר',           'woodwork',           1),
  ('scaffolder',            'פיגומאי',       'scaffolding',        1),
  ('demolition_worker',     'פועל הריסה',    'demolition',         1);

-- ---------- seed: areas (data/mockData.ts AREAS_ISRAEL) ----------
insert into public.areas (slug, name, sort_order) values
  ('center',    'מרכז',    1),
  ('sharon',    'שרון',    2),
  ('jerusalem', 'ירושלים', 3),
  ('north',     'צפון',    4),
  ('south',     'דרום',    5);

-- ---------- seed: project_types (data/mockData.ts PROJECT_TYPES) ----------
insert into public.project_types (slug, name, sort_order) values
  ('residential', 'מגורים', 1),
  ('commercial',  'מסחר',   2),
  ('public',      'ציבורי', 3),
  ('luxury',      'יוקרה',  4),
  ('industrial',  'תעשייה', 5);

-- ---------- seed: cities (data/israelCities.ts RAW_ISRAEL_CITIES, deduped by name) ----------
-- 159 cities.
insert into public.cities (name, lat, lon, aliases) values
  ('ירושלים', 31.7683, 35.2137, '{"Jerusalem"}'),
  ('תל אביב', 32.0853, 34.7818, '{"Tel Aviv","Tel Aviv-Yafo"}'),
  ('חיפה', 32.794, 34.9896, '{"Haifa"}'),
  ('ראשון לציון', 31.973, 34.7925, '{"Rishon LeZion","Rishon LeTsiyon"}'),
  ('פתח תקווה', 32.0917, 34.885, '{"Petah Tikva"}'),
  ('אשדוד', 31.8044, 34.6553, '{"Ashdod"}'),
  ('נתניה', 32.3215, 34.8532, '{"Netanya"}'),
  ('באר שבע', 31.2518, 34.7913, '{"Beer Sheva","Beersheba"}'),
  ('בני ברק', 32.0847, 34.8339, '{"Bnei Brak"}'),
  ('חולון', 32.0158, 34.7874, '{"Holon"}'),
  ('רמת גן', 32.0684, 34.8248, '{"Ramat Gan"}'),
  ('אשקלון', 31.6688, 34.5742, '{"Ashkelon"}'),
  ('רחובות', 31.8928, 34.8113, '{"Rehovot"}'),
  ('בת ים', 32.0171, 34.7503, '{"Bat Yam"}'),
  ('בית שמש', 31.7463, 34.9885, '{"Beit Shemesh"}'),
  ('כפר סבא', 32.175, 34.907, '{"Kfar Saba"}'),
  ('הרצליה', 32.1624, 34.8447, '{"Herzliya"}'),
  ('חדרה', 32.434, 34.9196, '{"Hadera"}'),
  ('מודיעין-מכבים-רעות', 31.8969, 35.0095, '{"Modiin","Modi''in-Maccabim-Reut"}'),
  ('נצרת', 32.7021, 35.2978, '{"Nazareth"}'),
  ('לוד', 31.9516, 34.8942, '{"Lod","Lydda"}'),
  ('רמלה', 31.9276, 34.8625, '{"Ramla","Ramle"}'),
  ('רעננה', 32.1848, 34.8713, '{"Ra''anana","Raanana"}'),
  ('מודיעין עילית', 31.9328, 35.045, '{"Modiin Illit","Kiryat Sefer"}'),
  ('רהט', 31.3925, 34.7539, '{"Rahat"}'),
  ('הוד השרון', 32.15, 34.8886, '{"Hod HaSharon"}'),
  ('גבעתיים', 32.0722, 34.8115, '{"Givatayim"}'),
  ('קריית אתא', 32.8064, 35.1119, '{"Kiryat Ata"}'),
  ('נהריה', 33.0084, 35.093, '{"Nahariya"}'),
  ('בית שאן', 32.4969, 35.4986, '{"Beit Shean","Beit She''an"}'),
  ('אילת', 29.5581, 34.9482, '{"Eilat"}'),
  ('עפולה', 32.6078, 35.2897, '{"Afula"}'),
  ('רמת השרון', 32.1467, 34.8398, '{"Ramat HaSharon"}'),
  ('כרמיאל', 32.9186, 35.295, '{"Karmiel"}'),
  ('יבנה', 31.8783, 34.7392, '{"Yavne"}'),
  ('טבריה', 32.7922, 35.5312, '{"Tiberias"}'),
  ('קריית גת', 31.61, 34.7642, '{"Kiryat Gat"}'),
  ('אור יהודה', 32.0333, 34.85, '{"Or Yehuda"}'),
  ('צפת', 32.9646, 35.496, '{"Safed","Tzfat","Zefat"}'),
  ('נס ציונה', 31.9292, 34.7969, '{"Nes Ziona","Ness Ziona"}'),
  ('אום אל פחם', 32.5178, 35.1522, '{"Umm al-Fahm"}'),
  ('קריית ביאליק', 32.8347, 35.0836, '{"Kiryat Bialik"}'),
  ('קריית ים', 32.8386, 35.0692, '{"Kiryat Yam"}'),
  ('קריית מוצקין', 32.8378, 35.0819, '{"Kiryat Motzkin"}'),
  ('קריית מלאכי', 31.7297, 34.7469, '{"Kiryat Malachi"}'),
  ('קריית שמונה', 33.2075, 35.5697, '{"Kiryat Shmona"}'),
  ('שפרעם', 32.8058, 35.1697, '{"Shefa-Amr","Shfaram"}'),
  ('נשר', 32.7681, 35.0433, '{"Nesher"}'),
  ('אריאל', 32.1058, 35.175, '{"Ariel"}'),
  ('דימונה', 31.0692, 35.0333, '{"Dimona"}'),
  ('טייבה', 32.2678, 35.0072, '{"Tayibe","Taibe"}'),
  ('טירה', 32.2333, 34.95, '{"Tira"}'),
  ('טירת כרמל', 32.7614, 34.9711, '{"Tirat Carmel"}'),
  ('יהוד-מונוסון', 32.0333, 34.8886, '{"Yehud","Yehud-Monosson"}'),
  ('יקנעם עילית', 32.6564, 35.1103, '{"Yokneam Illit","Yokneam"}'),
  ('עכו', 32.9281, 35.0819, '{"Akko","Acre"}'),
  ('ערד', 31.2589, 35.2128, '{"Arad"}'),
  ('פרדס חנה-כרכור', 32.4744, 34.9667, '{"Pardes Hanna-Karkur"}'),
  ('קלנסווה', 32.2833, 34.9833, '{"Qalansawe","Kalansua"}'),
  ('שדרות', 31.525, 34.5958, '{"Sderot"}'),
  ('אופקים', 31.3131, 34.6203, '{"Ofakim"}'),
  ('ביתר עילית', 31.697, 35.1214, '{"Beitar Illit","Betar Illit"}'),
  ('אלעד', 32.05, 34.95, '{"Elad"}'),
  ('מעלה אדומים', 31.7728, 35.2972, '{"Maale Adumim","Ma''ale Adumim"}'),
  ('מגדל העמק', 32.6742, 35.2419, '{"Migdal HaEmek"}'),
  ('ראש העין', 32.0956, 34.9569, '{"Rosh HaAyin"}'),
  ('נתיבות', 31.4222, 34.5883, '{"Netivot"}'),
  ('זכרון יעקב', 32.5714, 34.9522, '{"Zichron Yaakov"}'),
  ('שוהם', 31.9997, 34.9483, '{"Shoham"}'),
  ('גדרה', 31.8117, 34.7778, '{"Gedera"}'),
  ('ירוחם', 30.9886, 34.9297, '{"Yeruham"}'),
  ('טמרה', 32.8497, 35.1997, '{"Tamra"}'),
  ('סח''נין', 32.8656, 35.2953, '{"Sakhnin"}'),
  ('באקה אל-גרביה', 32.4167, 35.0333, '{"Baqa al-Gharbiyye"}'),
  ('גבעת שמואל', 32.0761, 34.8497, '{"Givat Shmuel"}'),
  ('מבשרת ציון', 31.8014, 35.1508, '{"Mevaseret Zion"}'),
  ('אבן יהודה', 32.2667, 34.8886, '{"Even Yehuda"}'),
  ('כפר יונה', 32.3172, 34.935, '{"Kfar Yona"}'),
  ('אור עקיבא', 32.5083, 34.9172, '{"Or Akiva"}'),
  ('בנימינה-גבעת עדה', 32.5186, 34.9522, '{"Binyamina-Giv''at Ada"}'),
  ('כוכב יאיר-צור יגאל', 32.2144, 34.9508, '{"Kokhav Yair"}'),
  ('גני תקווה', 32.0561, 34.8611, '{"Ganei Tikva"}'),
  ('אזור', 32.0247, 34.8114, '{"Azor"}'),
  ('קדימה-צורן', 32.2792, 34.9186, '{"Kadima-Zoran"}'),
  ('מזכרת בתיה', 31.8494, 34.8494, '{"Mazkeret Batya"}'),
  ('באר יעקב', 31.9425, 34.8378, '{"Beer Yaakov"}'),
  ('קריית טבעון', 32.7167, 35.1333, '{"Kiryat Tivon"}'),
  ('חצור הגלילית', 32.9906, 35.5406, '{"Hatzor HaGlilit"}'),
  ('ראש פינה', 32.9694, 35.5439, '{"Rosh Pina","Rosh Pinna"}'),
  ('מטולה', 33.2803, 35.5789, '{"Metula"}'),
  ('קצרין', 32.9925, 35.6906, '{"Qatzrin","Katzrin"}'),
  ('מעלות-תרשיחא', 33.0186, 35.2761, '{"Maalot-Tarshiha"}'),
  ('כפר ורדים', 33.0089, 35.2411, '{"Kfar Vradim"}'),
  ('מצפה רמון', 30.6094, 34.8011, '{"Mitzpe Ramon"}'),
  ('כסייפה', 31.2667, 34.95, '{"Kuseife"}'),
  ('חורה', 31.2833, 34.95, '{"Hura"}'),
  ('לקיה', 31.3572, 34.8306, '{"Lakiya"}'),
  ('תל שבע', 31.2842, 34.8494, '{"Tel Sheva"}'),
  ('דלית אל-כרמל', 32.6975, 35.0439, '{"Daliyat al-Karmel"}'),
  ('עוספיא', 32.6931, 35.0725, '{"Isfiya"}'),
  ('כפר קאסם', 32.1156, 34.975, '{"Kafr Qasim"}'),
  ('ג''לג''ולייה', 32.1006, 34.9422, '{"Jaljulia"}'),
  ('כפר מנדא', 32.8214, 35.2606, '{"Kafr Manda"}'),
  ('עראבה', 32.8514, 35.3369, '{"Arraba"}'),
  ('כפר כנא', 32.7519, 35.3436, '{"Kafr Kanna"}'),
  ('יפיע', 32.6961, 35.2864, '{"Yafi''a"}'),
  ('ריינה', 32.7233, 35.3072, '{"Reineh"}'),
  ('בית ג''ן', 32.9564, 35.3944, '{"Beit Jann"}'),
  ('מגאר', 32.8722, 35.4022, '{"Maghar"}'),
  ('ג''ת', 32.3917, 35.0125, '{"Jatt"}'),
  ('אבו סנאן', 32.9583, 35.1706, '{"Abu Sinan"}'),
  ('ג''דיידה-מכר', 32.9436, 35.1467, '{"Jadeidi-Makr"}'),
  ('כפר יאסיף', 32.9481, 35.1544, '{"Kafr Yasif"}'),
  ('נחף', 32.9364, 35.2947, '{"Nahf"}'),
  ('כאבול', 32.8208, 35.1969, '{"Kabul"}'),
  ('ראמה', 32.9333, 35.3667, '{"Rameh"}'),
  ('גבעת זאב', 31.8514, 35.1747, '{"Givat Zeev"}'),
  ('עפרה', 31.9535, 35.2939, '{"Ofra"}'),
  ('קרני שומרון', 32.1878, 35.0433, '{"Karnei Shomron"}'),
  ('אלפי מנשה', 32.1611, 34.995, '{"Alfei Menashe"}'),
  ('אורנית', 32.1017, 34.9975, '{"Oranit"}'),
  ('אלקנה', 32.1119, 35.0128, '{"Elkana"}'),
  ('עמנואל', 32.2211, 35.0428, '{"Immanuel"}'),
  ('ברקן', 32.1156, 35.1097, '{"Barkan"}'),
  ('קריית ארבע', 31.525, 35.109, '{"Kiryat Arba"}'),
  ('חשמונאים', 31.9345, 35.0224, '{"Hashmonaim"}'),
  ('לפיד', 31.9494, 34.9975, '{"Lapid"}'),
  ('נופך', 31.9403, 34.9977, '{}'),
  ('שילת', 31.9245, 35.018, '{"Shilat"}'),
  ('מבוא חורון', 31.8564, 34.9985, '{"Mevo Horon"}'),
  ('נס הרים', 31.7397, 35.0642, '{"Nes Harim"}'),
  ('צור הדסה', 31.7297, 35.1078, '{"Tzur Hadassah"}'),
  ('אפרתה', 31.6564, 35.1483, '{"Efrat"}'),
  ('תקוע', 31.6486, 35.2214, '{"Tekoa"}'),
  ('נווה דניאל', 31.6398, 35.1252, '{"Neve Daniel"}'),
  ('אלון שבות', 31.6425, 35.1197, '{"Alon Shvut"}'),
  ('כרמי צור', 31.6033, 35.1147, '{"Karmei Tzur"}'),
  ('שגב שלום', 31.2064, 34.8156, '{"Segev Shalom"}'),
  ('ערערה', 32.5006, 35.1058, '{"Ar''ara"}'),
  ('ג''סר א-זרקא', 32.5372, 34.9106, '{"Jisr az-Zarqa"}'),
  ('פוריידיס', 32.5722, 34.9531, '{"Fureidis"}'),
  ('זמר', 32.3383, 35.0333, '{"Zemer"}'),
  ('מגד אל-כרום', 32.9111, 35.2408, '{"Majd al-Krum"}'),
  ('אעבלין', 32.8272, 35.1972, '{"Ibillin"}'),
  ('כפר ברא', 32.1233, 34.9439, '{"Kafr Bara"}'),
  ('תל מונד', 32.2478, 34.9736, '{"Tel Mond"}'),
  ('שדה ורבורג', 32.3011, 34.9397, '{}'),
  ('בת חפר', 32.3086, 34.9989, '{"Bat Hefer"}'),
  ('משמרת', 32.3944, 34.9508, '{"Mishmeret"}'),
  ('ניר צבי', 31.9722, 34.8811, '{}'),
  ('גן יבנה', 31.7853, 34.7058, '{"Gan Yavne"}'),
  ('קריית עקרון', 31.8656, 34.8228, '{"Kiryat Ekron"}'),
  ('אחיסמך', 31.96, 34.87, '{}'),
  ('כפר סירקין', 32.1042, 34.8969, '{"Kfar Sirkin"}'),
  ('מגשימים', 32.1069, 34.8853, '{"Magshimim"}'),
  ('עומר', 31.2664, 34.8467, '{"Omer"}'),
  ('להבים', 31.3661, 34.7756, '{"Lehavim"}'),
  ('מיתר', 31.3306, 34.9022, '{"Meitar"}'),
  ('ערוער', 31.1958, 34.9647, '{}');

-- ---------- backfill: cities.area_slug for the subset mapped in utils/matching.ts CITY_AREA ----------
update public.cities set area_slug = 'center'
  where name in ('תל אביב', 'רמת גן', 'גבעתיים', 'בני ברק', 'פתח תקווה', 'ראשון לציון', 'רחובות', 'חולון');
update public.cities set area_slug = 'sharon'
  where name in ('הרצליה', 'רעננה', 'כפר סבא', 'נתניה');
update public.cities set area_slug = 'jerusalem'
  where name in ('ירושלים', 'בית שמש');
update public.cities set area_slug = 'north'
  where name in ('חיפה', 'קריית אתא', 'קריית ביאליק', 'נצרת', 'עכו');
update public.cities set area_slug = 'south'
  where name in ('באר שבע', 'אשדוד', 'אשקלון');
