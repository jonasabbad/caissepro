// Approximate swatch colours for manufacturer colour names ("Natural Titanium", "Awesome Navy", ...).
// Exact names are matched first, otherwise the last recognisable word decides ("Phantom Black" → black).

const NAMED = {
  'natural titanium': '#9a9a96',
  'desert titanium': '#bfb09a',
  'blue titanium': '#3d4f5c',
  'white titanium': '#f2f1ed',
  'black titanium': '#3c3c3d',
  'space gray': '#52514f',
  'space black': '#1d1d1f',
  'jet black': '#0a0a0a',
  'rose gold': '#b76e79',
  'sierra blue': '#a7c1d9',
  'alpine green': '#505f4e',
  'deep purple': '#5d5076',
  'pacific blue': '#1ca9c9',
  'midnight green': '#004b49',
  'cosmic orange': '#c76e2e',
  'deep blue': '#1b3a5c',
  'mist blue': '#b8ccdb',
  'cloud white': '#f5f3ef',
  'light gold': '#e8d5b5',
  'sky blue': '#a1c6e7',
  'icy blue': '#b3d9e6',
  icyblue: '#b3d9e6',
  'silver shadow': '#a8a9ad',
};

const WORDS = {
  black: '#1c1c1e', noir: '#1c1c1e', white: '#f5f5f7', blanc: '#f5f5f7', blue: '#007aff', bleu: '#007aff',
  red: '#ff3b30', rouge: '#ff3b30', green: '#34c759', vert: '#34c759', yellow: '#ffcc00', jaune: '#ffcc00',
  purple: '#af52de', violet: '#af52de', pink: '#ff2d55', rose: '#ff2d55', gold: '#d4af37', or: '#d4af37',
  silver: '#c0c0c0', argent: '#c0c0c0', gray: '#6b7280', grey: '#6b7280', orange: '#e87d2f', brown: '#8b6f47',
  beige: '#d4c5a9', cream: '#f2e8dc', coral: '#ff6f61', olive: '#6b8e23', mint: '#c4e1d4', lavender: '#d1cddf',
  lilac: '#c8a2c8', teal: '#008080', cyan: '#00bcd4', navy: '#1b2a4a', midnight: '#1f2024', starlight: '#f0e8d8',
  graphite: '#4a4a4a', platinum: '#e5e4e2', titanium: '#8e8e8e', obsidian: '#1c1c1e', phantom: '#2c2c2c',
  onyx: '#353839', charcoal: '#36454f', slate: '#708090', pearl: '#f0eae2', ivory: '#fffff0', sand: '#c2b280',
  bronze: '#cd7f32', copper: '#b87333', chrome: '#7c7c7c', sky: '#87ceeb', ocean: '#1a5276', ice: '#d6eaf8',
  frost: '#e8f0fe', snow: '#fffafa', porcelain: '#f0eae2', hazel: '#8e7a67', jade: '#00a86b', sage: '#a3b5a6',
  emerald: '#2ecc71', lime: '#cddc39', peach: '#ffcba4', lemon: '#fff44f', burgundy: '#800020', ultramarine: '#3f00ff',
  indigo: '#3f51b5', moonstone: '#c9d1d6', lemongrass: '#c5d86d', wintergreen: '#a8d8c8', peony: '#e8a0bf',
};

export function colorHex(name) {
  if (!name) return '#6b7280';
  const lower = name.toLowerCase();
  if (NAMED[lower]) return NAMED[lower];
  for (const word of lower.split(/[\s-]+/).reverse()) if (WORDS[word]) return WORDS[word];
  return '#6b7280';
}

/** True when a dark checkmark reads better than a white one on this swatch. */
export function isLight(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
