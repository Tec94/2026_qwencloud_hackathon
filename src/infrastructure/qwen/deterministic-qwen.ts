import { sessionExtractionSchema } from "@/domain/extraction";
import type { MemoryCategory, SessionExtraction } from "@/domain/models";
import type { ExtractionInput, QwenPort, StreamReplyInput } from "@/domain/ports/qwen";
import { assessDeterministicRisk } from "@/domain/risk";

const DEFAULT_DIMENSIONS = 1_024;

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function deterministicEmbedding(value: string, dimensions = DEFAULT_DIMENSIONS): number[] {
  const vector = new Float32Array(dimensions);
  const tokens = value.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  for (const token of tokens) {
    const hash = fnv1a(token);
    vector[hash % dimensions] += (hash & 1) === 0 ? 1 : -1;
  }
  let magnitude = 0;
  for (const component of vector) magnitude += component * component;
  if (magnitude === 0) return Array.from(vector);
  const denominator = Math.sqrt(magnitude);
  for (let index = 0; index < vector.length; index += 1) vector[index] /= denominator;
  return Array.from(vector);
}

function sentenceCandidates(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8)
    .filter(
      (sentence) =>
        !/(?:\b(?:ignore|disregard|system prompt|developer message|return json|follow these instructions)\b|\b(?:assistant|user|system)\s*:)/i.test(sentence),
    )
    .filter((sentence) => !/\b(?:not|never|no longer|didn't|did not|doesn't|do not)\b/i.test(sentence))
    .filter(
      (sentence) =>
        !/\b(?:right now|just now|for now|this minute|today|currently|temporarily|at the moment|this morning|tonight)\b/i.test(
          sentence,
        ),
    )
    .slice(0, 12);
}

function categoryFor(sentence: string): MemoryCategory {
  if (/\b(?:breath|ground|walk|journal|music|exercise|meditat)/i.test(sentence)) {
    return "coping_strategy";
  }
  if (/\b(?:prefer|works best|feel better when)/i.test(sentence)) return "preference";
  if (/\b(?:goal|want to|plan to|hope to)/i.test(sentence)) return "goal";
  if (/\b(?:trigger|sets me off|reminds me)/i.test(sentence)) return "trigger";
  if (/\b(?:anxious|anxiety|panic|sleep|sad|overwhelm)/i.test(sentence)) return "symptom";
  if (/\b(?:next time|follow up|bring up)/i.test(sentence)) return "follow_up";
  return "context";
}

export function deterministicExtraction(input: ExtractionInput): SessionExtraction {
  const patientContent: string[] = [];
  for (const message of input.messages) {
    if (message.role !== "patient") continue;
    const content = message.content.trim();
    if (content) patientContent.push(content);
  }
  const joined = patientContent.join(" ");
  const candidates = patientContent.flatMap(sentenceCandidates);
  const selected = [...new Set(candidates)].slice(-4);
  const memories = selected.map((statement) => {
    const category = categoryFor(statement);
    const importance = category === "coping_strategy" || category === "trigger" ? 4 : 3;
    return { category, statement: statement.slice(0, 600), importance, confidence: 0.82 };
  });
  const themes: string[] = [];
  if (/anxious|anxiety|panic/i.test(joined)) themes.push("Managing anxiety");
  if (/breath|walk|ground|journal|music|exercise|meditat/i.test(joined)) {
    themes.push("Helpful coping strategies");
  }
  if (/work|family|relationship/i.test(joined)) themes.push("Life context");

  return sessionExtractionSchema.parse({
    narrative:
      joined.length > 0
        ? `The patient reflected on ${joined.slice(0, 1_100)}`
        : "The patient completed a brief reflection and identified a topic to revisit.",
    themes: themes.length > 0 ? themes : ["Ongoing reflection"],
    followUps: ["Review the proposed memories together before the next session."],
    safetyFlags: assessDeterministicRisk(joined).level === "none" ? [] : ["Review safety support needs"],
    memories,
  });
}

export class DeterministicQwenAdapter implements QwenPort {
  readonly chatModel = "deterministic-qwen-chat";
  readonly fastModel = "deterministic-qwen-safety";
  readonly embeddingModel = "deterministic-embedding-v1";
  readonly promptVersion = "threadline-v1";
  readonly mode = "deterministic" as const;

  async *streamReply(input: StreamReplyInput): AsyncIterable<string> {
    const remembered = input.memories[0];
    const response = remembered
      ? `I remember that ${remembered.statement.replace(/[.!?]+$/, "").toLowerCase()}. How does that fit with what you are noticing today?`
      : "Thank you for sharing that. What feels most important to understand about this experience right now?";
    for (const token of response.match(/\S+\s*/g) ?? [response]) {
      yield token;
    }
  }

  async classifyRisk(content: string) {
    return assessDeterministicRisk(content);
  }

  async extractSession(input: ExtractionInput): Promise<SessionExtraction> {
    return deterministicExtraction(input);
  }

  async embed(input: string): Promise<number[]> {
    return deterministicEmbedding(input);
  }
}
