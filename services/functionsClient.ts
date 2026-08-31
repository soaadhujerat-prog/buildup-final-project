// =============================================================================
// BuildUp – Edge Function invoke helper (Phase 3B)
// =============================================================================
// Shared wrapper around supabase.functions.invoke that unpacks the
// `{ ok: false, error: '<code>' }` body every BuildUp function returns, so
// callers get a typed error `code` instead of a generic failure. Mirrors the
// private helper in services/registrationService.ts (kept separate to avoid
// touching the verified Phase 3A file).
// =============================================================================

import { getSupabase } from './supabaseClient';

export class FunctionError extends Error {
  code: string;
  status?: number;
  constructor(code: string, status?: number) {
    super(code);
    this.name = 'FunctionError';
    this.code = code;
    this.status = status;
  }
}

export async function invokeFn<T>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T>(name, { body });
  if (error) {
    let code = 'server';
    let status: number | undefined;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.status === 'number') status = ctx.status;
    try {
      if (ctx && typeof ctx.json === 'function') {
        const j = (await ctx.json()) as { error?: string };
        if (j && typeof j.error === 'string') code = j.error;
      }
    } catch {
      /* body already consumed / not json */
    }
    throw new FunctionError(code, status);
  }
  return data as T;
}
