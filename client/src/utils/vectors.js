// Sparse vectors as plain objects: { synthwave: 3, 'late night': 1.5 }. A missing key means 0.
// Keys can be anything a user types (even "constructor"), so lookups use Object.hasOwn.

const valueOf = (vector, key) => (Object.hasOwn(vector, key) ? vector[key] : 0)

// Adds `weight` to one key and returns the same vector
export function addWeighted(vector, key, weight) {
  vector[key] = valueOf(vector, key) + weight
  return vector
}

// How alike two vectors point, from 0 (nothing in common) to 1 (same direction).
//   cos = (a · b) / (|a| × |b|)
// Only the direction matters, not the size: { a: 1, b: 2 } and { a: 10, b: 20 } score 1.
export function cosineSimilarity(a, b) {
  let dot = 0
  let lengthA = 0
  let lengthB = 0
  for (const [key, value] of Object.entries(a)) {
    lengthA += value * value
    dot += value * valueOf(b, key)
  }
  for (const value of Object.values(b)) lengthB += value * value
  if (lengthA === 0 || lengthB === 0) return 0
  return dot / Math.sqrt(lengthA * lengthB)
}

export const isEmptyVector = (vector) => !Object.values(vector).some((value) => value > 0)

// The k biggest entries as [key, value] pairs, ties broken by key so the order is stable
export function topEntries(vector, k = Infinity) {
  return Object.entries(vector)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, k)
}
