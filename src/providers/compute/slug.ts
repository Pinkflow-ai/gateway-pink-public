import { ok, type Provider } from '../_registry.js';

interface SlugInput {
  input: string;
  separator?: '-' | '_';
  lowercase?: boolean;
}

interface SlugOutput {
  slug: string;
}

/** Unicode-aware, dependency-free slug generation. */
export const slugProvider: Provider<SlugInput, SlugOutput> = {
  id: 'compute.slug',
  storagePolicy: 'none',
  source: {
    name: 'Pure compute (Unicode normalization)',
    url: 'https://unicode.org/reports/tr15/',
    license: 'Public standard',
  },
  async execute({ input, separator = '-', lowercase = true }) {
    const normalized = input
      .normalize('NFKD')
      .replace(/\p{Mark}/gu, '')
      .replace(/[^\p{Letter}\p{Number}]+/gu, separator)
      .replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '')
      .replace(new RegExp(`${separator}{2,}`, 'g'), separator);
    return ok({ slug: lowercase ? normalized.toLocaleLowerCase('en-US') : normalized });
  },
};
