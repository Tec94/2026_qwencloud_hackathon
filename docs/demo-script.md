# Five-minute Threadline demo script

This script is structured for a five-minute cross-session memory-loop target.
Time the final rehearsal against the deployed public build, because live Qwen
latency and operator actions determine the recorded duration. Keep the
Qwen-backed path live unless the event rules permit a clearly disclosed
fallback.

## Operator setup

Prepare the demo before recording so every visible record comes from the same
isolated synthetic workspace.

- Open the verified public landing page in a clean browser profile after the
  ECS deployment is complete.
- Confirm `/api/health` passes and the Qwen smoke check succeeded.
- Use the synthetic patient Maya and clinician Dr. Chen.
- Keep the breathing exercise example available as a natural patient detail.
- Keep the architecture slide ready in another tab.
- Do not preload approved memories; the recording must show their lifecycle.

## Continuous read-aloud script

Read this block continuously while completing the matching actions on screen.

Threadline solves a quiet but expensive problem with AI assistants: every new
conversation starts by asking the person to reconstruct their context. That is
especially exhausting across long-term care, where continuity matters, but a
full transcript archive creates its own privacy and trust problems. Threadline
shows a smaller, reviewable memory model. Everything in this demo is synthetic,
and this is not therapy, crisis care, or a compliance claim.

I am entering a fresh demo workspace as Maya, our synthetic patient. The
workspace is isolated from every other visitor and expires after twenty-four
hours. Maya can see what the system is permitted to remember and can reverse
that decision later. I will start a reflection session and mention that work has
felt overwhelming this week. I will also say that a slow four-count breathing
exercise helped before an important meeting, but that generic journaling advice
has not helped.

This response is coming from Qwen Cloud. Before normal generation, Threadline
runs a conservative risk check and builds a retrieval query. This first session
has no approved memory to retrieve, so Memory Trace says that clearly instead
of pretending to know Maya. Threadline streams the answer while keeping the
technical evidence separate from the conversation.

Now I will end the session. Qwen returns structured JSON containing a concise
summary, themes, follow-ups, safety flags, and durable memory candidates.
Threadline validates that structure before storing anything. The candidates are
proposals, not facts the assistant can immediately reuse. Successful
finalization saves the summary and proposals and deletes the raw session
messages in one SQLite transaction. The trace shows that deletion status
without exposing the transcript.

I am switching to Dr. Chen, the linked synthetic clinician. Her review queue
shows the new summary and each proposed memory with its category, confidence,
source session, and status. She can edit, reject, or approve each item.
I will approve the specific coping strategy and reject any detail that is too
temporary to carry forward. A contradiction would require an explicit reviewed
replacement; Threadline never silently rewrites an approved memory.

Back in Maya's view, I will start a second session and say that a difficult
meeting is coming up. Threadline embeds the current context, searches only
approved memories for Maya, and combines semantic similarity with importance,
recency, and extraction confidence. It selects no more than five memories and
limits repeated categories. Qwen can now refer carefully to the previously
approved four-count breathing exercise instead of offering the same generic
advice again.

Memory Trace makes that reuse inspectable. It shows how many candidates were
considered, which approved category was selected, the score components, context
budget, model and prompt versions, latency, and transcript retention status. It
does not expose the Qwen key, hidden instructions, or private prompt content.

Maya still owns the boundary. I can dispute this memory if it is inaccurate or
forget it entirely. Forgetting clears the statement and its embedding, leaving
only a content-free audit event. A later retrieval cannot select it. That gives
the person meaningful control rather than a hidden memory toggle.

Technically, Threadline is a modular Next.js application designed to deploy on
Alibaba Cloud ECS. Caddy terminates HTTPS, Qwen Cloud provides chat, risk
classification, structured extraction, and embeddings, and SQLite provides
real transactional state on persistent storage. Every protected resource route
checks the role, workspace, consent, and resource ownership on the server.
Deterministic automated tests replace Qwen, while a separate smoke test verifies
the live API.

The fixed synthetic regression clears its targets with 97.4 percent extraction
precision, 96.2 percent recall, and 100 percent retrieval hit at five. Those
numbers validate deterministic pipeline behavior, not live-Qwen or clinical
accuracy.

The result is not a bigger context window and not a transcript search tool. It
is a visible memory lifecycle: extract, review, approve, retrieve, explain, and
forget. Threadline reduces the burden of repeating useful context while keeping
human review and reversibility at the center.

## Recording checklist

Check the recording before submission so the video supports every spoken claim.

- Keep the final video at or below five minutes.
- Show the live public URL and Qwen-backed response.
- Show successful transcript deletion after finalization.
- Show clinician approval before cross-session reuse.
- Show Memory Trace and the patient forget action.
- Show the architecture once, without lingering on implementation details.
- Remove notifications, credentials, private tabs, and unrelated browser data.
- Add captions and verify that all on-screen text remains readable at 1080p.
