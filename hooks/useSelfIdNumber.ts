// =============================================================================
// BuildUp – useSelfIdNumber
// =============================================================================
// Shared by the Worker and Contractor own-Profile screens to show the logged-in
// user's OWN national ID in the existing read-only "ת.ז / תעודת זהות" row.
//
//   • one call to the `reveal-my-id` Edge Function on mount (auth.uid() decides
//     the identity; nothing is persisted).
//       ready       -> the digits
//       unavailable -> legacy row, no ciphertext yet (heals on next login)
//       error       -> transient failure
//
// Returns a ready-to-render `{ text, isNumber }` plus the raw `state`/`idNumber`
// for callers that want them. The ID is never written to storage or context.
// =============================================================================

import { useEffect, useRef, useState } from 'react';

import { FunctionError } from '../services/functionsClient';
import { revealMyIdNumber } from '../services/selfIdService';

export type SelfIdState = 'loading' | 'ready' | 'unavailable' | 'error';

export interface SelfIdNumber {
  state: SelfIdState;
  /** the digits — only when state === 'ready' */
  idNumber?: string;
  /** ready-to-render string for the read-only row */
  text: string;
  /** true only when `text` is the actual number (drives monospace styling) */
  isNumber: boolean;
}

const LEGACY_TEXT = 'יופיע אוטומטית לאחר ההתחברות הבאה עם ת"ז וסיסמה';
const ERROR_TEXT = 'לא ניתן להציג כעת — נסה/י לרענן';
const LOADING_TEXT = 'טוען…';

export function useSelfIdNumber(): SelfIdNumber {
  const [state, setState] = useState<SelfIdState>('loading');
  const [idNumber, setIdNumber] = useState<string | undefined>(undefined);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let alive = true;
    revealMyIdNumber()
      .then((v) => {
        if (!alive) return;
        setIdNumber(v);
        setState('ready');
      })
      .catch((e) => {
        if (!alive) return;
        // Only the function's own body `{ error: 'unavailable' }` means "legacy
        // row, no ciphertext yet". A bare transport 404 (e.g. function not
        // deployed) is a real error, not a legacy identity.
        const unavailable =
          e instanceof FunctionError && e.code === 'unavailable';
        setState(unavailable ? 'unavailable' : 'error');
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state === 'ready' && idNumber) {
    return { state, idNumber, text: idNumber, isNumber: true };
  }
  return {
    state,
    text:
      state === 'loading'
        ? LOADING_TEXT
        : state === 'unavailable'
        ? LEGACY_TEXT
        : ERROR_TEXT,
    isNumber: false,
  };
}
