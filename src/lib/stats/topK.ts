/** Stable partial sort: compare has the same ordering contract as Array.sort. */
export function topK<T>(
  values: Iterable<T>,
  limit: number,
  compare: (a: T, b: T) => number,
): T[] {
  if (limit <= 0) return [];
  type Item = { value: T; index: number };
  const heap: Item[] = [];
  const order = (a: Item, b: Item) =>
    compare(a.value, b.value) || a.index - b.index;
  const down = () => {
    let i = 0;
    while (i * 2 + 1 < heap.length) {
      let child = i * 2 + 1;
      if (child + 1 < heap.length && order(heap[child + 1], heap[child]) > 0)
        child++;
      if (order(heap[i], heap[child]) >= 0) break;
      [heap[i], heap[child]] = [heap[child], heap[i]];
      i = child;
    }
  };
  let index = 0;
  for (const value of values) {
    const item = { value, index: index++ };
    if (heap.length < limit) {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (order(heap[parent], heap[i]) >= 0) break;
        [heap[i], heap[parent]] = [heap[parent], heap[i]];
        i = parent;
      }
    } else if (order(item, heap[0]) < 0) {
      heap[0] = item;
      down();
    }
  }
  return heap.sort(order).map((item) => item.value);
}
