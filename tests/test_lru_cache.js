"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { LRUCache } = require("../src/lru_cache");
const { TTLLRUCache } = require("../src/ttl_lru_cache");

/**
 * Fake monotonic clock so TTL tests never sleep.
 * @param {number} [start] initial time in seconds
 */
function makeClock(start = 0) {
  let now = start;
  return {
    /** @returns {number} current simulated seconds */
    clock: () => now,
    /** @param {number} seconds amount to move forward */
    advance: (seconds) => {
      now += seconds;
      return now;
    },
  };
}

// ---------------------------------------------------------------------------
// Core LRU behaviour
// ---------------------------------------------------------------------------

test("reference example produces exactly the documented results", () => {
  const cache = new LRUCache(2);
  cache.put("A", 10);
  cache.put("B", 20);
  assert.equal(cache.get("A"), 10);
  cache.put("C", 30); // evicts "B"
  assert.equal(cache.get("B"), -1);
  assert.equal(cache.get("C"), 30);
  assert.equal(cache.get("A"), 10);
  // Final order (MRU -> LRU): get("A") last, then "C", "B" is gone
  assert.deepEqual(cache.keysInOrder(), ["A", "C"]);
});

test("capacity 1: every new key evicts the previous one", () => {
  const cache = new LRUCache(1);
  cache.put("A", 1);
  assert.equal(cache.get("A"), 1);

  cache.put("B", 2); // evicts A
  assert.equal(cache.get("A"), -1);
  assert.equal(cache.get("B"), 2);
  assert.equal(cache.length, 1);

  cache.put("C", 3); // evicts B
  assert.equal(cache.get("B"), -1);
  assert.equal(cache.get("C"), 3);
  assert.equal(cache.length, 1);
});

test("updating an existing key changes the value AND makes it most recently used", () => {
  const cache = new LRUCache(2);
  cache.put("A", 10);
  cache.put("B", 20);
  // Update A: new value, and A jumps ahead of B in recency
  cache.put("A", 99);
  assert.equal(cache.get("A"), 99);
  assert.deepEqual(cache.keysInOrder(), ["A", "B"]);

  // Because A is now MRU, inserting C evicts B (the true LRU), not A
  cache.put("C", 30);
  assert.equal(cache.get("B"), -1);
  assert.equal(cache.get("A"), 99);
  assert.equal(cache.length, 2);
});

test("get on a missing key returns -1 and does not change the order", () => {
  const cache = new LRUCache(2);
  cache.put("A", 10);
  cache.put("B", 20);
  assert.equal(cache.get("ZZZ"), -1);
  assert.deepEqual(cache.keysInOrder(), ["B", "A"]);
  assert.equal(cache.length, 2);
});

test("get refreshes recency: hit key moves from LRU side to MRU side", () => {
  const cache = new LRUCache(3);
  cache.put("A", 1);
  cache.put("B", 2);
  cache.put("C", 3); // order MRU->LRU: [C, B, A]
  assert.deepEqual(cache.keysInOrder(), ["C", "B", "A"]);

  assert.equal(cache.get("A"), 1); // touch A
  assert.deepEqual(cache.keysInOrder(), ["A", "C", "B"]); // A now MRU, B now LRU
});

test("repeated puts evict keys in least-recently-used order", () => {
  const cache = new LRUCache(2);
  const evicted = [];
  const seenBefore = new Set();

  const putAndTrack = (key, value) => {
    const before = cache.keysInOrder();
    cache.put(key, value);
    const after = new Set(cache.keysInOrder());
    for (const k of before) {
      if (!after.has(k)) evicted.push(k);
    }
    seenBefore.add(key);
  };

  putAndTrack("A", 1);
  putAndTrack("B", 2);
  putAndTrack("C", 3); // evicts A
  cache.get("C"); // refresh C
  putAndTrack("D", 4); // evicts B (C was refreshed, A already gone)
  putAndTrack("E", 5); // evicts... order was [C, D] -> wait, verify below

  // Deterministic eviction sequence:
  //   puts A,B     -> [B,A]
  //   put  C       -> evicts A  -> [C,B]
  //   get  C       -> [C,B] (C already MRU)
  //   put  D       -> evicts B  -> [D,C]
  //   put  E       -> evicts C  -> [E,D]
  assert.deepEqual(evicted, ["A", "B", "C"]);
  assert.deepEqual(cache.keysInOrder(), ["E", "D"]);
  assert.equal(cache.length, 2);
});

test("invalid capacities are rejected with a clear error", () => {
  const bad = [0, -1, -10, 2.5, NaN, Infinity, "2", null, undefined, {}, []];
  for (const capacity of bad) {
    assert.throws(
      () => new LRUCache(capacity),
      (err) =>
        err instanceof RangeError &&
        /positive integer/.test(err.message),
      `expected RangeError for capacity ${String(capacity)}`
    );
  }
  // Sanity: a valid capacity does not throw
  assert.doesNotThrow(() => new LRUCache(1));
  assert.doesNotThrow(() => new LRUCache(1000));
});

