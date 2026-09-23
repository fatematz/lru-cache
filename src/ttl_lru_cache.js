"use strict";

const { LRUCache } = require("./lru_cache");

/**
 * LRU cache with optional per-entry time-to-live (TTL).
 *
 * Extends {@link LRUCache} with:
 * - `put(key, value, ttl?)` — `ttl` is in seconds; omit it for "never expires".
 * - Lazy expiration: an entry is checked/removed only when it is touched
 *   (get/put/has) or when it sits on the LRU side during a put. No threads,
 *   no background sweeps, no heap — just an extra `Map<key, expiryTime>`.
 * - Injectable clock so tests/demos can simulate time without sleeping.
 *
 * TTL policy (documented decisions):
 * - An update ALWAYS sets the TTL fresh: `put(k, v, t)` expires at `now + t`.
 * - `put(k, v)` with no ttl CLEARS any previous ttl (entry never expires).
 * - Expired entries return -1/false from get/has and are removed on touch;
 *   they no longer count toward capacity once discovered.
 *
 * Trade-offs / limitations (see README):
 * - Lazy cleanup means a never-touched expired entry can hold memory until
 *   it is touched or reaches the LRU side. Consecutive expired LRU-side
 *   entries are purged in one pass before each insert, so live entries are
 *   not evicted to make room for dead ones.
 *
 * @template K - key type
 * @template V - value type
 * @extends LRUCache<K, V>
 */
class TTLLRUCache extends LRUCache {
  /**
   * @param {unknown} capacity maximum number of entries (positive integer)
   * @param {{ clock?: () => number }} [options] `clock` returns SECONDS
   *   (monotonic preferred); defaults to a `performance.now()`-based clock.
   *   Tests and demos inject a fake clock to advance time instantly.
   */
  constructor(capacity, options = {}) {
    super(capacity);
    /** @type {() => number} seconds on some monotonic-ish timeline */
    this._clock = options.clock ?? (() => performance.now() / 1000);
    /**
     * Only entries WITH a ttl appear here: key -> absolute expiry (seconds).
     * Absent key = never expires.
     * @type {Map<K, number>}
     */
    this._expiries = new Map();
  }

  /**
   * Insert or update a key with an optional TTL.
   *
   * @param {K} key
   * @param {V} value
   * @param {number | null} [ttl] seconds until expiry; null/omitted = no expiry
   *   (on update this REFRESHES/clears the ttl — see class docs)
   * @returns {void}
   * @throws {RangeError} if ttl is not a non-negative finite number
   */
  put(key, value, ttl = null) {
    if (ttl !== null && ttl !== undefined) {
      if (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl < 0) {
        throw new RangeError(
          `ttl must be a non-negative number of seconds, received: ${String(ttl)}`
        );
      }
    }

    // Lazy expiration on write: drop this key if it is already dead.
    this._purgeIfExpired(key);
    // Free any dead entries sitting on the LRU side BEFORE inserting, so we
    // never evict a live entry to make room for an expired one.
    this._purgeExpiredTail();

    super.put(key, value); // handles insert-vs-update, recency, eviction

    if (ttl === null || ttl === undefined) {
      this._expiries.delete(key); // no ttl -> never expires (also clears old ttl)
    } else {
      this._expiries.set(key, this._clock() + ttl);
    }
  }

  /**
   * Like {@link LRUCache#get}, but an expired entry counts as a miss
   * (-1) and is removed immediately.
   *
   * @param {K} key
   * @returns {V | -1}
   */
  get(key) {
    this._purgeIfExpired(key);
    return super.get(key);
  }

  /**
   * Like {@link LRUCache#has}, but expired entries are removed and
   * reported as absent. Does NOT change recency.
   *
   * @param {K} key
   * @returns {boolean}
   */
  has(key) {
    this._purgeIfExpired(key);
    return super.has(key);
  }

  /**
   * Hook: the base class calls this whenever it evicts the LRU entry.
   * We override it to also drop the entry's expiry (no stale TTL keys).
   *
   * @returns {void}
   */
  _evictLru() {
    const lru = this._tail.prev;
    if (lru === this._head) return; // empty — base class is a no-op too
    const evictedKey = lru.key;
    super._evictLru();
    this._expiries.delete(evictedKey);
  }

  /**
   * If `key` exists but has expired, remove it entirely.
   *
   * @param {K} key
   * @returns {boolean} true if the key was present AND expired (and now removed)
   */
  _purgeIfExpired(key) {
    if (!this._map.has(key)) return false;
    const expiry = this._expiries.get(key);
    if (expiry === undefined) return false; // no ttl set -> never expires
    if (this._clock() < expiry) return false; // still alive
    this._deleteKey(key); // expired -> remove now
    return true;
  }

  /**
   * Walk from the LRU (tail) side removing expired entries, stopping at the
   * first live one. Keeps dead entries from consuming capacity in the common
   * case where old entries are the expired ones.
   *
   * @returns {void}
   */
  _purgeExpiredTail() {
    while (this._size > 0) {
      const lru = this._tail.prev;
      if (!this._isExpired(lru.key)) break;
      this._deleteKey(lru.key);
    }
  }

  /**
   * @param {K} key
   * @returns {boolean} true if the key has a ttl and its deadline has passed
   */
  _isExpired(key) {
    const expiry = this._expiries.get(key);
    return expiry !== undefined && this._clock() >= expiry;
  }

  /**
   * Fully remove an entry: unlink from the list, delete from the map and
   * from the expiry map, decrement size. Leaves no stale references.
   *
   * @param {K} key
   * @returns {void}
   */
  _deleteKey(key) {
    const node = this._map.get(key);
    if (node === undefined) return;
    this._remove(node); // unlinks + detaches prev/next for GC
    this._map.delete(key);
    this._expiries.delete(key);
    this._size -= 1;
  }
}

module.exports = { TTLLRUCache };
