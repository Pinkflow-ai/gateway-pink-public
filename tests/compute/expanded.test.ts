import { describe, expect, it } from 'vitest';
import { colorProvider } from '../../src/providers/compute/color.js';
import { csvProvider } from '../../src/providers/compute/csv.js';
import { jsonSchemaProvider } from '../../src/providers/compute/json-schema.js';
import { qrProvider } from '../../src/providers/compute/qr.js';
import { textStatsProvider } from '../../src/providers/compute/text-stats.js';

const ctx = { requestId: 'test', timeoutMs: 1000, userAgent: 'test' };

describe('expanded compute providers', () => {
  it('generates a bounded SVG QR code', async () => {
    const result = await qrProvider.execute({ data: 'https://gateway.pink', error_correction: 'M', size: 256 }, ctx);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.format).toBe('svg');
    expect(result.data.svg).toContain('<svg');
    expect(Buffer.byteLength(result.data.svg)).toBeLessThanOrEqual(131_072);
  });

  it('validates JSON Schema and caps public errors', async () => {
    const result = await jsonSchemaProvider.execute({
      schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
      value: { name: 42 },
    }, ctx);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.valid).toBe(false);
    expect(result.data.errors[0]).toMatchObject({ keyword: 'type' });
    expect(result.data.errors.length).toBeLessThanOrEqual(100);
  });

  it('rejects caller-supplied regular expressions that could block the event loop', async () => {
    expect(await jsonSchemaProvider.execute({ schema: { type: 'string', pattern: '(a+)+$' }, value: 'a' }, ctx))
      .toMatchObject({ ok: false, error: { code: 'bad_input' } });
  });

  it('round-trips bounded CSV records', async () => {
    const parsed = await csvProvider.execute({ operation: 'csv_to_json', csv: 'name,score\nAda,10\n', delimiter: ',', headers: true }, ctx);
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(parsed.data.rows).toEqual([{ name: 'Ada', score: '10' }]);
    const rendered = await csvProvider.execute({ operation: 'json_to_csv', rows: [{ name: 'Ada', score: 10 }], delimiter: ',' }, ctx);
    if (!rendered.ok) throw new Error(rendered.error.message);
    expect(rendered.data.csv).toBe('name,score\nAda,10\n');
  });

  it('normalizes colors and computes WCAG contrast', async () => {
    const result = await colorProvider.execute({ color: '#fff', background: '#000000' }, ctx);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data).toMatchObject({
      hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 },
      contrast: { ratio: 21, aa_normal: true, aaa_normal: true },
    });
  });

  it('counts Unicode text without storing it', async () => {
    const result = await textStatsProvider.execute({ text: 'Hello world.\nSecond line!', words_per_minute: 120 }, ctx);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data).toMatchObject({ words: 4, lines: 2, sentences: 2, reading_seconds: 2 });
  });
});
