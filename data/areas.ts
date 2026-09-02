// =============================================================================
// BuildUp – Operating areas + project types (static reference data)
// =============================================================================
// Fixed Israel-domain lists used by the registration + profile forms
// (contractor areas of operation, worker preferred areas, contractor project
// types). Mirrors the `areas` / `project_types` tables seeded in migration 001.
// Not business data.
// =============================================================================

/** Regions a contractor operates in / a worker prefers to work in. */
export const AREAS_ISRAEL = ['מרכז', 'שרון', 'ירושלים', 'צפון', 'דרום'];

/** Project types a contractor selects during registration. */
export const PROJECT_TYPES = ['מגורים', 'מסחר', 'ציבורי', 'יוקרה', 'תעשייה'];
