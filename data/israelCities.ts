/**
 * Curated list of Israeli cities, towns and larger localities, used by
 * CityPickerField wherever the app asks for a "עיר מגורים" (city of
 * residence) — worker/contractor sign-up and profile editing.
 *
 * This is intentionally a much broader list than CITIES_ISRAEL in
 * mockData.ts, which stays small on purpose (it only powers "all cities"
 * filter chips elsewhere in the app and must not be touched here).
 *
 * Every locality carries approximate coordinates (used for nearest-match
 * when "use my current location" is picked) and, for well-known places,
 * English/transliterated aliases (used only to match reverse-geocoding
 * results — the canonical `name` is always Hebrew and is the only value
 * ever handed back to callers).
 */

export interface IsraelCity {
  /** Canonical Hebrew name — the only value ever passed to onChange / stored. */
  name: string;
  /** English/transliterated alternate spellings, used only for matching. */
  aliases?: string[];
  lat: number;
  lon: number;
}

const RAW_ISRAEL_CITIES: IsraelCity[] = [
  // ---- Major cities -------------------------------------------------
  { name: 'ירושלים', aliases: ['Jerusalem'], lat: 31.7683, lon: 35.2137 },
  { name: 'תל אביב', aliases: ['Tel Aviv', 'Tel Aviv-Yafo'], lat: 32.0853, lon: 34.7818 },
  { name: 'חיפה', aliases: ['Haifa'], lat: 32.794, lon: 34.9896 },
  { name: 'ראשון לציון', aliases: ['Rishon LeZion', 'Rishon LeTsiyon'], lat: 31.973, lon: 34.7925 },
  { name: 'פתח תקווה', aliases: ['Petah Tikva'], lat: 32.0917, lon: 34.885 },
  { name: 'אשדוד', aliases: ['Ashdod'], lat: 31.8044, lon: 34.6553 },
  { name: 'נתניה', aliases: ['Netanya'], lat: 32.3215, lon: 34.8532 },
  { name: 'באר שבע', aliases: ['Beer Sheva', 'Beersheba'], lat: 31.2518, lon: 34.7913 },
  { name: 'בני ברק', aliases: ['Bnei Brak'], lat: 32.0847, lon: 34.8339 },
  { name: 'חולון', aliases: ['Holon'], lat: 32.0158, lon: 34.7874 },
  { name: 'רמת גן', aliases: ['Ramat Gan'], lat: 32.0684, lon: 34.8248 },
  { name: 'אשקלון', aliases: ['Ashkelon'], lat: 31.6688, lon: 34.5742 },
  { name: 'רחובות', aliases: ['Rehovot'], lat: 31.8928, lon: 34.8113 },
  { name: 'בת ים', aliases: ['Bat Yam'], lat: 32.0171, lon: 34.7503 },
  { name: 'בית שמש', aliases: ['Beit Shemesh'], lat: 31.7463, lon: 34.9885 },
  { name: 'כפר סבא', aliases: ['Kfar Saba'], lat: 32.175, lon: 34.907 },
  { name: 'הרצליה', aliases: ['Herzliya'], lat: 32.1624, lon: 34.8447 },
  { name: 'חדרה', aliases: ['Hadera'], lat: 32.434, lon: 34.9196 },
  { name: 'מודיעין-מכבים-רעות', aliases: ['Modiin', "Modi'in-Maccabim-Reut"], lat: 31.8969, lon: 35.0095 },
  { name: 'נצרת', aliases: ['Nazareth'], lat: 32.7021, lon: 35.2978 },
  { name: 'לוד', aliases: ['Lod', 'Lydda'], lat: 31.9516, lon: 34.8942 },
  { name: 'רמלה', aliases: ['Ramla', 'Ramle'], lat: 31.9276, lon: 34.8625 },
  { name: 'רעננה', aliases: ["Ra'anana", 'Raanana'], lat: 32.1848, lon: 34.8713 },
  { name: 'מודיעין עילית', aliases: ['Modiin Illit', 'Kiryat Sefer'], lat: 31.9328, lon: 35.045 },
  { name: 'רהט', aliases: ['Rahat'], lat: 31.3925, lon: 34.7539 },
  { name: 'הוד השרון', aliases: ['Hod HaSharon'], lat: 32.15, lon: 34.8886 },
  { name: 'גבעתיים', aliases: ['Givatayim'], lat: 32.0722, lon: 34.8115 },
  { name: 'קריית אתא', aliases: ['Kiryat Ata'], lat: 32.8064, lon: 35.1119 },
  { name: 'נהריה', aliases: ['Nahariya'], lat: 33.0084, lon: 35.093 },
  { name: 'בית שאן', aliases: ['Beit Shean', "Beit She'an"], lat: 32.4969, lon: 35.4986 },
  { name: 'אילת', aliases: ['Eilat'], lat: 29.5581, lon: 34.9482 },
  { name: 'עפולה', aliases: ['Afula'], lat: 32.6078, lon: 35.2897 },
  { name: 'רמת השרון', aliases: ['Ramat HaSharon'], lat: 32.1467, lon: 34.8398 },
  { name: 'כרמיאל', aliases: ['Karmiel'], lat: 32.9186, lon: 35.295 },
  { name: 'יבנה', aliases: ['Yavne'], lat: 31.8783, lon: 34.7392 },
  { name: 'טבריה', aliases: ['Tiberias'], lat: 32.7922, lon: 35.5312 },
  { name: 'קריית גת', aliases: ['Kiryat Gat'], lat: 31.61, lon: 34.7642 },
  { name: 'אור יהודה', aliases: ['Or Yehuda'], lat: 32.0333, lon: 34.85 },
  { name: 'צפת', aliases: ['Safed', 'Tzfat', 'Zefat'], lat: 32.9646, lon: 35.496 },
  { name: 'נס ציונה', aliases: ['Nes Ziona', 'Ness Ziona'], lat: 31.9292, lon: 34.7969 },
  { name: 'אום אל פחם', aliases: ['Umm al-Fahm'], lat: 32.5178, lon: 35.1522 },
  { name: 'קריית ביאליק', aliases: ['Kiryat Bialik'], lat: 32.8347, lon: 35.0836 },
  { name: 'קריית ים', aliases: ['Kiryat Yam'], lat: 32.8386, lon: 35.0692 },
  { name: 'קריית מוצקין', aliases: ['Kiryat Motzkin'], lat: 32.8378, lon: 35.0819 },
  { name: 'קריית מלאכי', aliases: ['Kiryat Malachi'], lat: 31.7297, lon: 34.7469 },
  { name: 'קריית שמונה', aliases: ['Kiryat Shmona'], lat: 33.2075, lon: 35.5697 },
  { name: 'שפרעם', aliases: ['Shefa-Amr', 'Shfaram'], lat: 32.8058, lon: 35.1697 },
  { name: 'נשר', aliases: ['Nesher'], lat: 32.7681, lon: 35.0433 },
  { name: 'אריאל', aliases: ['Ariel'], lat: 32.1058, lon: 35.175 },
  { name: 'דימונה', aliases: ['Dimona'], lat: 31.0692, lon: 35.0333 },
  { name: 'טייבה', aliases: ['Tayibe', 'Taibe'], lat: 32.2678, lon: 35.0072 },
  { name: 'טירה', aliases: ['Tira'], lat: 32.2333, lon: 34.95 },
  { name: 'טירת כרמל', aliases: ['Tirat Carmel'], lat: 32.7614, lon: 34.9711 },
  { name: 'יהוד-מונוסון', aliases: ['Yehud', 'Yehud-Monosson'], lat: 32.0333, lon: 34.8886 },
  { name: 'יקנעם עילית', aliases: ['Yokneam Illit', 'Yokneam'], lat: 32.6564, lon: 35.1103 },
  { name: 'עכו', aliases: ['Akko', 'Acre'], lat: 32.9281, lon: 35.0819 },
  { name: 'ערד', aliases: ['Arad'], lat: 31.2589, lon: 35.2128 },
  { name: 'פרדס חנה-כרכור', aliases: ['Pardes Hanna-Karkur'], lat: 32.4744, lon: 34.9667 },
  { name: 'קלנסווה', aliases: ['Qalansawe', 'Kalansua'], lat: 32.2833, lon: 34.9833 },
  { name: 'שדרות', aliases: ['Sderot'], lat: 31.525, lon: 34.5958 },
  { name: 'אופקים', aliases: ['Ofakim'], lat: 31.3131, lon: 34.6203 },
  { name: 'ביתר עילית', aliases: ['Beitar Illit', 'Betar Illit'], lat: 31.697, lon: 35.1214 },
  { name: 'אלעד', aliases: ['Elad'], lat: 32.05, lon: 34.95 },
  { name: 'מעלה אדומים', aliases: ['Maale Adumim', "Ma'ale Adumim"], lat: 31.7728, lon: 35.2972 },
  { name: 'מגדל העמק', aliases: ['Migdal HaEmek'], lat: 32.6742, lon: 35.2419 },
  { name: 'ראש העין', aliases: ['Rosh HaAyin'], lat: 32.0956, lon: 34.9569 },
  { name: 'נתיבות', aliases: ['Netivot'], lat: 31.4222, lon: 34.5883 },
  { name: 'זכרון יעקב', aliases: ['Zichron Yaakov'], lat: 32.5714, lon: 34.9522 },
  { name: 'שוהם', aliases: ['Shoham'], lat: 31.9997, lon: 34.9483 },
  { name: 'גדרה', aliases: ['Gedera'], lat: 31.8117, lon: 34.7778 },
  { name: 'ירוחם', aliases: ['Yeruham'], lat: 30.9886, lon: 34.9297 },
  { name: 'טמרה', aliases: ['Tamra'], lat: 32.8497, lon: 35.1997 },
  { name: "סח'נין", aliases: ['Sakhnin'], lat: 32.8656, lon: 35.2953 },
  { name: 'באקה אל-גרביה', aliases: ['Baqa al-Gharbiyye'], lat: 32.4167, lon: 35.0333 },

  // ---- Well-known towns and larger local councils --------------------
  { name: 'גבעת שמואל', aliases: ['Givat Shmuel'], lat: 32.0761, lon: 34.8497 },
  { name: 'מבשרת ציון', aliases: ['Mevaseret Zion'], lat: 31.8014, lon: 35.1508 },
  { name: 'אבן יהודה', aliases: ['Even Yehuda'], lat: 32.2667, lon: 34.8886 },
  { name: 'כפר יונה', aliases: ['Kfar Yona'], lat: 32.3172, lon: 34.935 },
  { name: 'אור עקיבא', aliases: ['Or Akiva'], lat: 32.5083, lon: 34.9172 },
  { name: 'בנימינה-גבעת עדה', aliases: ["Binyamina-Giv'at Ada"], lat: 32.5186, lon: 34.9522 },
  { name: 'כוכב יאיר-צור יגאל', aliases: ['Kokhav Yair'], lat: 32.2144, lon: 34.9508 },
  { name: 'גני תקווה', aliases: ['Ganei Tikva'], lat: 32.0561, lon: 34.8611 },
  { name: 'אזור', aliases: ['Azor'], lat: 32.0247, lon: 34.8114 },
  { name: 'קדימה-צורן', aliases: ['Kadima-Zoran'], lat: 32.2792, lon: 34.9186 },
  { name: 'מזכרת בתיה', aliases: ['Mazkeret Batya'], lat: 31.8494, lon: 34.8494 },
  { name: 'באר יעקב', aliases: ['Beer Yaakov'], lat: 31.9425, lon: 34.8378 },
  { name: 'קריית טבעון', aliases: ['Kiryat Tivon'], lat: 32.7167, lon: 35.1333 },
  { name: 'חצור הגלילית', aliases: ['Hatzor HaGlilit'], lat: 32.9906, lon: 35.5406 },
  { name: 'ראש פינה', aliases: ['Rosh Pina', 'Rosh Pinna'], lat: 32.9694, lon: 35.5439 },
  { name: 'מטולה', aliases: ['Metula'], lat: 33.2803, lon: 35.5789 },
  { name: 'קצרין', aliases: ['Qatzrin', 'Katzrin'], lat: 32.9925, lon: 35.6906 },
  { name: 'מעלות-תרשיחא', aliases: ['Maalot-Tarshiha'], lat: 33.0186, lon: 35.2761 },
  { name: 'כפר ורדים', aliases: ['Kfar Vradim'], lat: 33.0089, lon: 35.2411 },
  { name: 'מצפה רמון', aliases: ['Mitzpe Ramon'], lat: 30.6094, lon: 34.8011 },
  { name: 'כסייפה', aliases: ['Kuseife'], lat: 31.2667, lon: 34.95 },
  { name: 'חורה', aliases: ['Hura'], lat: 31.2833, lon: 34.95 },
  { name: 'לקיה', aliases: ['Lakiya'], lat: 31.3572, lon: 34.8306 },
  { name: 'תל שבע', aliases: ['Tel Sheva'], lat: 31.2842, lon: 34.8494 },
  { name: 'דלית אל-כרמל', aliases: ['Daliyat al-Karmel'], lat: 32.6975, lon: 35.0439 },
  { name: 'עוספיא', aliases: ['Isfiya'], lat: 32.6931, lon: 35.0725 },
  { name: 'כפר קאסם', aliases: ['Kafr Qasim'], lat: 32.1156, lon: 34.975 },
  { name: "ג'לג'ולייה", aliases: ['Jaljulia'], lat: 32.1006, lon: 34.9422 },
  { name: 'כפר מנדא', aliases: ['Kafr Manda'], lat: 32.8214, lon: 35.2606 },
  { name: 'עראבה', aliases: ['Arraba'], lat: 32.8514, lon: 35.3369 },
  { name: 'כפר כנא', aliases: ['Kafr Kanna'], lat: 32.7519, lon: 35.3436 },
  { name: 'יפיע', aliases: ["Yafi'a"], lat: 32.6961, lon: 35.2864 },
  { name: 'ריינה', aliases: ['Reineh'], lat: 32.7233, lon: 35.3072 },
  { name: "בית ג'ן", aliases: ['Beit Jann'], lat: 32.9564, lon: 35.3944 },
  { name: 'מגאר', aliases: ['Maghar'], lat: 32.8722, lon: 35.4022 },
  { name: "ג'ת", aliases: ['Jatt'], lat: 32.3917, lon: 35.0125 },
  { name: 'אבו סנאן', aliases: ['Abu Sinan'], lat: 32.9583, lon: 35.1706 },
  { name: "ג'דיידה-מכר", aliases: ['Jadeidi-Makr'], lat: 32.9436, lon: 35.1467 },
  { name: 'כפר יאסיף', aliases: ['Kafr Yasif'], lat: 32.9481, lon: 35.1544 },
  { name: 'נחף', aliases: ['Nahf'], lat: 32.9364, lon: 35.2947 },
  { name: 'כאבול', aliases: ['Kabul'], lat: 32.8208, lon: 35.1969 },
  { name: 'ראמה', aliases: ['Rameh'], lat: 32.9333, lon: 35.3667 },
  { name: 'גבעת זאב', aliases: ['Givat Zeev'], lat: 31.8514, lon: 35.1747 },
  { name: 'עפרה', aliases: ['Ofra'], lat: 31.9535, lon: 35.2939 },
  { name: 'קרני שומרון', aliases: ['Karnei Shomron'], lat: 32.1878, lon: 35.0433 },
  { name: 'אלפי מנשה', aliases: ['Alfei Menashe'], lat: 32.1611, lon: 34.995 },
  { name: 'אורנית', aliases: ['Oranit'], lat: 32.1017, lon: 34.9975 },
  { name: 'אלקנה', aliases: ['Elkana'], lat: 32.1119, lon: 35.0128 },
  { name: 'עמנואל', aliases: ['Immanuel'], lat: 32.2211, lon: 35.0428 },
  { name: 'ברקן', aliases: ['Barkan'], lat: 32.1156, lon: 35.1097 },
  { name: 'קריית ארבע', aliases: ['Kiryat Arba'], lat: 31.525, lon: 35.109 },
  { name: 'חשמונאים', aliases: ['Hashmonaim'], lat: 31.9345, lon: 35.0224 },
  { name: 'לפיד', aliases: ['Lapid'], lat: 31.9494, lon: 34.9975 },
  { name: 'נופך', lat: 31.9403, lon: 34.9977 },
  { name: 'שילת', aliases: ['Shilat'], lat: 31.9245, lon: 35.018 },
  { name: 'מבוא חורון', aliases: ['Mevo Horon'], lat: 31.8564, lon: 34.9985 },
  { name: 'נס הרים', aliases: ['Nes Harim'], lat: 31.7397, lon: 35.0642 },
  { name: 'צור הדסה', aliases: ['Tzur Hadassah'], lat: 31.7297, lon: 35.1078 },
  { name: 'אפרתה', aliases: ['Efrat'], lat: 31.6564, lon: 35.1483 },
  { name: 'תקוע', aliases: ['Tekoa'], lat: 31.6486, lon: 35.2214 },
  { name: 'נווה דניאל', aliases: ['Neve Daniel'], lat: 31.6398, lon: 35.1252 },
  { name: 'אלון שבות', aliases: ['Alon Shvut'], lat: 31.6425, lon: 35.1197 },
  { name: 'כרמי צור', aliases: ['Karmei Tzur'], lat: 31.6033, lon: 35.1147 },
  { name: 'שגב שלום', aliases: ['Segev Shalom'], lat: 31.2064, lon: 34.8156 },
  { name: 'ערערה', aliases: ["Ar'ara"], lat: 32.5006, lon: 35.1058 },
  { name: "ג'סר א-זרקא", aliases: ['Jisr az-Zarqa'], lat: 32.5372, lon: 34.9106 },
  { name: 'פוריידיס', aliases: ['Fureidis'], lat: 32.5722, lon: 34.9531 },
  { name: 'זמר', aliases: ['Zemer'], lat: 32.3383, lon: 35.0333 },
  { name: 'מגד אל-כרום', aliases: ['Majd al-Krum'], lat: 32.9111, lon: 35.2408 },
  { name: 'אעבלין', aliases: ['Ibillin'], lat: 32.8272, lon: 35.1972 },
  { name: 'כפר ברא', aliases: ['Kafr Bara'], lat: 32.1233, lon: 34.9439 },
  { name: 'תל מונד', aliases: ['Tel Mond'], lat: 32.2478, lon: 34.9736 },
  { name: 'שדה ורבורג', lat: 32.3011, lon: 34.9397 },
  { name: 'בת חפר', aliases: ['Bat Hefer'], lat: 32.3086, lon: 34.9989 },
  { name: 'משמרת', aliases: ['Mishmeret'], lat: 32.3944, lon: 34.9508 },
  { name: 'ניר צבי', lat: 31.9722, lon: 34.8811 },
  { name: 'גן יבנה', aliases: ['Gan Yavne'], lat: 31.7853, lon: 34.7058 },
  { name: 'קריית עקרון', aliases: ['Kiryat Ekron'], lat: 31.8656, lon: 34.8228 },
  { name: 'אחיסמך', lat: 31.96, lon: 34.87 },
  { name: 'כפר סירקין', aliases: ['Kfar Sirkin'], lat: 32.1042, lon: 34.8969 },
  { name: 'מגשימים', aliases: ['Magshimim'], lat: 32.1069, lon: 34.8853 },
  { name: 'עומר', aliases: ['Omer'], lat: 31.2664, lon: 34.8467 },
  { name: 'להבים', aliases: ['Lehavim'], lat: 31.3661, lon: 34.7756 },
  { name: 'מיתר', aliases: ['Meitar'], lat: 31.3306, lon: 34.9022 },
  { name: 'ערוער', lat: 31.1958, lon: 34.9647 },
];

