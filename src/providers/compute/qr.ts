import QRCode from 'qrcode';
import { fail, ok, type Provider } from '../_registry.js';

interface QrInput { data: string; error_correction: 'L' | 'M' | 'Q' | 'H'; size: number }

export const qrProvider: Provider<QrInput, { format: 'svg'; svg: string }> = {
  id: 'compute.qr',
  storagePolicy: 'none',
  source: { name: 'qrcode', url: 'https://github.com/soldair/node-qrcode', license: 'MIT' },
  async execute(input) {
    try {
      const svg = await QRCode.toString(input.data, {
        type: 'svg', width: input.size, errorCorrectionLevel: input.error_correction, margin: 1,
      });
      if (Buffer.byteLength(svg, 'utf8') > 131_072) return fail('bad_input', 'QR output exceeds 128 KiB');
      return ok({ format: 'svg', svg });
    } catch {
      return fail('bad_input', 'data cannot be encoded as a QR code at the requested settings');
    }
  },
};
