const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";

export function symbolForIndex(paletteIndex: number): string {
  if (paletteIndex <= 0) return "·";
  const i = paletteIndex - 1;
  if (i < CHARS.length) return CHARS[i]!;
  return String.fromCharCode(0x2460 + ((i - CHARS.length) % 20));
}
