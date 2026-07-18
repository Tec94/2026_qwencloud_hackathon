import { runSyntheticEvaluation } from "../src/evaluation/evaluate";

const result = runSyntheticEvaluation();
const jsonOnly = process.argv.includes("--json");
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

if (jsonOnly) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else {
  process.stdout.write(
    [
      "Threadline synthetic deterministic evaluation",
      "This is a regression benchmark for deterministic CI behavior, not live Qwen accuracy.",
      `Extraction precision: ${percent(result.metrics.extraction.precision)} (target ${percent(result.thresholds.extractionPrecision)})`,
      `Extraction recall:    ${percent(result.metrics.extraction.recall)} (target ${percent(result.thresholds.extractionRecall)})`,
      `Retrieval hit@5:       ${percent(result.metrics.retrieval.hitAt5)} (target ${percent(result.thresholds.retrievalHitAt5)})`,
      `Result: ${result.passed ? "PASS" : "FAIL"}`,
      "",
    ].join("\n"),
  );
}

if (!result.passed) process.exitCode = 1;

