import type {
  ChatMessage,
  RetrievedMemory,
  RiskAssessment,
  SessionExtraction,
} from "../models";

export interface StreamReplyInput {
  messages: ChatMessage[];
  memories: RetrievedMemory[];
  signal?: AbortSignal;
}

export interface ExtractionInput {
  messages: ChatMessage[];
  knownMemories: Array<{ id: string; statement: string; category: string }>;
}

export interface QwenPort {
  readonly chatModel: string;
  readonly fastModel: string;
  readonly embeddingModel: string;
  readonly promptVersion: string;
  readonly mode: "live" | "deterministic";
  streamReply(input: StreamReplyInput): AsyncIterable<string>;
  classifyRisk(content: string): Promise<RiskAssessment>;
  extractSession(input: ExtractionInput): Promise<SessionExtraction>;
  embed(input: string): Promise<number[]>;
}
