# Task 3 — Algorithm Explanation & Critical Thinking

**1. Data structures.** A hash map (`Map<key, Node>`) paired with a doubly
linked list ordered by recency (MRU at head, LRU at tail), bracketed by
sentinel head/tail nodes. The map alone has no recency order; the list alone
would need O(n) searches. Sentinels eliminate null edge cases.

**2. Complexity.** `get`/`put` are O(1) average — one map lookup plus a
constant number of pointer updates; eviction is O(1) (unlink `tail.prev`,
delete one map key). Space is O(capacity): at most `capacity` nodes and map
entries.

**3. Limitation.** With TTL, cleanup is lazy: an expired entry that is never
touched again — often sitting mid-list after a late access — still holds
memory until a put purges the LRU tail or the key is touched. A write-heavy
workload with many short-lived, never-revisited keys can therefore retain
dead entries longer than expected.

**4. AI suggestion.** The AI suggested returning a `{hit, value}` object to
remove the ambiguity of using `-1` as both a stored value and the miss
marker. I rejected it because the specification explicitly requires `-1`; I
instead documented the edge case in the README and used `has()`
(recency-neutral) to disambiguate in the demo.