const dedupedByName = new Map<string, IsraelCity>();
for (const city of RAW_ISRAEL_CITIES) {
  if (!dedupedByName.has(city.name)) dedupedByName.set(city.name, city);
}

/** Structured, Hebrew-locale-sorted city dataset — the single source of
 *  truth for both manual search and "use my current location" matching. */
export const ISRAEL_CITIES_DATA: IsraelCity[] = Array.from(dedupedByName.values()).sort(
  (a, b) => a.name.localeCompare(b.name, 'he')
);

/** Flat, sorted list of canonical Hebrew names — what CityPickerField renders. */
export const ISRAEL_CITIES: string[] = ISRAEL_CITIES_DATA.map((c) => c.name);

const normalizeForMatch = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/["'׳]/g, '')
    .replace(/[\s-]+/g, ' ');

/**
 * Matches a free-text place name (Hebrew, English or transliterated —
 * e.g. a raw `city`/`subregion` value from reverseGeocodeAsync) against
 * each locality's canonical Hebrew name and its aliases. Returns the
 * matching IsraelCity entry, never the raw input — the caller must use
 * `entry.name` for anything it stores or displays.
 */
export const findCityByNameOrAlias = (raw: string | null | undefined): IsraelCity | undefined => {
  if (!raw) return undefined;
  const target = normalizeForMatch(raw);
  if (!target) return undefined;

  const candidatesOf = (c: IsraelCity) => [c.name, ...(c.aliases ?? [])].map(normalizeForMatch);

  const exact = ISRAEL_CITIES_DATA.find((c) => candidatesOf(c).includes(target));
  if (exact) return exact;

  return ISRAEL_CITIES_DATA.find((c) =>
    candidatesOf(c).some((cand) => cand.startsWith(target) || target.startsWith(cand) || cand.includes(target) || target.includes(cand))
  );
};

const toRad = (deg: number) => (deg * Math.PI) / 180;

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Finds the geographically nearest locality in the dataset to the given
 * coordinates (used as the fallback for "use my current location" when
 * reverse-geocoding didn't yield a name we recognize).
 */
export const findClosestIsraelCity = (lat: number, lon: number): IsraelCity | undefined => {
  let best: IsraelCity | undefined;
  let bestDistanceKm = Infinity;
  for (const city of ISRAEL_CITIES_DATA) {
    const d = haversineKm(lat, lon, city.lat, city.lon);
    if (d < bestDistanceKm) {
      bestDistanceKm = d;
      best = city;
    }
  }
  return best;
};
