# LRU Cache (from scratch) — with optional TTL bonus

A production-quality, fully tested **Least Recently Used (LRU) Cache**
implemented in JavaScript with **zero dependencies**, using a
**hash map + doubly linked list** (no built-in LRU shortcuts such as
`functools.lru_cache`, `OrderedDict`, or `LinkedHashMap`).

## Problem statement

Implement a cache supporting:

- `new LRUCache(capacity)` — capacity must be a **positive integer**
  (`0`, negatives, and non-integers are rejected with a clear error)
- `get(key)` — returns the stored value if the key exists, otherwise `-1`;
  a successful get makes that key the **most recently used**
- `put(key, value)` — inserts or updates a pair; an update also makes the
  key most recently used; when capacity is exceeded, the **least recently
  used** entry is evicted
- Both operations run in **O(1) average time**

### Features

- Core: `LRUCache` with `get`, `put`, `has` (does **not** change recency),
  `length`, and `keysInOrder()` / `toString()` debug helpers (MRU → LRU)
- Typed via JSDoc generics (`LRUCache<K, V>`) — keys/values of any type
- Bonus: `TTLLRUCache` with `put(key, value, ttlSeconds)` and **lazy
  expiration** using an **injectable clock** (tests/demos simulate time
  without sleeping)
- 17 tests on Node's built-in test runner (`node:test`) — no packages to install

## Data structures — and why

| Structure | Role | Why |
|---|---|---|
| `Map` (hash map) `key -> Node` | O(1) lookup of a key's node | Without it, finding a key would scan the list — O(n) |
| Doubly linked list of `Node`s | Order entries by recency; O(1) re-order + O(1) eviction of the tail-side node | A plain array/list makes removal/reordering O(n) (`splice` scans); a single `dict` has no recency order at all |
| Sentinel `head`/`tail` dummy nodes | Bracket all real entries | `head.next` (MRU) and `tail.prev` (LRU) are **never null** — even when empty — eliminating the classic null-edge-case bugs (empty list, single node, node that is both first and last) |

**Why not a plain list?** `list.remove()` / `indexOf()` are O(n), violating
the O(1) requirement. **Why not a single dict?** Insertion order ≠ recency:
every get would require delete+reinsert (O(n) in JS `Map`), and eviction
would need a scan for the oldest key.

## How LRU ordering is maintained

Invariant: **`head <-> (MRU … LRU) <-> tail`** — most recently used at the
head side, least recently used at the tail side.

- **`get` hit** → `_moveToFront(node)`: unlink, re-insert right after `head`
- **`put` new key** → `_addToFront(node)` at the head side, then if
  `size > capacity` → `_evictLru()` removes `tail.prev` from **both** the
  list and the map
- **`put` existing key** → update `value`, then `_moveToFront(node)`

```
capacity = 3, after: put("A"), put("B"), get("A"), put("C")

  head                                                 tail
   │                                                    │
   ▼                                                    ▼
  ┌────────┬───────────────┬───────────────┬───────────────┬────────┐
  │  head  │     "A"       │     "C"       │     "B"       │  tail  │
  │(dummy) │   val = 10    │   val = 30    │   val = 20    │ (dummy)│
  └────────┴───────────────┴───────────────┴───────────────┴────────┘
             ▲                   ▲               ▲
             │ most recently     │               │ least recently used
             used (MRU)          │               │ = tail.prev
                                 │               │ → EVICTED on the next
                                 └─ put("C") put() of a NEW key when
                                    inserted here (front)     at capacity
```

Eviction never scans: the victim is always `tail.prev`, and its key is
deleted from the map at the same time — **no stale keys, no orphan nodes**
(evicted nodes are fully unlinked so the garbage collector can reclaim them).

## Time & space complexity

| Operation | Complexity |
|---|---|
| `get(key)` | **O(1)** average (Map lookup + O(1) list move) |
| `put(key, value)` | **O(1)** average (Map insert + O(1) list insert/evict) |
| eviction | **O(1)** (unlink `tail.prev`, delete one map key) |
| `keysInOrder()` (debug only) | O(n) |

**Space:** O(capacity) — at most `capacity` nodes + map entries.
No hidden O(n) work anywhere: no `list.remove`, no scanning, no sorting.

## Project structure

```
lru-cache/
├── src/
│   ├── lru_cache.js             # Node + LRUCache (core, O(1) get/put)
│   └── ttl_lru_cache.js         # bonus: TTLLRUCache (lazy TTL, injectable clock)
├── tests/
│   └── test_lru_cache.js        # 17 tests on node:test (zero dependencies)
├── demo.js                      # prints real output for the screenshots
├── README.md
├── package.json                 # scripts: test, demo (no dependencies)
├── .gitignore
└── AI_PROMPT_HISTORY.txt
```

## How to run (exact commands)

**Requirements:** Node.js **>= 18** (uses the built-in `node:test` runner).
There are **no dependencies** — no `npm install` needed.

```bash
# run the tests (17 tests)
npm test
# equivalent without npm:
node --test tests/test_lru_cache.js

# run the demo (this is what you screenshot)
npm run demo
# equivalent without npm:
node demo.js
```

## Example output (real output of `node demo.js`)

