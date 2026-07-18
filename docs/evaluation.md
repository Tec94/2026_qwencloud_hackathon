# Threadline evaluation method and results

This document defines how to measure extraction quality, cross-session
retrieval, retention guarantees, authorization, and interface quality. It is a
method plus a July 18, 2026 local evidence snapshot. Deterministic benchmark
results and live-provider compatibility are reported separately.

## Reporting rule

Do not present a target as a measured result. Every recorded value below names
its fixture set, command, date, and evidence artifact. The repository is still
an uncommitted working-tree snapshot, so replace that label with the submitted
commit SHA before publication.

## Evaluation dataset

The versioned `threadline-synthetic-v1` corpus uses synthetic scenarios only.
It contains:

- 20 finalizable sessions across five synthetic patient profiles.
- Independently annotated durable facts covering goal, preference,
  coping strategy, trigger, symptom, context, and follow-up.
- Negation, correction, and prompt-like transcript text.
- Ten expected-memory retrieval queries plus inactive and forgotten decoys.
- Fixed fixtures used consistently by the deterministic regression command.

The deterministic artifact does not yet include human adjudication, explicit
uncertainty labels, or no-relevant-memory queries. Add those cases before using
this protocol to characterize live-Qwen behavior; they do not change the scope
of the fixed CI regression score reported below.

Store fixture text and annotations in version control, but never derive them
from real patient information.

## Extraction quality

Two reviewers compare proposed memories with the annotated durable facts.

- A true positive is a proposed memory that matches one annotated fact without
  changing its meaning or certainty.
- A false positive is unsupported, materially distorted, overly sensitive, or
  too transient to store.
- A false negative is an annotated fact that extraction omitted.
- Precision equals true positives divided by all proposed memories.
- Recall equals true positives divided by all annotated memories.

Resolve reviewer disagreement before calculating the final score. Record both
the original model output and the adjudicated label in a non-production test
artifact.

## Retrieval quality

Evaluate the deterministic selector separately from response generation.

- Run each annotated follow-up query against the approved fixture memories.
- Record the ordered top-five identifiers and score components.
- Count a hit when at least one expected identifier appears in the top five.
- Report hit@5 as queries with a hit divided by all queries with an expected
  memory.
- Report false retrievals separately for the queries marked as having no
  relevant memory.
- Confirm the five-memory, two-per-category, and 3,200-character limits.

The acceptance target is at least 90% hit@5 without selecting forgotten,
unapproved, disputed, cross-patient, or cross-workspace content.

## Retention and authorization

Use integration and browser tests to verify the non-negotiable data boundaries.

1. Finalize a session successfully and query SQLite for all message rows tied
   to that session.
2. Confirm the summary and proposed memories exist while the message row count
   is zero.
3. Force extraction and embedding failures and confirm messages remain available
   for retry.
4. Run cleanup against an expired session and confirm its messages are removed.
5. Forget an active memory and confirm its statement and embedding are cleared.
6. Attempt every protected route as a patient, clinician, wrong workspace,
   expired session, and unauthenticated user.
7. Confirm unauthorized requests return a stable error and reveal no protected
   record fields.

The acceptance target is 100% transcript deletion after reported success and
zero unauthorized cross-role or cross-workspace access.

## Safety and prompt-boundary checks

Use deterministic fixtures for safety routing and model-context isolation.

- Confirm high-risk fixtures never reach normal reflection generation.
- Confirm deterministic support guidance remains visible when Qwen is
  unavailable.
- Put instruction-like text inside a memory and confirm it remains delimited as
  data.
- Add uncertain and contradictory memories and confirm the prompt requests
  clarification rather than treating them as fact.
- Confirm logs and browser traces contain no API keys, raw prompts, or memory
  statements outside the synthetic test artifact.

This evaluation verifies routing behavior only. It does not validate clinical
effectiveness or establish suitability for real healthcare use.

## Accessibility and interface checks

Combine automated checks with keyboard and visual review across the two primary
viewport sizes.

- Run axe checks on the landing, patient dashboard, session, clinician queue,
  review, dialog, sheet, empty, error, and high-risk states.
