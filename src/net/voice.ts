/** Optional platform voice features (claude.ai `dictation` + `tts`); null where unavailable. */
type Use = (n: string) => Promise<unknown>;
const use = (): Use | null => (window as unknown as { claude?: { use?: Use } }).claude?.use ?? null;

export interface Dictation {
  start(o?: { language?: string }): Promise<void>;
  stop(): Promise<void>;
  onPartial(h: (e: { text: string }) => void): () => void;
  onFinal(h: (e: { text: string }) => void): () => void;
  onState(h: (e: { state: string; reason?: string }) => void): () => void;
}
export interface Tts {
  speak(text: string, o?: { voice?: string; rate?: number }): Promise<void>;
  stop(): void;
}

let dPromise: Promise<Dictation | null> | null = null;
let tPromise: Promise<Tts | null> | null = null;
export const getDictation = () => (dPromise ??= (use()?.('dictation') ?? Promise.resolve(null)).then((x) => (x as Dictation) ?? null).catch(() => null));
export const getTts = () => (tPromise ??= (use()?.('tts') ?? Promise.resolve(null)).then((x) => (x as Tts) ?? null).catch(() => null));
