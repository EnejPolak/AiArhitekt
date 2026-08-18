/**
 * Injected timing for Places HTTP pacing.
 * Production uses real delays (3 req/s + backoff). Tests replace delay with a no-op.
 */

export type DelayFn = (ms: number) => Promise<void>;

const productionDelay: DelayFn = (ms) =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

let delayFn: DelayFn = productionDelay;

export function delay(ms: number): Promise<void> {
  return delayFn(ms);
}

export function setPlacesDelay(next: DelayFn): void {
  delayFn = next;
}

export function resetPlacesDelay(): void {
  delayFn = productionDelay;
}
