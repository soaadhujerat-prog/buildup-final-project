// =============================================================================
// BuildUp – self ID-number reveal (backend path)
// =============================================================================
// The user's OWN national ID, decrypted server-side by the `reveal-my-id` Edge
// Function. The identity row is chosen from `auth.uid()` alone — this client
// passes NO target id. The plaintext is returned transiently for display only;
// callers must NOT persist it (no AsyncStorage, no AppContext).
//
// `invokeFn` throws `FunctionError` on a non-2xx; a legacy row with no
// ciphertext yet surfaces as `FunctionError` with `code === 'unavailable'`
// (HTTP 404) — the caller shows a "will appear after your next login" message
// rather than a blank value.
// =============================================================================

import { invokeFn } from './functionsClient';

export async function revealMyIdNumber(): Promise<string> {
  const res = await invokeFn<{ ok: boolean; idNumber?: string }>(
    'reveal-my-id',
    {},
  );
  if (!res.ok || !res.idNumber) throw new Error('self_id_reveal_failed');
  return res.idNumber;
}
