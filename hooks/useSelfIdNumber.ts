// =============================================================================
// BuildUp – useSelfIdNumber
// =============================================================================
// Shared by the Worker and Contractor own-Profile screens to show the logged-in
// user's OWN national ID in the existing read-only "ת.ז / תעודת זהות" row.
//
//   • backend path -> one call to the `reveal-my-id` Edge Function on mount
//     (auth.uid() decides the identity; nothing is persisted).
//       ready       -> the digits
//       unavailable -> legacy row, no ciphertext yet (heals on next login)
//       error       -> transient failure
//   • mock path -> `currentUser.idNumber` if present, else the legacy message.
//
// Returns a ready-to-render `{ text, isNumber }` plus the raw `state`/`idNumber`
// for callers that want them. The ID is never written to storage or context.
// =============================================================================

import { useEffect, useRef, useState } from 'react';

import { isBackendEnabled } from '../config/env';
import { useApp } from '../context/AppContext';
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
  const { currentUser } = useApp();
  const backend = isBackendEnabled();

  const [state, setState] = useState<SelfIdState>(backend ? 'loading' : 'ready');
  const [idNumber, setIdNumber] = useState<string | undefined>(undefined);
  const started = useRef(false);

  useEffect(() => {
    if (!backend || started.current) return;
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
  }, [backend]);

  if (!backend) {
    const v = currentUser?.idNumber?.trim();
    return v
      ? { state: 'ready', idNumber: v, text: v, isNumber: true }
      : { state: 'unavailable', text: LEGACY_TEXT, isNumber: false };
  }

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
