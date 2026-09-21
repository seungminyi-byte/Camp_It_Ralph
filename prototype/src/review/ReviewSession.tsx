import { createContext, useContext, useSyncExternalStore } from 'react';
import { ReviewSessionStore } from './session';
export const ReviewSessionContext = createContext<ReviewSessionStore | null>(null);
export function useReviewSession() {
  const store = useContext(ReviewSessionContext);
  if (!store) throw new Error('Review session provider missing');
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  return { ...state, store };
}
