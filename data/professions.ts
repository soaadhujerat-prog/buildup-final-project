// =============================================================================
// BuildUp – Profession taxonomy (static reference data)
// =============================================================================
// The fixed profession category / trade lists the registration + profile +
// job-posting forms use for their pickers. This is NOT business data — it is
// domain reference data that mirrors the `profession_categories` /
// `professions` tables seeded in migration 001.
// =============================================================================

/** Category labels for the profession picker. `'כל המקצועות'` is a UI-only
 *  "all" sentinel — filter it out where a concrete category is required. */
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

/** Trades available under each category. */
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
