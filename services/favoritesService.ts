// =============================================================================
// BuildUp – Favorites service (real backend READ + write layer)
// =============================================================================
// Private, viewer-specific bookmark lists. Two independent relationships, one
// table each (migration 007, RLS tightened in 013):
//   • contractor_favorite_workers(contractor_id, worker_id, created_at)
//       PK (contractor_id, worker_id)  — a contractor bookmarking a worker
//   • worker_favorite_contractors(worker_id, contractor_id, created_at)
//       PK (worker_id, contractor_id)  — a worker bookmarking a contractor
//
// RLS (all `to authenticated`, no anon, no admin write):
//   SELECT  own rows (contractor_id / worker_id = auth.uid()) OR is_admin()
//   INSERT  with check own                         (cannot favorite for someone else)
//   DELETE  using own                              (cannot unfavorite someone else's)
// The composite PK makes a duplicate favorite a no-op, and the profile FKs
// cascade so a deleted target entity takes its favorite rows with it.
//
// No RPC needed — plain RLS-scoped SELECT / upsert / delete. There is NO
// notification / email side effect: favoriting is a silent preference action.
// AppContext keeps the results in the same `favoriteWorkers` /
// `favoriteContractors` arrays every selector already reads. No-op on the mock
// path (call sites are gated on `isBackendEnabled()`).
// =============================================================================

import { getSupabase } from './supabaseClient';

// ---------------------------------------------------------------------------
// Contractor -> Worker favorites
// ---------------------------------------------------------------------------

/** Worker ids the signed-in contractor has favorited (RLS scopes to auth.uid()). */
export async function listFavoriteWorkerIds(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from('contractor_favorite_workers')
    .select('worker_id');
  if (error) throw error;
  return ((data as { worker_id: string }[] | null) ?? []).map((r) => r.worker_id);
}

/** Add one favorite worker. Idempotent — a duplicate hits the composite PK and
 *  is ignored rather than erroring. `contractorId` must be the caller's own id
 *  (RLS with-check enforces it server-side regardless). */
export async function addFavoriteWorker(
  contractorId: string,
  workerId: string
): Promise<void> {
  const { error } = await getSupabase()
    .from('contractor_favorite_workers')
    .upsert(
      { contractor_id: contractorId, worker_id: workerId },
      { onConflict: 'contractor_id,worker_id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

/** Remove one favorite worker. A no-op if the row is already gone. */
export async function removeFavoriteWorker(
  contractorId: string,
  workerId: string
): Promise<void> {
  const { error } = await getSupabase()
    .from('contractor_favorite_workers')
    .delete()
    .eq('contractor_id', contractorId)
    .eq('worker_id', workerId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Worker -> Contractor favorites (mirror of the above)
// ---------------------------------------------------------------------------

/** Contractor ids the signed-in worker has favorited (RLS scopes to auth.uid()). */
export async function listFavoriteContractorIds(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from('worker_favorite_contractors')
    .select('contractor_id');
  if (error) throw error;
  return ((data as { contractor_id: string }[] | null) ?? []).map(
    (r) => r.contractor_id
  );
}

/** Add one favorite contractor. Idempotent (composite PK). */
export async function addFavoriteContractor(
  workerId: string,
  contractorId: string
): Promise<void> {
  const { error } = await getSupabase()
    .from('worker_favorite_contractors')
    .upsert(
      { worker_id: workerId, contractor_id: contractorId },
      { onConflict: 'worker_id,contractor_id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

/** Remove one favorite contractor. A no-op if the row is already gone. */
export async function removeFavoriteContractor(
  workerId: string,
  contractorId: string
): Promise<void> {
  const { error } = await getSupabase()
    .from('worker_favorite_contractors')
    .delete()
    .eq('worker_id', workerId)
    .eq('contractor_id', contractorId);
  if (error) throw error;
}
