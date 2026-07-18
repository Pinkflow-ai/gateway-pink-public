import { ok, type Provider } from '../_registry.js';

export const textStatsProvider: Provider<
  { text: string; words_per_minute: number },
  { bytes: number; characters: number; words: number; lines: number; sentences: number; reading_seconds: number }
> = {
  id: 'compute.text-stats',
  storagePolicy: 'none',
  source: { name: 'Unicode text analysis', url: 'https://unicode.org/reports/tr29/', license: 'Public standard' },
  async execute({ text, words_per_minute }) {
    const words = text.trim().match(/[\p{Letter}\p{Number}]+(?:['’][\p{Letter}\p{Number}]+)*/gu)?.length ?? 0;
    const sentences = text.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.length ?? 0;
    return ok({
      bytes: Buffer.byteLength(text, 'utf8'),
      characters: [...text].length,
      words,
      lines: text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length,
      sentences,
      reading_seconds: Math.ceil((words / words_per_minute) * 60),
    });
  },
};
