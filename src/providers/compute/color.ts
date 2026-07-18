import { ok, type Provider } from '../_registry.js';

interface Rgb { r: number; g: number; b: number }

function rgb(hex: string): Rgb {
  const raw = hex.slice(1);
  const full = raw.length === 3 ? [...raw].map((part) => part + part).join('') : raw;
  return { r: Number.parseInt(full.slice(0, 2), 16), g: Number.parseInt(full.slice(2, 4), 16), b: Number.parseInt(full.slice(4, 6), 16) };
}

function hex(value: Rgb): string {
  return `#${[value.r, value.g, value.b].map((part) => part.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function hsl({ r, g, b }: Rgb) {
  const [red, green, blue] = [r, g, b].map((part) => part / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;
  const delta = maximum - minimum;
  let hue = 0;
  if (delta) {
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { h: Math.round(hue), s: Math.round(saturation * 1000) / 10, l: Math.round(lightness * 1000) / 10 };
}

function luminance(value: Rgb): number {
  const parts = [value.r, value.g, value.b].map((part) => {
    const channel = part / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
}

export const colorProvider: Provider<
  { color: string; background?: string },
  { hex: string; rgb: Rgb; hsl: ReturnType<typeof hsl>; contrast?: Record<string, number | boolean> }
> = {
  id: 'compute.color',
  storagePolicy: 'none',
  source: { name: 'WCAG 2 contrast algorithm', url: 'https://www.w3.org/TR/WCAG22/#contrast-minimum', license: 'Public standard' },
  async execute(input) {
    const foreground = rgb(input.color);
    const data: { hex: string; rgb: Rgb; hsl: ReturnType<typeof hsl>; contrast?: Record<string, number | boolean> } = {
      hex: hex(foreground), rgb: foreground, hsl: hsl(foreground),
    };
    if (input.background) {
      const background = rgb(input.background);
      const ratio = (Math.max(luminance(foreground), luminance(background)) + 0.05)
        / (Math.min(luminance(foreground), luminance(background)) + 0.05);
      const rounded = Math.round(ratio * 100) / 100;
      data.contrast = { ratio: rounded, aa_normal: ratio >= 4.5, aa_large: ratio >= 3, aaa_normal: ratio >= 7, aaa_large: ratio >= 4.5 };
    }
    return ok(data);
  },
};
