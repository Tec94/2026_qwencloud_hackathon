# Threadline local verification record

This record captures the July 18, 2026 local release pass for the uncommitted
working-tree snapshot. It distinguishes deterministic regression evidence,
live-provider compatibility, local production smoke checks, and work that still
requires external deployment access.

## Environment

- Verified host: Windows, Node.js 22.10.0, pnpm 10.13.1.
- Pinned release and CI runtime: Node.js 22.14.0. The newer pin matches the
  successful React Doctor runtime; application gates passed on the earlier
  compatible Node 22 host before this configuration-only alignment.
- Source revision: uncommitted working-tree snapshot.
- Dataset: `threadline-synthetic-v1`, synthetic data only.
- Provider prompt version: `threadline-v1`.
- Public Alibaba URL: pending.

No command output in this record contains an API key, prompt, response, raw
session message, or memory statement.

## Automated gates

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile was current and the install was already up to date. |
| `pnpm ignored-builds` | Passed; no dependency build scripts were silently ignored. |
| `pnpm lint` | Passed with no ESLint errors. |
| `pnpm typecheck` | Passed with no TypeScript errors. |
| `pnpm test` | Passed: 29 files and 212 tests. |
| `pnpm test:coverage` | Passed: 29 files and 212 tests using V8 and the threads pool. |
| `pnpm check:colors` | Passed: 19 in-gamut OKLCH tokens and nine contrast pairs. |
| `pnpm evaluate` | Passed the fixed deterministic thresholds. |
| `pnpm exec playwright test` | Passed: 14 applicable cases, ten intentional project-specific skips, and zero failures. |
| `pnpm build` | Passed with Next.js 16.2.10 standalone output and all expected routes. |
| `docker compose config --quiet` | Passed static Compose validation; the local Docker daemon was unavailable for image execution. |

V8 coverage was:

- Statements: 93.48%, or 1,019 of 1,090.
- Branches: 86.26%, or 710 of 823.
- Functions: 86.55%, or 251 of 290.
- Lines: 95.48%, or 951 of 996.

The Playwright skips are deliberate viewport partitioning, not failed tests.
Stateful memory-loop, authorization, failure, keyboard, and full role-surface
axe checks run once on desktop. The mobile project runs landing and
reduced-motion checks plus the mobile Memory Trace sheet and overflow check.

## Deterministic quality benchmark

`pnpm evaluate` produced
[`synthetic-evaluation-v1.json`](synthetic-evaluation-v1.json):

- Extraction precision: 97.4%, from 75 true positives and two false positives.
- Extraction recall: 96.2%, from 75 true positives and three false negatives.
- Retrieval hit@5: 100%, with ten hits across ten positive queries.

These numbers measure `DeterministicQwenAdapter` against fixed synthetic
annotations. They are regression evidence for the pipeline, not live-Qwen
accuracy, a clinical evaluation, or evidence of therapeutic effectiveness.

## Privacy, authorization, and accessibility

The passing automated suites cover:

- Transactional summary and proposed-memory storage with raw-message deletion.
- Failed-finalization transcript retention for retry and expired-session
  cleanup.
- Permanent statement, embedding, and retrieval-trace scrubbing with a
  content-free forgetting tombstone.
- Patient, clinician, unauthenticated, wrong-role, wrong-workspace, expired,
  revoked-consent, and untrusted-origin authorization paths.
- Deterministic high-risk routing before provider calls.
- Prompt-like transcript and memory text treated as delimited untrusted data.
- Keyboard entry, visible focus, 44-pixel targets, reduced motion, mobile
  overflow, and automated WCAG A/AA axe scans for covered pages.

No unauthorized cross-boundary read and no automated critical accessibility
finding was observed in the executed suites. These are test-scope results, not
a substitute for production monitoring or a manual WCAG conformance audit.

## React Doctor

The last successful changed-code and full-project diagnostic used a compatible
Node 22.14 runtime and explicit Windows native bindings:

```text
npx --yes --package node@22.14.0 --package react-doctor@0.8.0 --package @oxc-parser/binding-win32-x64-msvc@0.138.0 --package @oxlint/binding-win32-x64-msvc@1.66.0 react-doctor --verbose --scope changed
```

The report scored 87/100 with zero errors, zero critical findings, and six
non-critical warnings: one large patient-session component, related state,
deep JSX, and standard shadcn non-component exports. No client React code
changed after that successful diagnostic. A final repeat was unavailable when
the external execution environment reached its usage limit; lint, typecheck,
Vitest, Playwright, and the production build all passed afterward.

## Live Qwen checkpoint

The opt-in `pnpm test:qwen` checkpoint passed against the configured Qwen Cloud
international OpenAI-compatible endpoint:

- `qwen3.7-plus` chat completion.
- `qwen3.7-plus` non-thinking structured JSON output.
- `text-embedding-v4` with exactly 1,024 requested dimensions.

Only model names, pass status, and embedding dimensions were emitted. The
checkpoint verifies credentials and API shape, not the deterministic quality
scores above.

## Production artifact smoke

The Next.js standalone artifact was started with strict production validation,
synthetic smoke credentials, an absolute persistent SQLite URL, and an explicit
loopback-only HTTP override. Checks returned:

- `/api/health`: HTTP 200 with database, configuration, and Qwen-mode checks
  all true.
- `/`: HTTP 200 and Threadline content present.
- The emitted CSS asset: HTTP 200.

This exercises the runtime artifact without a Docker daemon. It does not prove
the Debian image, ACR publish, Caddy TLS, ECS persistence, backup, cron, or
public-network configuration.

## Repository and secret hygiene

- `.env` is ignored by Git and Docker, remains untracked, and is the only local
  file containing the configured Qwen key.
- An exact-value scan found zero copies of that key outside `.env`.
- `.env.example` contains names and safe placeholders only.
- Databases, WAL files, logs, traces, browser reports, coverage, and generated
  Next.js output are ignored.
- The repository has no release commit yet; all implementation files are an
  uncommitted working-tree snapshot.

## External release work still pending

- Create a release commit and rerun the gates against that SHA in GitHub
  Actions.
- Build and publish the image to Alibaba ACR, then record its digest.
- Roll out to ECS, verify Caddy HTTPS, persistence, backup, cleanup cron, and
  the public `/api/health` response.
- Replace `PUBLIC_DEMO_URL_TODO` only after public verification.
- Record and caption the five-minute video and export the presentation deck.
