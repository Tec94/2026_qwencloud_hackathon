# Threadline pitch deck outline

This outline supports a concise hackathon deck aligned with innovation,
technical depth, impact, and presentation. Use screenshots from the deployed
synthetic demo and measured evaluation results only.

## Slide 1: Threadline

Open with the outcome, not the technology stack.

- Headline: “Continuity without keeping the whole conversation.”
- Subhead: “Qwen-powered, human-reviewed memory for long-term care workflows.”
- Visual: the approved memory thread moving from one session to the next.
- Footer: public URL, repository, and team name.

## Slide 2: The context burden

Show why repeating context is a user cost, not merely a model limitation.

- Long-term conversations repeatedly restart from incomplete context.
- Patients expend effort reconstructing what mattered before.
- Clinicians receive summaries without an inspectable, reversible memory path.
- Larger context windows increase cost and exposure without adding consent or
  review.

Use one synthetic journey with a missed coping preference rather than a generic
market-size graphic.

## Slide 3: The memory lifecycle

Present the product as a controlled lifecycle rather than a chatbot feature.

- Extract durable candidates after a session.
- Validate structure and delete the raw transcript transactionally.
- Route candidates through clinician review.
- Retrieve only active, approved, consent-eligible memories.
- Explain reuse through Memory Trace.
- Let the patient dispute or forget.

Use a six-stage horizontal diagram with one clear state change at a time.

## Slide 4: The two-session proof

Use paired screenshots from the deployed demo.

- Session one: Maya says that four-count breathing helped before a meeting.
- Clinician review: Dr. Chen approves the specific coping strategy.
- Session two: the approved memory is retrieved for a related concern.
- Patient control: Maya can dispute or forget it.

Label every screenshot as synthetic and avoid showing long paragraphs.

## Slide 5: Why Qwen matters

Connect each model operation to a product need.

- `qwen3.7-plus` provides reflection responses and structured finalization.
- `qwen3.6-flash` provides lower-latency conservative risk classification.
- `text-embedding-v4` provides semantic retrieval vectors.
- OpenAI-compatible APIs keep one server-side adapter and one error policy.
- Structured JSON plus Zod validation prevents unchecked model output from
  becoming durable state.

Show model operations around the lifecycle rather than a logo collection.

## Slide 6: Technical depth and trust

Show the controls that make memory behavior inspectable.

- Server-side role, workspace, relationship, consent, and ownership checks.
- Retrieval scoring with visible components and strict context limits.
- Prompt boundaries that treat memory text as untrusted data.
- Transactional finalization and content-free forgetting tombstones.
- Persistent SQLite on ECS, immutable ACR images, HTTPS through Caddy.
- Deterministic Qwen substitutes in CI and a separate live smoke check.

Use the compact architecture diagram from `docs/architecture.md`.

## Slide 7: Evidence

Label the extraction and retrieval numbers as deterministic regression results,
not live-model or clinical accuracy.

- Extraction precision: 97.4% across 20 fixed synthetic sessions; target 85%.
- Extraction recall: 96.2% across the same corpus; target 80%.
- Retrieval hit@5: 100% across ten expected-memory queries; target 90%.
- Successful transcript deletion: 100% across covered successful-finalization
  cases; target 100%.
- Unauthorized cross-boundary reads: zero observed across the automated role
  and workspace matrix; target zero.

Show `threadline-synthetic-v1`, the July 18, 2026 evaluation date, and the raw
artifact path beside the results. Replace the working-tree snapshot label with
the submitted commit SHA after the first commit.

## Slide 8: Impact and next step

Close with the narrow value proposition and a responsible path forward.

- Reduce the need to repeat useful context.
- Reduce generic, repeated advice across sessions.
- Give clinicians a compact review surface instead of another transcript.
- Give patients visible, reversible control over retained memory.
- Next step: a supervised synthetic usability study, followed by privacy and
  clinical review before any real-data pilot.

End on the product sentence: “Remember less data, but remember the right thing
with permission.”

## Submission checklist

Verify the complete submission package before the deadline.

- Replace the public URL placeholder and working-tree snapshot label with
  submitted values.
- Link the public Alibaba ECS demo and repository.
- Keep the video at or below five minutes and add captions.
- Export the deck to a stable format and test every link.
- State the synthetic-data and non-clinical boundary in the demo and deck.
- Confirm the repository setup works from a clean clone.
