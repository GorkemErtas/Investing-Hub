import { AppError } from "../errors.js";

interface Entry<T> {
  data: T;
  stored: number;
}
export class SharedCache {
  private entries = new Map<string, Entry<unknown>>();
  private pending = new Map<
    string,
    Promise<{ data: unknown; stale: boolean; fetchedAt: string }>
  >();
  private failures = new Map<string, number>();
  constructor(
    private ttl: number,
    private maxAge: number,
    private now = Date.now,
    private capacity = 256,
  ) {}
  async get<T>(
    key: string,
    load: () => Promise<T>,
  ): Promise<{ data: T; stale: boolean; fetchedAt: string }> {
    const entry = this.entries.get(key) as Entry<T> | undefined;
    const result = (e: Entry<T>, stale: boolean) => ({
      data: e.data,
      stale,
      fetchedAt: new Date(e.stored).toISOString(),
    });
    if (entry && this.now() - entry.stored < this.ttl)
      return result(entry, false);
    // Suppress repeated failed refreshes, including during a cold provider outage.
    if ((this.failures.get(key) ?? 0) > this.now()) {
      if (entry && this.now() - entry.stored < this.maxAge)
        return result(entry, true);
      throw new AppError(
        503,
        "MARKET_UNAVAILABLE",
        "Market data is temporarily unavailable. Please retry shortly.",
      );
    }
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<ReturnType<typeof result>>;
    const pending = (async () => {
      try {
        const data = await load();
        if (this.entries.size >= this.capacity && !this.entries.has(key))
          this.entries.delete(this.entries.keys().next().value!);
        const fresh = { data, stored: this.now() };
        this.entries.set(key, fresh);
        this.failures.delete(key);
        return result(fresh, false);
      } catch {
        if (this.failures.size >= this.capacity)
          this.failures.delete(this.failures.keys().next().value!);
        this.failures.set(key, this.now() + 30000);
        if (entry && this.now() - entry.stored < this.maxAge)
          return result(entry, true);
        throw new AppError(
          503,
          "MARKET_UNAVAILABLE",
          "Market data is temporarily unavailable. Please retry shortly.",
        );
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, pending);
    return pending;
  }
}