test("falsy values (0, empty string, false, null) are stored correctly", () => {
  const cache = new LRUCache(3);
  cache.put("zero", 0);
  cache.put("empty", "");
  cache.put("no", false);

  // 0 is a VALUE, not a miss — must not be confused with the -1 miss sentinel
  assert.equal(cache.get("zero"), 0);
  assert.equal(cache.get("empty"), "");
  assert.equal(cache.get("no"), false);
  assert.equal(cache.has("zero"), true);
  assert.equal(cache.length, 3);

  // Re-touch "zero" so it is MRU, then exceed capacity:
  // order becomes [zero, no, empty] -> LRU is "empty" -> "empty" is evicted.
  assert.equal(cache.get("zero"), 0);
  cache.put("nil", null);
  assert.equal(cache.get("nil"), null);
  assert.equal(cache.get("zero"), 0); // still present (was refreshed)
  assert.equal(cache.get("empty"), -1); // this one was evicted
  assert.equal(cache.length, 3);
});

test("length, has(), and keysInOrder() behave as documented", () => {
  const cache = new LRUCache(2);
  assert.equal(cache.length, 0);
  assert.deepEqual(cache.keysInOrder(), []);

  cache.put("A", 10);
  cache.put("B", 20);
  assert.equal(cache.length, 2);
  assert.equal(cache.has("A"), true);
  assert.equal(cache.has("B"), true);
  assert.equal(cache.has("missing"), false);
  assert.deepEqual(cache.keysInOrder(), ["B", "A"]); // MRU -> LRU

  // has() must NOT change recency (only get/put do)
  cache.has("A");
  assert.deepEqual(cache.keysInOrder(), ["B", "A"]);
});

test("evicted entries leave no stale keys (map and list stay in sync)", () => {
  const cache = new LRUCache(2);
  cache.put("A", 1);
  cache.put("B", 2);
  cache.put("C", 3); // evicts A
  assert.equal(cache.has("A"), false);
  assert.equal(cache.length, 2);
  assert.equal(cache._map.size, 2); // internal map has no stale key
  // evicted node is fully unlinked (GC-able, no leaked pointers)
  assert.equal(cache._map.has("A"), false);
});

// ---------------------------------------------------------------------------
// Bonus: TTL behaviour (all using a fake clock — no sleeping)
// ---------------------------------------------------------------------------

test("TTL: expired entry returns -1 on get and is removed", () => {
  const { clock, advance } = makeClock();
  const cache = new TTLLRUCache(2, { clock });

  cache.put("A", 10, 5); // expires at t=5
  cache.put("B", 20); // never expires
  assert.equal(cache.get("A"), 10);

  advance(6); // t=6 -> A is dead
  assert.equal(cache.get("A"), -1); // expired = miss
  assert.equal(cache.has("A"), false); // and gone
  assert.equal(cache.length, 1); // only B remains
  assert.deepEqual(cache.keysInOrder(), ["B"]);
});

test("TTL: expired entries do not count toward capacity on the LRU side", () => {
  const { clock, advance } = makeClock();
  const cache = new TTLLRUCache(2, { clock });

  cache.put("A", 1, 5); // will expire
  advance(10); // A is dead but was never touched again
  // Inserting new entries must NOT evict live data to make room for dead A
  cache.put("B", 2);
  cache.put("C", 3);
  assert.equal(cache.get("B"), 2);
  assert.equal(cache.get("C"), 3);
  assert.equal(cache.length, 2);
  assert.equal(cache.has("A"), false);
});

test("TTL: updating a key refreshes its TTL", () => {
  const { clock, advance } = makeClock();
  const cache = new TTLLRUCache(2, { clock });

  cache.put("A", 1, 10); // expires at t=10
  advance(5);
  cache.put("A", 2, 10); // update refreshes: expires at t=15
  assert.equal(cache.get("A"), 2);

  advance(6); // t=11: past ORIGINAL deadline, within refreshed one
  assert.equal(cache.get("A"), 2); // still alive thanks to refresh

  advance(5); // t=16 > 15
  assert.equal(cache.get("A"), -1); // now expired
});

test("TTL: entries without a ttl never expire", () => {
  const { clock, advance } = makeClock();
  const cache = new TTLLRUCache(2, { clock });

  cache.put("A", 1); // no ttl
  cache.put("B", 2, 5);
  advance(1_000_000); // far beyond B's ttl
  assert.equal(cache.get("A"), 1); // A survives forever
  assert.equal(cache.get("B"), -1); // B expired
});

test("TTL: updating without a ttl clears the previous expiry (documented policy)", () => {
  const { clock, advance } = makeClock();
  const cache = new TTLLRUCache(2, { clock });

  cache.put("A", 1, 5);
  cache.put("A", 2); // update with no ttl -> never expires from now on
  advance(100);
  assert.equal(cache.get("A"), 2);
});

test("TTL: has() lazily removes expired entries", () => {
  const { clock, advance } = makeClock();
  const cache = new TTLLRUCache(2, { clock });

  cache.put("A", 1, 5);
  advance(6);
  assert.equal(cache.has("A"), false); // expired -> reported absent
  assert.equal(cache.length, 0); // and removed, not just hidden
});

test("TTL: invalid ttl values are rejected", () => {
  const { clock } = makeClock();
  const cache = new TTLLRUCache(2, { clock });
  for (const ttl of [-1, -0.5, NaN, Infinity, "5", {}]) {
    assert.throws(
      () => cache.put("A", 1, ttl),
      (err) => err instanceof RangeError && /ttl/.test(err.message),
      `expected RangeError for ttl ${String(ttl)}`
    );
  }
  assert.doesNotThrow(() => cache.put("A", 1, 0)); // ttl=0 is valid (instant expiry)
});
