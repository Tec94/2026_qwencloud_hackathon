# Threadline

Threadline is a Qwen-powered continuity demo that turns a synthetic reflection
session into reviewable long-term memories. It shows how an assistant can reuse
approved context across sessions without retaining a full transcript.

> **Warning:** Threadline is a hackathon demonstration. Use synthetic data only.
> It is not therapy, crisis care, a medical device, or a HIPAA-compliant system.

## Project status

Threadline is a locally verified release candidate. The complete two-session
memory loop, Qwen provider checkpoint, deterministic evaluation, browser flows,
and production standalone smoke test pass. The Alibaba ACR/ECS rollout and
public submission assets still require deployment credentials and a domain.

- Public demo: `PUBLIC_DEMO_URL_TODO`
- Hosting target: Alibaba Cloud ECS and Alibaba Cloud Container Registry
- AI provider: Qwen Cloud through the international OpenAI-compatible endpoint

## What the demo proves

The primary demo follows one complete continuity loop instead of presenting an
isolated chatbot conversation.

1. Enter a new, isolated demo workspace as the synthetic patient.
2. Complete a Qwen-powered reflection session.
3. Finalize the session to extract a summary and proposed memories.
4. Enter the linked clinician view and review each proposed memory.
5. Approve a useful memory, such as a preferred breathing exercise.
6. Start another patient session and inspect how Memory Trace retrieves it.
7. Dispute or forget the memory and verify that later retrieval excludes it.

## Architecture at a glance

Threadline runs as a single Next.js application with explicit domain,
application, and infrastructure boundaries. SQLite keeps the hackathon
deployment operationally small while preserving real transactions and durable
memory state.

```text
Browser
  | secure role-bound cookie
  v
Caddy HTTPS reverse proxy
  |
  v
Next.js App Router
  |-- authentication and workspace authorization
  |-- reflection and memory application services
  |-- Qwen adapter: chat, safety, extraction, and embeddings
  `-- SQLite adapter: sessions, memories, audit events, and rate limits
          |
          `-- /data/threadline.db on persistent ECS storage
```

Read [the architecture guide](docs/architecture.md) for the trust boundaries,
memory lifecycle, retrieval formula, and API contracts.

## Requirements

Install these tools before you run Threadline locally.

- Node.js 22.14.0, pinned in `.nvmrc` and the container image
- Corepack with pnpm 10.13.1
- A Qwen Cloud API key
- Docker with the Compose plugin for container verification

## Local setup

Use the checked-in lockfile and keep all secrets in your untracked `.env` file.

1. Enable the package manager declared in `package.json`.

   ```bash
   corepack enable
   corepack prepare pnpm@10.13.1 --activate
   ```

2. Install exactly the locked dependencies.

   ```bash
   pnpm install --frozen-lockfile
   ```

3. Copy `.env.example` to `.env`, then set `QWEN_API_KEY` and replace both
   example secrets with independent random values of at least 32 characters.
   For loopback development only, set `ALLOW_INSECURE_LOCAL=true`; leave it
   `false` everywhere public.

4. Start the development server.

   ```bash
   pnpm dev
   ```

5. Open `http://localhost:3000` and use the patient or clinician demo entry.

The application creates its local SQLite database under `data/`. That directory
and every `.env` file except `.env.example` are ignored by Git.

## Environment variables

Threadline reads secrets only on the server. Never prefix the Qwen key or
session secret with `NEXT_PUBLIC_`.

- `QWEN_API_KEY` authenticates server-side Qwen requests.
- `QWEN_BASE_URL` defaults to the Qwen Cloud international compatible endpoint.
- `QWEN_CHAT_MODEL` selects the conversational and extraction model.
- `QWEN_FAST_MODEL` selects the lower-latency safety classifier.
- `QWEN_EMBEDDING_MODEL` selects the retrieval embedding model.
- `DATABASE_URL` points to the SQLite file. Local development uses
  `file:./data/threadline.db`; the container overrides it to
  `file:/data/threadline.db`.
- `SESSION_SECRET` protects application session material and must contain at
  least 32 random characters.
- `APP_URL` contains the canonical application origin.
- `CLEANUP_SECRET` protects maintenance operations and must differ from
  `SESSION_SECRET`.
- `ALLOW_INSECURE_LOCAL` is a default-off escape hatch that permits only an
  `http://localhost` or `http://127.0.0.1` `APP_URL` for local container smoke
  tests. Production readiness rejects public HTTP origins regardless of it.

## Verification

Run the complete local quality gate before publishing an image.

```bash
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

CI uses deterministic Qwen substitutes. Run `pnpm test:qwen` only when you
intend to spend API quota and have configured a real key. The smoke test must
not print prompts, responses, memory statements, or the key.

On July 18, 2026, a local opt-in checkpoint verified `qwen3.7-plus` chat,
structured JSON mode, and a 1,024-dimension `text-embedding-v4` response against
the event endpoint. This checkpoint verifies connectivity and API shape; it is
not part of CI and is not an extraction-accuracy result.

The fixed synthetic deterministic benchmark currently records 97.4% extraction
precision, 96.2% extraction recall, and 100% retrieval hit@5. These are
regression results designed for automated checks, not claims about live-Qwen
accuracy or clinical quality.
See [the evaluation report](docs/evaluation.md) and
[raw benchmark artifact](docs/evidence/synthetic-evaluation-v1.json).

The July 18 local release pass also recorded:

- 29 passing Vitest files and 212 passing tests.
- 93.48% statement, 86.26% branch, 86.55% function, and 95.48% line coverage.
- 14 passing Playwright cases and 10 intentional project-specific skips, with
  no failures.
- 19 in-gamut OKLCH tokens and nine passing contrast pairs.
- A React Doctor score of 87/100 with zero errors and zero critical findings.

Exact commands, output summaries, and evidence boundaries are in
[the verification record](docs/evidence/verification.md).

## Container deployment

The production image uses Next.js standalone output and runs as an unprivileged
user. Caddy terminates HTTPS and forwards streaming responses without buffering.

```bash
docker compose build app
docker compose up -d
docker compose ps
docker compose --profile maintenance run --rm cleanup
```

For local HTTP, the default Caddy address is `http://localhost`. For Alibaba
Cloud, set `THREADLINE_SITE_ADDRESS`, `THREADLINE_ENV_FILE`, and
`THREADLINE_DATA_DIR` as described in
[the deployment guide](docs/deployment.md).

## Documentation

These documents support implementation review and the hackathon submission.

- [Architecture and data lifecycle](docs/architecture.md)
- [Evaluation method and measured results](docs/evaluation.md)
- [Alibaba Cloud deployment](docs/deployment.md)
- [Five-minute target demo script](docs/demo-script.md)
- [Pitch deck outline](docs/pitch-outline.md)
- [Skill integration evidence checklist](docs/skill-integration.md)

## Safety and privacy boundaries

Threadline minimizes retained content, but it does not make a healthcare
compliance claim.

- Use only the synthetic personas and synthetic scenario content.
- Treat extracted memories as proposals until clinician review.
- Keep raw session messages only until successful transactional finalization.
- Remove forgotten memory content and its embedding while preserving a
  content-free audit event.
- Keep prompts, messages, API keys, and memory statements out of logs.
- Route high-risk input to deterministic support guidance instead of generated
  therapeutic advice.

## Next steps

Before submission, publish the digest-addressed image to ACR, deploy it to ECS,
replace `PUBLIC_DEMO_URL_TODO`, record and caption the five-minute video, export
the pitch deck, and verify the public health endpoint from a fresh browser.
