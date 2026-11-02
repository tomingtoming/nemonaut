// Only intervals actually measured by this version are included.
export type ObservationPeriod = 'day' | 'night';
export interface ObservationInterval {
  received: number;
  missed: number;
}
export type ObservationQuality = Partial<Record<ObservationPeriod, ObservationInterval>>;
export function copyObservationQuality(
  value: ObservationQuality | null | undefined,
  totals: Readonly<Record<ObservationPeriod, number>>
): ObservationQuality | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('観測品質の形式が不正です');
  const result: ObservationQuality = {};
  for (const key of ['day', 'night'] as const) {
    const q = value[key];
    if (
      !q ||
      !(['received', 'missed'] as const).every(k => Number.isFinite(q[k]) && q[k] >= 0 && q[k] <= 1e12) ||
      q.received > totals[key] + 1e-5
    )
      throw Error('観測品質の測定時間が不正です');
    result[key] = {received: q.received, missed: q.missed};
  }
  return result;
}
export interface ObservationQualitySummary extends ObservationInterval {
  ratio: number | null;
}
export function qualitySummary(
  quality: Readonly<Record<string, ObservationInterval | undefined>> | null | undefined,
  key: string
): ObservationQualitySummary | null {
  const q = quality?.[key];
  if (!q) return null;
  const total = q.received + q.missed;
  return {...q, ratio: total > 0 ? q.received / total : null};
}
