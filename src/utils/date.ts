const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // UTC+9

/**
 * "YYYY-MM-DD" + time 을 KST 기준으로 파싱하여 UTC Date로 반환.
 * @example kstDateToUtc('2026-02-26', '00:00:00') → 2026-02-25T15:00:00.000Z
 */
export function kstDateToUtc(dateStr: string, time: '00:00:00' | '23:59:59'): Date {
  return new Date(`${dateStr}T${time}+09:00`);
}

/**
 * UTC Date → KST 날짜 문자열 ("YYYY-MM-DD")
 */
export function utcToKstDateStr(date: Date): string {
  const kstMs = date.getTime() + KST_OFFSET_MS;
  return new Date(kstMs).toISOString().slice(0, 10);
}

/**
 * 보고 기간 캐시 키 생성 (KST 날짜 기준).
 * @example toPeriodKey(2026-02-25T15:00Z, 2026-03-25T14:59:59Z) → "2026-02-26_2026-03-25"
 */
export function toPeriodKey(start: Date, end: Date): string {
  return `${utcToKstDateStr(start)}_${utcToKstDateStr(end)}`;
}

/**
 * 기본 보고 기간 계산.
 * - periodStart: 전월 startDay일 00:00:00 KST → UTC
 * - periodEnd:   어제 23:59:59 KST → UTC
 */
export function getDefaultPeriod(startDay: number): { periodStart: Date; periodEnd: Date } {
  const todayUtc = new Date();

  const yesterday = new Date(todayUtc);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const periodEnd = kstDateToUtc(yesterday.toISOString().slice(0, 10), '23:59:59');

  const prevMonthDate = new Date(todayUtc);
  prevMonthDate.setUTCMonth(prevMonthDate.getUTCMonth() - 1);
  prevMonthDate.setUTCDate(startDay);
  const periodStart = kstDateToUtc(prevMonthDate.toISOString().slice(0, 10), '00:00:00');

  return { periodStart, periodEnd };
}
