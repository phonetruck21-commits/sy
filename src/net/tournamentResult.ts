import { create } from 'zustand';

/** Outcome of saving the last tournament race (shown on the results screen). */
export const useTournamentResult = create<{ status: 'idle' | 'saving' | 'saved' | 'error'; time: number | null; best: number | null; improved: boolean; tid: string | null }>()(() => ({
  status: 'idle', time: null, best: null, improved: false, tid: null,
}));
