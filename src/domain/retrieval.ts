import type {
  MemoryRecord,
  RetrievalScoreBreakdown,
  RetrievedMemory,
} from "./models";

export interface RetrievalOptions {
  maxMemories?: number;
  maxPerCategory?: number;
  characterBudget?: number;
  now?: Date;
}

const DAY_MS = 86_400_000;
const RECENCY_HALF_LIFE_DAYS = 180;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const aValue = a[index] ?? 0;
    const bValue = b[index] ?? 0;
    dot += aValue * bValue;
    normA += aValue * aValue;
    normB += bValue * bValue;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function scoreMemory(
  memory: Pick<MemoryRecord, "embedding" | "importance" | "confidence" | "effectiveAt">,
  queryEmbedding: number[],
  now = new Date(),
): RetrievalScoreBreakdown {
  const rawCosine = memory.embedding
    ? cosineSimilarity(queryEmbedding, memory.embedding)
    : 0;
  const semantic = clamp((rawCosine + 1) / 2);
  const importance = clamp((memory.importance - 1) / 4);
  const ageDays = Math.max(0, (now.getTime() - memory.effectiveAt.getTime()) / DAY_MS);
  const recency = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  const confidence = clamp(memory.confidence);
  const total =
    semantic * 0.65 + importance * 0.15 + recency * 0.1 + confidence * 0.1;
  return { semantic, importance, recency, confidence, total };
}

export function retrieveMemories(
  candidates: MemoryRecord[],
  queryEmbedding: number[],
  options: RetrievalOptions = {},
): RetrievedMemory[] {
  const maxMemories = options.maxMemories ?? 5;
  const maxPerCategory = options.maxPerCategory ?? 2;
  const characterBudget = options.characterBudget ?? 3_200;
  const now = options.now ?? new Date();

  const ranked = candidates
    .filter(
      (memory): memory is MemoryRecord & { statement: string; embedding: number[] } =>
        memory.status === "active" &&
        typeof memory.statement === "string" &&
        memory.statement.trim().length > 0 &&
        Array.isArray(memory.embedding) &&
        memory.embedding.length === queryEmbedding.length,
    )
    .map((memory) => ({ memory, score: scoreMemory(memory, queryEmbedding, now) }))
    .sort((left, right) => right.score.total - left.score.total);

  const selected: RetrievedMemory[] = [];
  const categoryCounts = new Map<string, number>();
  let usedCharacters = 0;

  for (const { memory, score } of ranked) {
    if (selected.length >= maxMemories) break;
    if ((categoryCounts.get(memory.category) ?? 0) >= maxPerCategory) continue;
    const estimatedCharacters = memory.statement.length + memory.category.length + 8;
    if (usedCharacters + estimatedCharacters > characterBudget) continue;
    selected.push({
      id: memory.id,
      category: memory.category,
      statement: memory.statement,
      score,
      estimatedCharacters,
    });
    usedCharacters += estimatedCharacters;
    categoryCounts.set(memory.category, (categoryCounts.get(memory.category) ?? 0) + 1);
  }

  return selected;
}
