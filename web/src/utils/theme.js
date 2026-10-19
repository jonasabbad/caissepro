/** A design token (CSS variable of src/styles/main.css) as a colour string, for charts and SVG attributes. */
export function tokenColor(name, alpha = 1) {
  const v = typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim() : '';
  if (!v) return '';
  const [r, g, b] = v.split(/\s+/).map(Number);
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
