import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { fail, ok, type Provider } from '../_registry.js';

type CsvScalar = string | number | boolean | null;
type CsvInput =
  | { operation: 'csv_to_json'; csv: string; delimiter: ',' | ';' | '\t'; headers: boolean }
  | { operation: 'json_to_csv'; rows: Array<Record<string, CsvScalar>>; delimiter: ',' | ';' | '\t' };

const INPUT_MAX = 1_048_576;
const OUTPUT_MAX = 2_097_152;

export const csvProvider: Provider<CsvInput, { operation: CsvInput['operation']; rows?: unknown[]; csv?: string }> = {
  id: 'compute.csv',
  storagePolicy: 'none',
  source: { name: 'CSV for Node.js', url: 'https://csv.js.org/', license: 'MIT' },
  async execute(input) {
    try {
      if (input.operation === 'csv_to_json') {
        if (Buffer.byteLength(input.csv, 'utf8') > INPUT_MAX) return fail('bad_input', 'CSV input exceeds 1 MiB');
        const rows = parse(input.csv, {
          columns: input.headers,
          delimiter: input.delimiter,
          skip_empty_lines: true,
          bom: true,
          to_line: 10_002,
        }) as unknown[];
        if (rows.length > 10_000) return fail('bad_input', 'CSV exceeds 10,000 rows');
        const columns = rows.reduce<number>((max, row) => Math.max(max,
          Array.isArray(row) ? row.length : Object.keys(row as Record<string, unknown>).length), 0);
        if (columns > 100) return fail('bad_input', 'CSV exceeds 100 columns');
        if (Buffer.byteLength(JSON.stringify(rows), 'utf8') > OUTPUT_MAX) return fail('bad_input', 'JSON output exceeds 2 MiB');
        return ok({ operation: input.operation, rows });
      }

      if (Buffer.byteLength(JSON.stringify(input.rows), 'utf8') > INPUT_MAX) {
        return fail('bad_input', 'JSON input exceeds 1 MiB');
      }
      const columns = [...new Set(input.rows.flatMap((row) => Object.keys(row)))];
      if (columns.length > 100) return fail('bad_input', 'JSON rows exceed 100 columns');
      const csv = stringify(input.rows, { header: true, columns, delimiter: input.delimiter });
      if (Buffer.byteLength(csv, 'utf8') > OUTPUT_MAX) return fail('bad_input', 'CSV output exceeds 2 MiB');
      return ok({ operation: input.operation, csv });
    } catch {
      return fail('bad_input', `invalid ${input.operation === 'csv_to_json' ? 'CSV' : 'JSON rows'}`);
    }
  },
};
