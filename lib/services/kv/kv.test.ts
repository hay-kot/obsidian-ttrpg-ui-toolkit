import { describe, it, expect, beforeEach } from "vitest";
import { DataStore, KeyValueStore } from "./kv";

class MockDataStore implements DataStore {
  private data: any = null;

  async loadData(): Promise<any> {
    return this.data;
  }

  async saveData(data: any): Promise<void> {
    this.data = data;
  }

  reset(): void {
    this.data = null;
  }
}

describe("KeyValueStore", () => {
  let mockStore: MockDataStore;
  let kvStore: KeyValueStore;

  beforeEach(() => {
    mockStore = new MockDataStore();
    kvStore = new KeyValueStore(mockStore);
  });

  describe("get", () => {
    it("should return undefined for non-existent key", async () => {
      const result = await kvStore.get("nonexistent");
      expect(result).toBeUndefined();
    });

    it("should return stored value for existing key", async () => {
      await kvStore.set("testKey", "testValue");
      const result = await kvStore.get("testKey");
      expect(result).toBe("testValue");
    });

    it("should return typed value", async () => {
      const testObject = { foo: "bar", num: 42 };
      await kvStore.set("objKey", testObject);
      const result = await kvStore.get<typeof testObject>("objKey");
      expect(result).toEqual(testObject);
    });
  });

  describe("set", () => {
    it("should store and persist value", async () => {
      await kvStore.set("key1", "value1");

      // Create new store instance with same data store to test persistence
      const newKvStore = new KeyValueStore(mockStore);
      const result = await newKvStore.get("key1");
      expect(result).toBe("value1");
    });

    it("should overwrite existing value", async () => {
      await kvStore.set("key1", "oldValue");
      await kvStore.set("key1", "newValue");
      const result = await kvStore.get("key1");
      expect(result).toBe("newValue");
    });
  });

  describe("has", () => {
    it("should return false for non-existent key", async () => {
      const result = await kvStore.has("nonexistent");
      expect(result).toBe(false);
    });

    it("should return true for existing key", async () => {
      await kvStore.set("existingKey", "value");
      const result = await kvStore.has("existingKey");
      expect(result).toBe(true);
    });
  });

  describe("delete", () => {
    it("should return false for non-existent key", async () => {
      const result = await kvStore.delete("nonexistent");
      expect(result).toBe(false);
    });

    it("should return true and remove existing key", async () => {
      await kvStore.set("keyToDelete", "value");
      const deleteResult = await kvStore.delete("keyToDelete");
      expect(deleteResult).toBe(true);

      const hasResult = await kvStore.has("keyToDelete");
      expect(hasResult).toBe(false);
    });

    it("should persist deletion", async () => {
      await kvStore.set("keyToDelete", "value");
      await kvStore.delete("keyToDelete");

      // Create new store instance to test persistence
      const newKvStore = new KeyValueStore(mockStore);
      const hasResult = await newKvStore.has("keyToDelete");
      expect(hasResult).toBe(false);
    });
  });

  describe("clear", () => {
    it("should remove all keys", async () => {
      await kvStore.set("key1", "value1");
      await kvStore.set("key2", "value2");

      await kvStore.clear();

      const has1 = await kvStore.has("key1");
      const has2 = await kvStore.has("key2");
      expect(has1).toBe(false);
      expect(has2).toBe(false);
    });

    it("should persist clear operation", async () => {
      await kvStore.set("key1", "value1");
      await kvStore.clear();

      // Create new store instance to test persistence
      const newKvStore = new KeyValueStore(mockStore);
      const keys = await newKvStore.keys();
      expect(keys).toEqual([]);
    });
  });

  describe("keys", () => {
    it("should return empty array for empty store", async () => {
      const keys = await kvStore.keys();
      expect(keys).toEqual([]);
    });

    it("should return all keys", async () => {
      await kvStore.set("key1", "value1");
      await kvStore.set("key2", "value2");
      await kvStore.set("key3", "value3");

      const keys = await kvStore.keys();
      expect(keys.sort()).toEqual(["key1", "key2", "key3"]);
    });
  });

  describe("values", () => {
    it("should return empty array for empty store", async () => {
      const values = await kvStore.values();
      expect(values).toEqual([]);
    });

    it("should return all values", async () => {
      await kvStore.set("key1", "value1");
      await kvStore.set("key2", "value2");
      await kvStore.set("key3", 42);

      const values = await kvStore.values();
      expect(values.sort()).toEqual([42, "value1", "value2"]);
    });
  });

  describe("entries", () => {
    it("should return empty array for empty store", async () => {
      const entries = await kvStore.entries();
      expect(entries).toEqual([]);
    });

    it("should return all key-value pairs", async () => {
      await kvStore.set("key1", "value1");
      await kvStore.set("key2", 42);

      const entries = await kvStore.entries();
      expect(entries.sort()).toEqual([
        ["key1", "value1"],
        ["key2", 42],
      ]);
    });
  });

  describe("concurrency", () => {
    it("should load from the data store once for concurrent first reads", async () => {
      let loads = 0;
      const store: DataStore = {
        async loadData() {
          loads++;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { state: { a: 1 } };
        },
        async saveData() {},
      };
      const kv = new KeyValueStore(store);

      const results = await Promise.all([kv.get("a"), kv.get("a"), kv.has("a")]);

      expect(loads).toBe(1);
      expect(results).toEqual([1, 1, true]);
    });

    it("should not lose concurrent sets that race on the first load", async () => {
      const store: DataStore = {
        async loadData() {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return null;
        },
        async saveData() {},
      };
      const kv = new KeyValueStore(store);

      await Promise.all([kv.set("a", 1), kv.set("b", 2)]);

      expect(await kv.keys()).toEqual(["a", "b"]);
    });

    it("should serialize writes so they never overlap and persist in order", async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const saved: unknown[] = [];
      const store: DataStore = {
        async loadData() {
          return null;
        },
        async saveData(data: unknown) {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          saved.push(JSON.parse(JSON.stringify(data)));
          inFlight--;
        },
      };
      const kv = new KeyValueStore(store);

      await Promise.all([kv.set("a", 1), kv.set("b", 2), kv.set("c", 3)]);

      expect(maxInFlight).toBe(1);
      expect(saved[saved.length - 1]).toEqual({ state: { a: 1, b: 2, c: 3 } });
    });

    it("should coalesce writes queued behind an in-flight write into one", async () => {
      let calls = 0;
      const saved: unknown[] = [];
      const store: DataStore = {
        async loadData() {
          return null;
        },
        async saveData(data: unknown) {
          calls++;
          await new Promise((resolve) => setTimeout(resolve, 5));
          saved.push(JSON.parse(JSON.stringify(data)));
        },
      };
      const kv = new KeyValueStore(store);
      await kv.get("warm"); // load first so every set below reaches persist in the same tick

      // The first write is in flight while the other four arrive; they share one follow-up write.
      await Promise.all([1, 2, 3, 4, 5].map((n) => kv.set(`k${n}`, n)));

      expect(calls).toBe(2);
      expect(saved[saved.length - 1]).toEqual({ state: { k1: 1, k2: 2, k3: 3, k4: 4, k5: 5 } });
    });

    it("should keep writing after a failed write", async () => {
      let calls = 0;
      const store: DataStore = {
        async loadData() {
          return null;
        },
        async saveData() {
          calls++;
          if (calls === 1) throw new Error("disk full");
        },
      };
      const kv = new KeyValueStore(store);

      await expect(kv.set("a", 1)).rejects.toThrow("disk full");
      await expect(kv.set("b", 2)).resolves.toBeUndefined();
      expect(calls).toBe(2);
    });

    it("should reject every caller sharing a failed coalesced write and recover on the next write", async () => {
      let calls = 0;
      const saved: unknown[] = [];
      const store: DataStore = {
        async loadData() {
          return null;
        },
        async saveData(data: unknown) {
          calls++;
          await new Promise((resolve) => setTimeout(resolve, 5));
          // Fail the follow-up (second) write that the queued sets share.
          if (calls === 2) throw new Error("disk full");
          saved.push(JSON.parse(JSON.stringify(data)));
        },
      };
      const kv = new KeyValueStore(store);
      await kv.get("warm");

      const results = await Promise.allSettled([kv.set("a", 1), kv.set("b", 2), kv.set("c", 3)]);

      expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "rejected"]);

      // The failed values stay in the cache, so the next successful write persists them.
      await kv.set("d", 4);
      expect(saved[saved.length - 1]).toEqual({ state: { a: 1, b: 2, c: 3, d: 4 } });
    });
  });

  describe("cache behavior", () => {
    it("should initialize cache from existing data store", async () => {
      // Pre-populate the mock store
      await mockStore.saveData({ state: { preKey: "preValue" } });

      // Create new KV store instance
      const newKvStore = new KeyValueStore(mockStore);
      const result = await newKvStore.get("preKey");
      expect(result).toBe("preValue");
    });

    it("should handle null/undefined data from store", async () => {
      mockStore.reset();
      const result = await kvStore.get("anyKey");
      expect(result).toBeUndefined();
    });
  });
});
