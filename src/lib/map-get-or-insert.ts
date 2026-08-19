type MapWithComputedInsert<K, V> = Map<K, V> & {
  getOrInsertComputed?: (key: K, compute: (key: K) => V) => V;
};

const mapProto = Map.prototype as MapWithComputedInsert<unknown, unknown>;

if (typeof mapProto.getOrInsertComputed !== "function") {
  mapProto.getOrInsertComputed = function (key, compute) {
    if (this.has(key)) return this.get(key);
    const value = compute(key);
    this.set(key, value);
    return value;
  };
}
