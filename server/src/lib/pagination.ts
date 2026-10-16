export interface PageParams {
  page: number;
  limit: number;
  skip: number;
}

export function pageParams(q: Record<string, unknown>, defaultLimit = 20, maxLimit = 500): PageParams {
  const page = Math.max(1, parseInt(String(q.page ?? '1'), 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(String(q.limit ?? defaultLimit), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function pageMeta(total: number, p: PageParams) {
  return { total, page: p.page, limit: p.limit, totalPages: Math.ceil(total / p.limit) };
}

/** Parses query-string booleans ("true"/"false"/"1"/"0"); undefined when absent. */
export function qBool(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  return v === true || v === 'true' || v === '1';
}

export function qStr(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/** Inclusive date range filter from YYYY-MM-DD strings (end date covers the whole day). */
export function dateRange(start?: unknown, end?: unknown) {
  const s = qStr(start);
  const e = qStr(end);
  if (!s && !e) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (s) range.gte = startOfDay(s);
  if (e) range.lte = endOfDay(e);
  return range;
}

export function startOfDay(d: string | Date) {
  const x = typeof d === 'string' ? new Date(d.length <= 10 ? `${d}T00:00:00` : d) : new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: string | Date) {
  const x = typeof d === 'string' ? new Date(d.length <= 10 ? `${d}T00:00:00` : d) : new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
