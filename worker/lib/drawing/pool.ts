/** A small bounded pool with stable result ordering. Rejections are left to
 * the mapper to convert into attributable per-item outcomes. */
export async function mapPool<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** One call at a time through `call`, in the order asked. The face-mapped
 * engine's memory is priced on one render in flight (contract.ts); this is
 * how a run keeps to that, with nothing that outlives the run. */
export function serial<A extends unknown[], R>(call: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  let last: Promise<unknown> = Promise.resolve();
  return (...args) => {
    const next = last.then(() => call(...args));
    last = next.catch(() => {});
    return next;
  };
}
