"use strict";

/**
 * Demo: prints REAL program output for every operation, step by step.
 * Run with:  node demo.js   (or: npm run demo)
 *
 * Section 1 reproduces the reference example exactly.
 * Section 2 demonstrates TTL using a SIMULATED clock (no sleeping).
 */

const { LRUCache } = require("./src/lru_cache");
const { TTLLRUCache } = require("./src/ttl_lru_cache");

const LABEL_WIDTH = 14; // aligns "->" exactly like the reference example

/** Keys of the cache from MRU to LRU, e.g. `[B, A]`. */
function order(cache) {
  return `[${cache.keysInOrder().join(", ")}]`;
}

/** Prints `<padded label>-> <message>`. */
function line(label, message) {
  console.log(`${label.padEnd(LABEL_WIDTH)}-> ${message}`);
}

/** put() wrapper that also detects which key (if any) got evicted. */
function doPut(cache, key, value) {
  const before = new Set(cache.keysInOrder());
  cache.put(key, value);
  const after = cache.keysInOrder();
  const evicted = [...before].filter((k) => !after.includes(k));
  const label = `put(${JSON.stringify(key)}, ${value})`;
  if (evicted.length > 0) {
    line(label, `evicted ${JSON.stringify(evicted[0])}   order: ${order(cache)}`);
  } else {
    line(label, `order: ${order(cache)}`);
  }
}

/** get() wrapper showing a hit (value + order) or a miss (-1). */
function doGet(cache, key) {
  const label = `get(${JSON.stringify(key)})`;
  const value = cache.get(key);
  if (value === -1 && !cache.has(key)) {
    line(label, `-1   (miss)`);
  } else {
    line(label, `${value}   order: ${order(cache)}`);
  }
}

// ===========================================================================
// Section 1 — reference example
// ===========================================================================
console.log("=== LRU Cache demo (capacity = 2): reference example ===\n");

const cache = new LRUCache(2);
doPut(cache, "A", 10);
doPut(cache, "B", 20);
doGet(cache, "A"); // hit -> also makes A the most recently used
doPut(cache, "C", 30); // capacity exceeded -> evicts LRU ("B")
doGet(cache, "B"); // miss -> -1
doGet(cache, "C");
doGet(cache, "A");

// ===========================================================================
// Section 2 — BONUS: TTL with a simulated clock (we SET time, never sleep)
// ===========================================================================
console.log("\n=== BONUS: TTL expiration (simulated clock, no sleeping) ===");

/** Simulated time in seconds; advanced explicitly below. */
let now = 0;

function ttlLabel(action) {
  return `[t=${String(now).padStart(2)}s] ${action}`.padEnd(34);
}

/** put() wrapper that also detects which key (if any) was removed. */
function ttlPut(cache, key, value, ttl) {
  const before = new Set(cache.keysInOrder());
  // Which keys are already dead BEFORE this put? (peek internals for display)
  const deadBefore = new Set(
    [...before].filter((k) => cache._map.has(k) && cache._isExpired(k))
  );
  cache.put(key, value, ttl);
  const after = cache.keysInOrder();
  const removed = [...before].filter((k) => !after.includes(k));
  const ttlText = ttl === null ? "" : `, ttl=${ttl}s`;
  const expires = ttl === null ? "" : `   expires@t=${now + ttl}s`;
  const action = `put(${JSON.stringify(key)}, ${value}${ttlText})`;
  if (removed.length > 0) {
    const k = removed[0];
    const what = deadBefore.has(k)
      ? `removed expired ${JSON.stringify(k)}`
      : `evicted ${JSON.stringify(k)}`;
    console.log(`${ttlLabel(action)}-> ${what}   order: ${order(cache)}${expires}`);
  } else {
    console.log(`${ttlLabel(action)}-> order: ${order(cache)}${expires}`);
  }
}

function ttlGet(cache, key) {
  const action = `get(${JSON.stringify(key)})`;
  // Peek at internals ONLY so the demo can say "expired" vs plain "miss":
  const wasPresent = cache._map.has(key);
  const wasExpired = wasPresent && cache._isExpired(key);
  const value = cache.get(key); // purges the entry if it expired
  if (value === -1 && wasExpired) {
    console.log(`${ttlLabel(action)}-> -1   (expired -> removed)`);
  } else if (value === -1) {
    console.log(`${ttlLabel(action)}-> -1   (miss)`);
  } else {
    console.log(`${ttlLabel(action)}-> ${value}   order: ${order(cache)}`);
  }
}

// --- 2a. basic expiry; entries without TTL never expire -------------------
console.log("\n--- 2a. Basic expiry vs. no-TTL entries ---");
now = 0;
const ttlDemo = new TTLLRUCache(2, { clock: () => now });
ttlPut(ttlDemo, "S", 100, 5); // dies at t=5
ttlPut(ttlDemo, "R", 200, null); // never expires
now = 2;
ttlGet(ttlDemo, "S"); // alive
now = 6; // jump past S's deadline
ttlGet(ttlDemo, "S"); // expired -> -1 and removed
ttlGet(ttlDemo, "R"); // still alive (no TTL)
console.log(`${ttlLabel("length")}-> ${ttlDemo.length}   order: ${order(ttlDemo)}`);

// --- 2b. updating a key REFRESHES its TTL ---------------------------------
console.log("\n--- 2b. TTL refresh on update ---");
now = 0;
const refreshDemo = new TTLLRUCache(2, { clock: () => now });
ttlPut(refreshDemo, "K", 1, 10); // original deadline: t=10
now = 5;
ttlPut(refreshDemo, "K", 2, 10); // update -> refreshed deadline: t=15
now = 11; // past the ORIGINAL deadline
ttlGet(refreshDemo, "K"); // still alive thanks to the refresh
now = 16; // past the refreshed deadline
ttlGet(refreshDemo, "K"); // expired

// --- 2c. expired entries do not consume capacity --------------------------
console.log("\n--- 2c. Expired entries free up capacity ---");
now = 0;
const capacityDemo = new TTLLRUCache(2, { clock: () => now });
ttlPut(capacityDemo, "X", 1, 1); // dies at t=1 (never touched again)
now = 10;
ttlPut(capacityDemo, "A", 2, null); // X is dead -> its slot is reused
ttlPut(capacityDemo, "B", 3, null); // both live entries fit in capacity 2
ttlGet(capacityDemo, "X");
ttlGet(capacityDemo, "A");
ttlGet(capacityDemo, "B");

console.log("\nDone. Every line above is real program output.");
