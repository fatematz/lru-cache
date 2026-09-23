"use strict";

/**
 * A node of the doubly linked list that stores one cache entry.
 *
 * Besides `key`/`value` it keeps `prev`/`next` pointers so the list can be
 * re-ordered and trimmed in O(1) without any array shuffling.
 *
 * @template K - key type
 * @template V - value type
 */
class Node {
  /**
   * @param {K} key
   * @param {V} value
   */
  constructor(key, value) {
    this.key = key;
    this.value = value;
    /** @type {Node<K, V> | null} previous node (closer to MRU side) */
    this.prev = null;
    /** @type {Node<K, V> | null} next node (closer to LRU side) */
    this.next = null;
  }
}

/**
 * Least Recently Used (LRU) cache.
 *
 * Data structures
 * ---------------
 * - `_map`: hash map from key -> Node  => O(1) lookup.
 * - Doubly linked list of Nodes ordered by recency:
 *     head <-> MRU ... LRU <-> tail
 *   => O(1) re-ordering and O(1) eviction of the LRU entry.
 *
 * Sentinel (dummy) `head` and `tail` nodes bracket the real entries, so
 * `head.next` and `tail.prev` are always valid pointers — even when the
 * cache is empty — which removes all null-edge-case branches.
 *
 * Complexity: get/put/evict are O(1) average; space is O(capacity).
 *
 * @template K - key type
 * @template V - value type
 */
class LRUCache {
  /**
   * @param {unknown} capacity maximum number of entries; must be a positive integer
   * @throws {RangeError} if capacity is not a positive integer
   */
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(
        `Capacity must be a positive integer, received: ${String(capacity)}`
      );
    }

    /** @type {number} */
    this._capacity = capacity;
    /** @type {Map<K, Node<K, V>>} key -> node for O(1) lookup */
    this._map = new Map();
    /** @type {number} number of live entries */
    this._size = 0;

    // Sentinels: everything real lives strictly between head and tail.
    // Invariant: head <-> (MRU ... LRU) <-> tail
    this._head = new Node(/** @type {K} */ (undefined), /** @type {V} */ (undefined));
    this._tail = new Node(/** @type {K} */ (undefined), /** @type {V} */ (undefined));
    this._head.next = this._tail;
    this._tail.prev = this._head;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Look up a key. On a hit the entry becomes the MOST recently used.
   *
   * @param {K} key
   * @returns {V | -1} the stored value, or -1 if the key is not present
   */
  get(key) {
    const node = this._map.get(key);
    if (node === undefined) return -1; // miss: no recency change
    this._moveToFront(node); // hit: this key is now the most recently used
    return node.value;
  }

  /**
   * Insert a new key/value pair, or update an existing one (which also makes
   * it the most recently used). If the cache is over capacity afterwards,
   * the least recently used entry is evicted.
   *
   * @param {K} key
   * @param {V} value
   * @returns {void}
   */
  put(key, value) {
    const existing = this._map.get(key);
    if (existing !== undefined) {
      // Update path: overwrite value and refresh recency.
      existing.value = value;
      this._moveToFront(existing);
      return;
    }

    // Insert path: new node at the MRU (front) side.
    const node = new Node(key, value);
    this._map.set(key, node);
    this._addToFront(node);
    this._size += 1;

    if (this._size > this._capacity) {
      this._evictLru();
    }
  }

  /**
   * Membership test. Does NOT change recency (unlike `get`).
   *
   * @param {K} key
   * @returns {boolean}
   */
  has(key) {
    return this._map.has(key);
  }

  /** @returns {number} number of live entries */
  get length() {
    return this._size;
  }

  /**
   * Keys ordered from most recently used to least recently used.
   * Debug helper — makes eviction order easy to see in output.
   *
   * @returns {K[]}
   */
  keysInOrder() {
    /** @type {K[]} */
    const keys = [];
    let current = this._head.next;
    while (current !== this._tail) {
      keys.push(current.key);
      current = current.next;
    }
    return keys;
  }

  /** @returns {string} e.g. `LRUCache(capacity=2, MRU->LRU=[A, B])` */
  toString() {
    const order = this.keysInOrder()
      .map((k) => String(k))
      .join(", ");
    return `LRUCache(capacity=${this._capacity}, MRU->LRU=[${order}])`;
  }

  // Pretty-print when the cache is logged directly (console.log(cache)).
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toString();
  }

  // ------------------------------------------------------------------
  // Private helpers (underscore = private by convention in JS)
  // ------------------------------------------------------------------

  /**
   * Insert `node` right after the sentinel head (new MRU position).
   *
   * Pointer surgery (head <-> node <-> oldFirst):
   *   1. node.prev = head, node.next = old first node
   *   2. old first node's prev now points back at node
   *   3. head.next now points forward at node
   *
   * @param {Node<K, V>} node
   * @returns {void}
   */
  _addToFront(node) {
    node.prev = this._head;
    node.next = this._head.next;
    this._head.next.prev = node;
    this._head.next = node;
  }

  /**
   * Unlink `node` from the list (leaves it isolated: prev/next = null).
   *
   * Bypasses the node by splicing its neighbours together:
   *   node.prev.next = node.next
   *   node.next.prev = node.prev
   *
   * @param {Node<K, V>} node
   * @returns {void}
   */
  _remove(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
    node.prev = null; // detach fully so evicted nodes can be garbage-collected
    node.next = null;
  }

  /**
   * Make `node` the most recently used entry (unlink, then re-add at front).
   *
   * @param {Node<K, V>} node
   * @returns {void}
   */
  _moveToFront(node) {
    this._remove(node);
    this._addToFront(node);
  }

  /**
   * Evict the least recently used entry: the node just before the sentinel
   * tail (`tail.prev`). Removes it from BOTH the list and the map, so no
   * stale key or orphan node is left behind.
   *
   * @returns {void}
   */
  _evictLru() {
    const lru = this._tail.prev;
    if (lru === this._head) return; // list is empty — nothing to evict
    const evictedKey = lru.key;
    this._remove(lru);
    this._map.delete(evictedKey);
    this._size -= 1;
  }
}

module.exports = { LRUCache, Node };
