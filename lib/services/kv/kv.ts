export interface DataStore {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class KeyValueStore {
  private store: DataStore;
  private cache: Record<string, unknown> | null = null;
  private cachePromise: Promise<Record<string, unknown>> | null = null;
  private activeWrite: Promise<void> | null = null;
  private queuedWrite: Promise<void> | null = null;

  constructor(store: DataStore) {
    this.store = store;
  }

  /**
   * Initialize the cache from the data store
   */
  private ensureCache(): Promise<Record<string, unknown>> {
    if (this.cache !== null) {
      return Promise.resolve(this.cache);
    }

    // Share one in-flight load so concurrent first calls don't each load and
    // overwrite the cache (losing writes made against the earlier copy).
    if (this.cachePromise === null) {
      this.cachePromise = this.store
        .loadData()
        .then((data) => {
          // The state file is user-writable and may have been hand-edited or
          // truncated, so anything that isn't a keyed `state` object starts over
          // rather than propagating a broken shape to every caller.
          const cache = isRecord(data) && isRecord(data.state) ? data.state : {};
          this.cache = cache;
          return cache;
        })
        .catch((error: unknown) => {
          // Allow a later call to retry instead of caching the failure.
          this.cachePromise = null;
          throw error;
        });
    }
    return this.cachePromise;
  }

  /**
   * Persist the current cache to the data store.
   *
   * At most one write is in flight and at most one is queued behind it. Every
   * write saves the whole cache as it is when the write starts, so callers that
   * arrive while a write is queued share that one write instead of adding their
   * own: the latest state is saved once and no two writes overlap.
   *
   * A failed write rejects every caller waiting on it. The values stay in the
   * cache, so the next successful write saves them. A write that never settles
   * blocks later writes (they would otherwise overlap it); this is deliberate.
   */
  private persistCache(): Promise<void> {
    if (this.cache === null) {
      return Promise.resolve();
    }
    if (this.queuedWrite !== null) {
      return this.queuedWrite;
    }
    if (this.activeWrite === null) {
      return this.startWrite();
    }

    const ignore = () => undefined;
    this.queuedWrite = this.activeWrite.then(ignore, ignore).then(() => {
      this.queuedWrite = null;
      return this.startWrite();
    });
    return this.queuedWrite;
  }

  private startWrite(): Promise<void> {
    // Start via a microtask so a synchronous throw from saveData rejects the
    // promise like an async failure, and the cache is read as late as possible.
    const write: Promise<void> = Promise.resolve()
      .then(() => this.store.saveData({ state: this.cache }))
      .finally(() => {
        if (this.activeWrite === write) {
          this.activeWrite = null;
        }
      });
    this.activeWrite = write;
    return write;
  }

  /**
   * Get a value by key with type safety
   * @param key The key to retrieve
   * @returns The value for the key, or undefined if not found
   */
  async get<T>(key: string): Promise<T | undefined> {
    const cache = await this.ensureCache();
    return cache[key] as T | undefined;
  }

  /**
   * Set a value by key
   * @param key The key to set
   * @param value The value to store
   */
  async set<T>(key: string, value: T): Promise<void> {
    const cache = await this.ensureCache();
    cache[key] = value;
    await this.persistCache();
  }

  /**
   * Check if a key exists in the store
   * @param key The key to check
   * @returns True if the key exists, false otherwise
   */
  async has(key: string): Promise<boolean> {
    const cache = await this.ensureCache();
    return key in cache;
  }

  /**
   * Delete a key from the store
   * @param key The key to delete
   * @returns True if the key was deleted, false if it didn't exist
   */
  async delete(key: string): Promise<boolean> {
    const cache = await this.ensureCache();
    if (key in cache) {
      delete cache[key];
      await this.persistCache();
      return true;
    }
    return false;
  }

  /**
   * Clear all keys from the store
   */
  async clear(): Promise<void> {
    this.cache = {};
    this.cachePromise = Promise.resolve(this.cache);
    await this.persistCache();
  }

  /**
   * Get all keys in the store
   * @returns Array of keys
   */
  async keys(): Promise<string[]> {
    const cache = await this.ensureCache();
    return Object.keys(cache);
  }

  /**
   * Get all values in the store
   * @returns Array of values
   */
  async values<T>(): Promise<T[]> {
    const cache = await this.ensureCache();
    return Object.values(cache) as T[];
  }

  /**
   * Get all entries in the store
   * @returns Array of [key, value] pairs
   */
  async entries<T>(): Promise<[string, T][]> {
    const cache = await this.ensureCache();
    return Object.entries(cache) as [string, T][];
  }
}
