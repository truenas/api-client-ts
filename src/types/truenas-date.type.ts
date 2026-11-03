/**
 * A `datetime` as the API sends and accepts it: milliseconds since the epoch,
 * in UTC. The generated types use this shape for every `date-time` field.
 */
export type TrueNasDate = { $date: number };

/**
 * A `date` (no time of day) as the API sends and accepts it, `$value` being
 * `YYYY-MM-DD`. The generated types use this shape for every `date` field.
 */
export type TrueNasCalendarDate = { $type: 'date'; $value: string };
