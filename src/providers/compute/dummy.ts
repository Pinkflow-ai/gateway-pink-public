import { ok, type Provider } from '../_registry.js';

export type DummyType = 'paragraphs' | 'words' | 'user' | 'address';

interface DummyInput {
  type?: DummyType;
  count?: number;
}

type DummyItem = string | Record<string, string>;

interface DummyOutput {
  type: DummyType;
  count: number;
  items: DummyItem[];
}

const WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'integer', 'porta', 'nibh', 'vel', 'massa', 'faucibus', 'tempor', 'donec',
];
const FIRST_NAMES = ['Avery', 'Maya', 'Noah', 'Leah', 'Kai', 'Zoe'];
const LAST_NAMES = ['Stone', 'Cohen', 'Rivera', 'Kim', 'Okafor', 'Singh'];
const STREETS = ['Market Street', 'Cedar Avenue', 'Harbor Road', 'Olive Lane'];
const CITIES = ['Tel Aviv', 'Lisbon', 'Toronto', 'Singapore'];

function words(count: number, offset = 0): string {
  return Array.from({ length: count }, (_, index) => WORDS[(index + offset) % WORDS.length]).join(' ');
}

function makeItem(type: DummyType, index: number): DummyItem {
  if (type === 'words') return words(index + 1);
  if (type === 'paragraphs') {
    const sentence = words(28, index);
    return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
  }
  if (type === 'user') {
    const first = FIRST_NAMES[index % FIRST_NAMES.length];
    const last = LAST_NAMES[index % LAST_NAMES.length];
    return {
      name: `${first} ${last}`,
      email: `${first}.${last}.${index + 1}@example.test`.toLowerCase(),
      username: `${first}${last}${index + 1}`.toLowerCase(),
    };
  }
  return {
    line1: `${100 + index} ${STREETS[index % STREETS.length]}`,
    city: CITIES[index % CITIES.length],
    postalCode: `${10_000 + index}`,
    countryCode: ['IL', 'PT', 'CA', 'SG'][index % 4],
  };
}

/** Dependency-free fixture data for tests, prototypes, and UI mockups. */
export const dummyProvider: Provider<DummyInput, DummyOutput> = {
  id: 'compute.dummy',
  storagePolicy: 'none',
  source: {
    name: 'Gateway.pink fixture generator',
    url: 'https://gateway.pink/trust',
    license: 'CC0-1.0',
  },
  async execute({ type = 'paragraphs', count = 1 }) {
    const n = Math.min(Math.max(1, count), 100);
    if (type === 'words') {
      return ok({ type, count: n, items: [words(n)] });
    }
    return ok({ type, count: n, items: Array.from({ length: n }, (_, index) => makeItem(type, index)) });
  },
};
