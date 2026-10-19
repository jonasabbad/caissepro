/**
 * Theme: every colour comes from the CSS variables in src/styles/main.css (design tokens), so the whole app follows
 * one palette. Tailwind colour names used across the components are mapped onto those tokens:
 * - primary / blue → brand blue (actions, links, focus, active navigation)
 * - gray / stone / neutral / slate → one cool neutral (text, borders, backgrounds)
 * - black → deep navy ink (sidebar, selected states, dark buttons, overlays)
 * - success / green / emerald → green · danger / red → red · warning / amber → amber
 */
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (name) => Object.fromEntries(STEPS.map((s) => [s, `rgb(var(--c-${name}-${s}) / <alpha-value>)`]));

const brand = scale('brand');
const neutral = scale('neutral');
const success = scale('success');
const danger = scale('danger');
const warning = scale('warning');

export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        primary: brand,
        blue: brand,
        gray: neutral,
        stone: neutral,
        neutral,
        slate: neutral,
        black: 'rgb(var(--c-ink) / <alpha-value>)',
        success,
        green: success,
        emerald: success,
        danger,
        red: danger,
        warning,
        amber: warning,
      },
      fontFamily: {
        // Inter for Latin text and digits in every language; IBM Plex Sans Arabic for Arabic script.
        sans: ['"Inter Variable"', 'Inter', '"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
        arabic: ['"IBM Plex Sans Arabic"', '"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
