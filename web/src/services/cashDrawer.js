// Cash drawer kick via the receipt printer (ESC/POS "pulse" command).
// Paired printers are configured in Settings > Impression; see services/printer.js.

export function isCashDrawerPaired() {
  try {
    return localStorage.getItem('cash_drawer_paired') === '1';
  } catch {
    return false;
  }
}

export async function popCashDrawerIfConfigured() {
  if (!isCashDrawerPaired()) return;
  const { openCashDrawer } = await import('./printer');
  await openCashDrawer().catch(() => undefined);
}
