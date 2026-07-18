import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Oklch = Readonly<{ lightness: number; chroma: number; hue: number }>;
type LinearSrgb = Readonly<{ red: number; green: number; blue: number }>;

const css = readFileSync(resolve("src/app/globals.css"), "utf8");

function readToken(name: string): Oklch {
  const pattern = new RegExp(
    String.raw`--${name}:\s*oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/[^)]*)?\)`,
  );
  const match = css.match(pattern);
  if (!match) throw new Error(`Missing OKLCH token --${name}`);

  return {
    lightness: Number(match[1]),
    chroma: Number(match[2]),
    hue: Number(match[3]),
  };
}

function toLinearSrgb(color: Oklch): LinearSrgb {
  const radians = (color.hue * Math.PI) / 180;
  const a = color.chroma * Math.cos(radians);
  const b = color.chroma * Math.sin(radians);
  const lRoot = color.lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = color.lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = color.lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;

  return {
    red: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    green: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    blue: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function luminance(color: LinearSrgb): number {
  return 0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue;
}

function contrast(foreground: Oklch, background: Oklch): number {
  const foregroundLuminance = luminance(toLinearSrgb(foreground));
  const backgroundLuminance = luminance(toLinearSrgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const tokenNames = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
] as const;

const tokens = Object.fromEntries(
  tokenNames.map((name) => [name, readToken(name)]),
) as Record<(typeof tokenNames)[number], Oklch>;

const failures: string[] = [];

for (const [name, value] of Object.entries(tokens)) {
  const channels = toLinearSrgb(value);
  const inGamut = Object.values(channels).every(
    (channel) => channel >= -0.000_01 && channel <= 1.000_01,
  );
  if (!inGamut) failures.push(`--${name} is outside the sRGB gamut`);
}

const pairs: ReadonlyArray<
  readonly [foreground: keyof typeof tokens, background: keyof typeof tokens, minimum: number]
> = [
  ["foreground", "background", 7],
  ["card-foreground", "card", 7],
  ["popover-foreground", "popover", 7],
  ["muted-foreground", "background", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["success-foreground", "success", 4.5],
  ["warning-foreground", "warning", 4.5],
];

for (const [foregroundName, backgroundName, minimum] of pairs) {
  const ratio = contrast(tokens[foregroundName], tokens[backgroundName]);
  if (ratio < minimum) {
    failures.push(
      `--${foregroundName} on --${backgroundName} is ${ratio.toFixed(2)}:1; expected ${minimum}:1`,
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Color contract passed: ${tokenNames.length} in-gamut tokens and ${pairs.length} contrast pairs.`);
}
