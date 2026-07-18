import { readFileSync } from "node:fs";
import { createQwenAdapter } from "../src/infrastructure/qwen/factory";

try {
  const localEnv = readFileSync(".env", "utf8");
  for (const line of localEnv.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match?.[1] && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2]?.trim().replace(/^(['"])(.*)\1$/, "$2") ?? "";
    }
  }
} catch {
  // Environment variables may be supplied by the shell or deployment platform.
}

async function main() {
  const qwen = createQwenAdapter({ forceLive: true });
  const embeddingPromise = qwen.embed("A brief grounding exercise helped during a stressful day.");
  const extractionPromise = qwen.extractSession({
    messages: [
      { role: "patient", content: "Slow breathing helped me feel grounded after work." },
      { role: "assistant", content: "What did you notice as you slowed down?" },
    ],
    knownMemories: [],
  });
  let responseCharacters = 0;
  for await (const token of qwen.streamReply({
    messages: [{ role: "patient", content: "I had a difficult day and want to reflect." }],
    memories: [],
  })) {
    responseCharacters += token.length;
  }
  const [embedding, extraction] = await Promise.all([embeddingPromise, extractionPromise]);
  if (embedding.length !== 1_024 || responseCharacters === 0 || extraction.narrative.length === 0) {
    throw new Error("Qwen smoke validation failed.");
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      chatModel: qwen.chatModel,
      embeddingModel: qwen.embeddingModel,
      embeddingDimensions: embedding.length,
      structuredOutput: true,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`${JSON.stringify({ ok: false, error: name })}\n`);
  process.exitCode = 1;
});
