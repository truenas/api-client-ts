/**
 * Fields whose value is literally `undefined` are dropped rather than applied.
 *
 * Every builder here takes a `Partial<…>`, so `{ state: done ? Success :
 * undefined }` compiles — and spreading that over a default puts `undefined`
 * where a required field is declared. The object then fails in whatever reads
 * it, one layer away from the fixture that made it. Dropping them makes an
 * absent field mean "unchanged", which is what a partial means everywhere else
 * here.
 */
export function present<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
