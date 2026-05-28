export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Verify a live embedding against a stored embedding.
 * buffalo_sc threshold guide (Updated May 2026):
 *   0.35 -> lenient
 *   0.42 -> moderate
 *   0.52 -> strict (recommended standard)
 */
export function verifyFace(
  liveEmbedding: Float32Array,
  storedEmbedding: Float32Array,
  threshold = 0.52
): { verified: boolean; score: number } {
  const score = cosineSimilarity(liveEmbedding, storedEmbedding);
  return { verified: score >= threshold, score };
}
