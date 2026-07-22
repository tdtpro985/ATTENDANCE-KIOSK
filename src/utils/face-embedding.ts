export const MODEL_CONFIG = {
  name: 'buffalo_sc',
  inputSize: 112,
  channels: 3,
  matchThreshold: 0.57,
  subThreshold: 0.50,
} as const;

export function compareEmbeddings(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function isMatch(similarity: number, threshold?: number): boolean {
  return similarity >= (threshold ?? MODEL_CONFIG.matchThreshold);
}

/**
 * Compare a live (frontal) embedding against the stored profile embedding.
 * Stored embeddings may be a single vector or a multi-angle set captured during
 * registration ([Frontal, Frontal-Far, Left, Right, Up]); only index 0 (Frontal —
 * the same pose used for the profile picture) is comparable to a frontal live
 * capture, so that's the only one used for the match decision.
 */
export function compareMultiAngleEmbeddings(
  liveEmbedding: number[],
  storedEmbedding: number[] | number[][]
): { maxSimilarity: number; bestAngleIndex: number; perAngleScores: number[]; angleCount: number } {
  const frontalEmb: number[] | undefined =
    storedEmbedding.length > 0 && Array.isArray(storedEmbedding[0])
      ? (storedEmbedding as number[][])[0]
      : (storedEmbedding as number[]);

  if (!Array.isArray(frontalEmb) || frontalEmb.length < 64 || frontalEmb.length !== liveEmbedding.length) {
    return { maxSimilarity: -1, bestAngleIndex: -1, perAngleScores: [-1], angleCount: 1 };
  }

  const sim = compareEmbeddings(liveEmbedding, frontalEmb);
  return {
    maxSimilarity: sim,
    bestAngleIndex: 0,
    perAngleScores: [sim],
    angleCount: 1,
  };
}
