import type { MemoryRecord } from "@/domain/models";
import { retrieveMemories } from "@/domain/retrieval";
import {
  deterministicEmbedding,
  deterministicExtraction,
} from "@/infrastructure/qwen/deterministic-qwen";

import {
  extractionCorpus,
  retrievalCorpus,
  type ExpectedMemory,
  type RetrievalMemoryFixture,
} from "./corpus";

export const SYNTHETIC_EVALUATION_THRESHOLDS = {
  extractionPrecision: 0.85,
  extractionRecall: 0.8,
  retrievalHitAt5: 0.9,
} as const;

const REFERENCE_TIME = new Date("2026-07-18T12:00:00.000Z");

export interface ExtractionCaseResult {
  id: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface RetrievalCaseResult {
  id: string;
  expectedMemoryId: string;
  selectedMemoryIds: string[];
  hitAt5: boolean;
}

export interface SyntheticEvaluationResult {
  schemaVersion: 1;
  corpusVersion: "threadline-synthetic-v1";
  benchmark: {
    kind: "deterministic-regression";
    adapter: "DeterministicQwenAdapter";
    syntheticDataOnly: true;
    liveModelAccuracy: false;
  };
  thresholds: typeof SYNTHETIC_EVALUATION_THRESHOLDS;
  metrics: {
    extraction: {
      precision: number;
      recall: number;
      truePositives: number;
      falsePositives: number;
      falseNegatives: number;
      caseCount: number;
    };
    retrieval: {
      hitAt5: number;
      hits: number;
      caseCount: number;
    };
  };
  coverage: {
    categories: string[];
    specialCases: string[];
    profiles: string[];
  };
  passed: boolean;
  cases: {
    extraction: ExtractionCaseResult[];
    retrieval: RetrievalCaseResult[];
  };
}

function normalizeStatement(statement: string): string {
  return statement
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function memoryKey(memory: ExpectedMemory): string {
  return `${memory.category}::${normalizeStatement(memory.statement)}`;
}

function frequencyMap(memories: ExpectedMemory[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const memory of memories) {
    const key = memoryKey(memory);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function scoreExtractionCase(
  predicted: ExpectedMemory[],
  expected: ExpectedMemory[],
): Omit<ExtractionCaseResult, "id"> {
  const remainingExpected = frequencyMap(expected);
  let truePositives = 0;
  let falsePositives = 0;

  for (const memory of predicted) {
    const key = memoryKey(memory);
    const remaining = remainingExpected.get(key) ?? 0;
    if (remaining > 0) {
      truePositives += 1;
      remainingExpected.set(key, remaining - 1);
    } else {
      falsePositives += 1;
    }
  }

  const falseNegatives = Array.from(remainingExpected.values()).reduce(
    (total, count) => total + count,
    0,
  );

  return { truePositives, falsePositives, falseNegatives };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function fixtureToRecord(fixture: RetrievalMemoryFixture): MemoryRecord {
  const effectiveAt = new Date(
    REFERENCE_TIME.getTime() - (fixture.ageDays ?? 14) * 86_400_000,
  );
  return {
    id: fixture.id,
    workspaceId: "workspace-evaluation",
    patientId: "patient-maya",
    sourceSessionId: "session-evaluation",
    category: fixture.category,
    // A forgotten decoy intentionally retains fixture text here so the test
    // proves status filtering, independently of the repository's data erasure.
    statement: fixture.statement,
    importance: fixture.importance ?? 3,
    confidence: fixture.confidence ?? 0.9,
    status: fixture.status ?? "active",
    embedding: deterministicEmbedding(fixture.statement),
    embeddingModel: "deterministic-embedding-v1",
    embeddingDimensions: 1_024,
    effectiveAt,
    supersedesId: null,
    createdAt: effectiveAt,
    updatedAt: effectiveAt,
  };
}

export function runSyntheticEvaluation(): SyntheticEvaluationResult {
  const extractionResults = extractionCorpus.map((evaluationCase) => {
    const extraction = deterministicExtraction({
      messages: evaluationCase.messages,
      knownMemories: [],
    });
    return {
      id: evaluationCase.id,
      ...scoreExtractionCase(extraction.memories, evaluationCase.expectedMemories),
    };
  });

  const truePositives = extractionResults.reduce(
    (total, result) => total + result.truePositives,
    0,
  );
  const falsePositives = extractionResults.reduce(
    (total, result) => total + result.falsePositives,
    0,
  );
  const falseNegatives = extractionResults.reduce(
    (total, result) => total + result.falseNegatives,
    0,
  );
  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, truePositives + falseNegatives);

  const retrievalResults = retrievalCorpus.map((evaluationCase) => {
    const selected = retrieveMemories(
      evaluationCase.candidates.map(fixtureToRecord),
      deterministicEmbedding(evaluationCase.query),
      { maxMemories: 5, maxPerCategory: 2, characterBudget: 3_200, now: REFERENCE_TIME },
    );
    const selectedMemoryIds = selected.map((memory) => memory.id);
    return {
      id: evaluationCase.id,
      expectedMemoryId: evaluationCase.expectedMemoryId,
      selectedMemoryIds,
      hitAt5: selectedMemoryIds.includes(evaluationCase.expectedMemoryId),
    };
  });
  const hits = retrievalResults.filter((result) => result.hitAt5).length;
  const hitAt5 = ratio(hits, retrievalResults.length);

  const categories = Array.from(
    new Set(
      extractionCorpus.flatMap((evaluationCase) =>
        evaluationCase.expectedMemories.map((memory) => memory.category),
      ),
    ),
  ).sort();
  const specialCases = Array.from(
    new Set(extractionCorpus.flatMap((evaluationCase) => evaluationCase.tags)),
  )
    .filter((tag) => tag !== "baseline")
    .sort();
  const profiles = Array.from(new Set(extractionCorpus.map(({ profileId }) => profileId))).sort();

  const passed =
    precision >= SYNTHETIC_EVALUATION_THRESHOLDS.extractionPrecision &&
    recall >= SYNTHETIC_EVALUATION_THRESHOLDS.extractionRecall &&
    hitAt5 >= SYNTHETIC_EVALUATION_THRESHOLDS.retrievalHitAt5;

  return {
    schemaVersion: 1,
    corpusVersion: "threadline-synthetic-v1",
    benchmark: {
      kind: "deterministic-regression",
      adapter: "DeterministicQwenAdapter",
      syntheticDataOnly: true,
      liveModelAccuracy: false,
    },
    thresholds: SYNTHETIC_EVALUATION_THRESHOLDS,
    metrics: {
      extraction: {
        precision,
        recall,
        truePositives,
        falsePositives,
        falseNegatives,
        caseCount: extractionResults.length,
      },
      retrieval: { hitAt5, hits, caseCount: retrievalResults.length },
    },
    coverage: { categories, specialCases, profiles },
    passed,
    cases: { extraction: extractionResults, retrieval: retrievalResults },
  };
}
