// =============================================================================
// scrollMemory — remember a list/scroll offset across a "list → details → back"
// hop so the user lands roughly where they left, not at the top.
// =============================================================================
// This navigator unmounts the whole tab shell (and the list inside it) while a
// drilldown route is on top, so component-local state can't survive the trip.
// A tiny module-level Map does. Keyed by a STABLE screen key (never a random
// value) so re-entering the same screen restores; cleared on logout so a fresh
// session / new flow starts from the top.
// =============================================================================

import { useCallback, useRef } from 'react';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';

const store = new Map<string, number>();

export const rememberScroll = (key: string, offsetY: number): void => {
  if (Number.isFinite(offsetY) && offsetY >= 0) store.set(key, offsetY);
};

export const recallScroll = (key: string): number => store.get(key) ?? 0;

export const forgetScroll = (key: string): void => {
  store.delete(key);
};

export const clearAllScrollMemory = (): void => {
  store.clear();
};

interface RememberedScroll {
  /** Spread onto a ScrollView / FlatList. */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
  /** Call from onContentSizeChange with an imperative scroll fn — restores the
   *  saved offset exactly once, after the content has real height. */
  restoreOnce: (scrollTo: (offsetY: number) => void) => void;
}

/** Wire a ScrollView or FlatList to the shared store. `key` must be stable for
 *  the screen (e.g. 'worker/available-jobs'). */
export const useRememberedScroll = (key: string): RememberedScroll => {
  const restored = useRef(false);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      rememberScroll(key, e.nativeEvent.contentOffset.y);
    },
    [key]
  );

  const restoreOnce = useCallback(
    (scrollTo: (offsetY: number) => void) => {
      if (restored.current) return;
      restored.current = true;
      const y = recallScroll(key);
      if (y > 0) scrollTo(y);
    },
    [key]
  );

  return { onScroll, scrollEventThrottle: 64, restoreOnce };
};
