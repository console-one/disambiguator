import { Heap } from 'heap-js';

export { Heap };

export function reSortHeap<T>(heap: Heap<T>): void {
  const heapArray = heap.toArray();
  heap.clear();
  heap.init(heapArray);
}

export function getElementFromHeap<T>(heap: Heap<T>, selector: (element: T) => boolean): T | undefined {
  const heapArray = heap.toArray();
  return heapArray.find(selector);
}

export function removeFromHeap<T>(heap: Heap<T>, selector: (element: T) => boolean): boolean {
  const heapArray = heap.toArray();
  let elementFound = false;

  // Find the index of the element to be removed
  const indexToRemove = heapArray.findIndex(selector);
  if (indexToRemove === -1) {
      return false; // Element not found
  }

  // Remove the element by index
  heapArray.splice(indexToRemove, 1);
  elementFound = true;

  // Rebuild the heap
  heap.clear();
  heap.init(heapArray);
  return elementFound;
}