import { fail, ok, type Provider } from '../_registry.js';

export const SUPPORTED_UNITS = [
  'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi',
  'mg', 'g', 'kg', 'oz', 'lb',
  'c', 'f', 'k',
  'b', 'kb', 'mb', 'gb', 'tb', 'kib', 'mib', 'gib', 'tib',
] as const;

export type Unit = (typeof SUPPORTED_UNITS)[number];
type Dimension = 'length' | 'mass' | 'temperature' | 'data';

interface UnitInput {
  value: number;
  from: Unit;
  to: Unit;
}

interface UnitOutput extends UnitInput {
  result: number;
  dimension: Dimension;
}

interface UnitDefinition {
  dimension: Dimension;
  toBase(value: number): number;
  fromBase(value: number): number;
}

const linear = (dimension: Dimension, factor: number): UnitDefinition => ({
  dimension,
  toBase: (value) => value * factor,
  fromBase: (value) => value / factor,
});

const units: Record<Unit, UnitDefinition> = {
  mm: linear('length', 0.001), cm: linear('length', 0.01), m: linear('length', 1),
  km: linear('length', 1000), in: linear('length', 0.0254), ft: linear('length', 0.3048),
  yd: linear('length', 0.9144), mi: linear('length', 1609.344),
  mg: linear('mass', 0.001), g: linear('mass', 1), kg: linear('mass', 1000),
  oz: linear('mass', 28.349523125), lb: linear('mass', 453.59237),
  c: { dimension: 'temperature', toBase: (value) => value + 273.15, fromBase: (value) => value - 273.15 },
  f: { dimension: 'temperature', toBase: (value) => (value - 32) * 5 / 9 + 273.15, fromBase: (value) => (value - 273.15) * 9 / 5 + 32 },
  k: { dimension: 'temperature', toBase: (value) => value, fromBase: (value) => value },
  b: linear('data', 1), kb: linear('data', 1000), mb: linear('data', 1_000_000),
  gb: linear('data', 1_000_000_000), tb: linear('data', 1_000_000_000_000),
  kib: linear('data', 1024), mib: linear('data', 1024 ** 2),
  gib: linear('data', 1024 ** 3), tib: linear('data', 1024 ** 4),
};

/** Length, mass, temperature, and decimal/binary data-size conversion. */
export const unitsProvider: Provider<UnitInput, UnitOutput> = {
  id: 'compute.units',
  storagePolicy: 'none',
  source: {
    name: 'SI and IEC unit definitions',
    url: 'https://www.bipm.org/en/measurement-units',
    license: 'Public standard',
  },
  async execute({ value, from, to }) {
    const source = units[from];
    const target = units[to];
    if (source.dimension !== target.dimension) {
      return fail('bad_input', `cannot convert ${source.dimension} to ${target.dimension}`);
    }
    return ok({ value, from, to, result: target.fromBase(source.toBase(value)), dimension: source.dimension });
  },
};
