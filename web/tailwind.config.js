import colors from 'tailwindcss/colors';

/** Neutral "primary" scale with success/danger/warning aliases, matching the reference look. */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        primary: colors.neutral,
        success: colors.green,
        danger: colors.red,
        warning: colors.amber,
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        arabic: ['"Noto Sans Arabic"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