```
=== LRU Cache demo (capacity = 2): reference example ===

put("A", 10)  -> order: [A]
put("B", 20)  -> order: [B, A]
get("A")      -> 10   order: [A, B]
put("C", 30)  -> evicted "B"   order: [C, A]
get("B")      -> -1   (miss)
get("C")      -> 30   order: [C, A]
get("A")      -> 10   order: [A, C]

=== BONUS: TTL expiration (simulated clock, no sleeping) ===

--- 2a. Basic expiry vs. no-TTL entries ---
[t= 0s] put("S", 100, ttl=5s)     -> order: [S]   expires@t=5s
[t= 0s] put("R", 200)             -> order: [R, S]
[t= 2s] get("S")                  -> 100   order: [S, R]
[t= 6s] get("S")                  -> -1   (expired -> removed)
[t= 6s] get("R")                  -> 200   order: [R]
[t= 6s] length                    -> 1   order: [R]

--- 2b. TTL refresh on update ---
[t= 0s] put("K", 1, ttl=10s)      -> order: [K]   expires@t=10s
[t= 5s] put("K", 2, ttl=10s)      -> order: [K]   expires@t=15s
[t=11s] get("K")                  -> 2   order: [K]
[t=16s] get("K")                  -> -1   (expired -> removed)

--- 2c. Expired entries free up capacity ---
[t= 0s] put("X", 1, ttl=1s)       -> order: [X]   expires@t=1s
[t=10s] put("A", 2)               -> removed expired "X"   order: [A]
[t=10s] put("B", 3)               -> order: [B, A]
[t=10s] get("X")                  -> -1   (miss)
[t=10s] get("A")                  -> 2   order: [A, B]
[t=10s] get("B")                  -> 3   order: [B, A]

Done. Every line above is real program output.
```

Test run summary:

```
# tests 17
# pass 17
# fail 0
```

## Bonus: TTL expiration

### Approach

`TTLLRUCache` (in `src/ttl_lru_cache.js`) extends `LRUCache` and adds one
extra `Map<key, expiryTime>`:

- `put(key, value, ttl?)` — `ttl` is in **seconds**; the entry dies at
  `clock() + ttl`. Omitting `ttl` means **never expires**.
- **Lazy expiration** — no threads, no timers, no heap. An entry is checked
  and removed only when it is **touched** (`get` / `put` / `has`) or when it
  sits on the **LRU side during a `put`** (consecutive expired tail entries
  are purged in one pass before inserting, so a live entry is never evicted
  to make room for a dead one).
- **Expired = removed**: `get`/`has` return `-1`/`false` and delete the
  entry immediately; it no longer counts toward capacity.
- **Injectable clock**: the constructor accepts `clock` (returns seconds),
  defaulting to `performance.now() / 1000`. Tests and the demo inject a fake
  clock and **set** time explicitly — no `sleep`, fast and deterministic.

```js
let now = 0;
const cache = new TTLLRUCache(2, { clock: () => now });
cache.put("S", 100, 5);        // expires at now+5
now = 6;                        // simulate 6 seconds later
cache.get("S");                 // -1 (expired -> removed)
```

### Trade-offs and limitations

- **Lazy vs. active cleanup:** lazy costs nothing when entries are unused
  and needs no background thread; the price is that a **never-touched
  expired entry in the middle of the list holds memory until it is touched
  or drifts to the LRU side** (the tail purge on `put` reclaims the common
  case). Alternatives: a **min-heap of expiries** gives proactive
  O(log n) removal but adds O(log n) to every `put` and duplicate-heap-entry
  handling; a **background sweep** (`setInterval`/worker) reclaims memory
  promptly but costs a timer, concurrency concerns, and CPU even when idle.
- **Does an update reset the TTL?** **Yes — deliberately.** Every `put`
  sets a fresh deadline `now + ttl`, and `put(key, value)` *without* a ttl
  **clears** the expiry (the entry becomes immortal). This is simple,
  predictable, and covered by tests ("TTL refresh on update",
  "updating without a ttl clears the previous expiry").
- **Clock choice:** default is `performance.now()` (monotonic — immune to
  system clock jumps), not `Date.now()`. Simulated clocks in tests must be
  advanced manually (`now = ...`).
- `ttl = 0` is valid and means "already expired" (removed on next touch).

## Edge cases handled & design decisions

- **Invalid capacity** (`0`, `-1`, `2.5`, `"2"`, `NaN`, `Infinity`, `null`,
  `undefined`, objects, arrays) → `RangeError: Capacity must be a positive
  integer, received: ...`.
- **Capacity 1** — every new key evicts the previous one.
- **Falsy values** — `0`, `""`, `false`, `null` are stored and returned
  correctly; the code never truth-tests a value (`node === undefined` checks
  the *node*, not the value).
- **Why is `-1` the miss value?** The spec requires it. **Limitation:** if
  `-1` were a legitimate stored value, `get` could not distinguish "miss"
  from "stored -1". Use **`has(key)`** to disambiguate — it checks
  membership **without changing recency**. (A `null`/`undefined` sentinel
  would have the same problem; a `{hit, value}` result object would be the
  fully unambiguous API.)
- **No memory leaks:** every evicted/expired node is unlinked (`prev/next`
  set to `null`) and its key is deleted from the map (and expiry map) — no
  stale keys, no orphaned nodes. A test asserts map/list stay in sync.
- **Update vs. insert:** updating never changes `length` and never triggers
  eviction; only genuinely new keys can push the cache over capacity.
- **Recency rules:** `get` (hit) and `put` refresh recency; `has`,
  `length`, and `keysInOrder()` do **not**.
- **Not thread-safe** (by requirement): JavaScript is single-threaded per
  event-loop turn; no locks are taken.

## Notes

- Language: JavaScript (Node ≥ 18) with **JSDoc** type annotations
  (`@template K, V`) — run a type check any time with
  `npx tsc --noEmit --allowJs --checkJs src/*.js demo.js` (optional; `npx`
  will download `typescript` on first use).
- The core data structure is implemented **from scratch** — no
  `LinkedHashMap`-style built-ins are used for the LRU logic.