- Complete every action by keyboard and verify visible focus and restoration.
- Verify all touch targets are at least 44 by 44 CSS pixels.
- Check normal text, large text, controls, focus rings, and status colors for
  WCAG AA contrast.
- Verify streaming status uses a live region without announcing every token.
- Verify no meaning depends on color alone.
- Test at 390 by 844 and 1,440 by 1,024 pixels.
- Enable reduced motion and confirm state changes remain understandable.

Resolve all critical accessibility and React Doctor findings before reporting a
release candidate.

## Reliability checks

Exercise provider and persistence failures through deterministic substitutes.

- Return HTTP 429, timeout, connection failure, 5xx, malformed JSON, and invalid
  embedding dimensions from the Qwen substitute.
- Verify retry occurs only for network failures, 429 responses, and 5xx
  responses.
- Verify retries are capped and expose one safe terminal error.
- Interrupt finalization between each database mutation and confirm the
  transaction rolls back.
- Restart the container and confirm SQLite data survives on the mounted path.

## Commands

Run the automated checks from a clean, locked install.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm check:colors
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm evaluate
pnpm exec playwright test
pnpm build
pnpm dlx react-doctor@latest --verbose --scope changed
```

Run `pnpm test:qwen` separately with a real API key. Record it as a smoke test,
not as part of deterministic extraction or retrieval scoring.

## Live provider checkpoint

A local opt-in smoke checkpoint ran on July 18, 2026, against the Qwen Cloud
event endpoint. It verified these API-shape checks without adding the live call
to CI.

- `qwen3.7-plus` returned a chat completion.
- `qwen3.7-plus` returned valid structured JSON mode output.
- `text-embedding-v4` returned exactly 1,024 dimensions when requested.

This result verifies credentials, endpoint compatibility, and expected vector
shape. It does not measure extraction precision, recall, retrieval hit rate,
safety quality, or clinical effectiveness.

## Recorded local results

The extraction and retrieval scores below come from
`pnpm evaluate`, which uses the deterministic Qwen adapter. They prove that the
scored pipeline and fixed automated fixtures clear the acceptance thresholds;
they do not estimate live-Qwen or clinical accuracy.

| Measure | Target | Result | Evidence |
| --- | ---: | ---: | --- |
| Extraction precision | 85% or higher | 97.4%: 75 TP, 2 FP | [`synthetic-evaluation-v1.json`](evidence/synthetic-evaluation-v1.json) |
| Extraction recall | 80% or higher | 96.2%: 75 TP, 3 FN | [`synthetic-evaluation-v1.json`](evidence/synthetic-evaluation-v1.json) |
| Retrieval hit@5 | 90% or higher | 100%: 10/10 | [`synthetic-evaluation-v1.json`](evidence/synthetic-evaluation-v1.json) |
| Successful transcript deletion | 100% | 100% of covered successful-finalization cases | Repository transaction and browser loop tests |
| Unauthorized cross-boundary reads | 0 | 0 observed in the automated role/workspace matrix | Repository and Playwright authorization tests |
| Critical accessibility findings | 0 | 0 automated WCAG A/AA violations in covered pages | Playwright axe and interaction tests |
| Critical React Doctor findings | 0 | 0 critical findings and 0 errors | 87/100 local full-project report |

Record the evaluation metadata alongside the results.

- Commit: `uncommitted working-tree snapshot`
- Date: `2026-07-18`
- Evaluator: `Codex local automated release pass`
- Fixture revision: `threadline-synthetic-v1`
- Qwen model and prompt versions: `qwen3.7-plus`, `qwen3.6-flash`,
  `text-embedding-v4`, and `threadline-v1`
- Live provider checkpoint: `Passed locally on July 18, 2026`
- Automated artifact location:
  [`docs/evidence/synthetic-evaluation-v1.json`](evidence/synthetic-evaluation-v1.json)
- Complete command record: [`docs/evidence/verification.md`](evidence/verification.md)

## Release decision

The code is a local release candidate: all local quality gates, the full
two-session browser loop, live-provider API-shape checkpoint, and standalone
health smoke pass. Submission readiness remains pending until the image is
published to Alibaba ACR, the ECS public health endpoint passes, and the
five-minute recording succeeds from a fresh public workspace.
