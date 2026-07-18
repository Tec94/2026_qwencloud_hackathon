import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  actOnMemory,
  createSession,
  enterDemo,
  finalizeSession,
  getMe,
  getRetrievalTrace,
  getSession,
  getSessionSummary,
  listPatientMemories,
  listSessions,
  logout,
  streamSessionMessage,
  ThreadlineApiError,
  updateMemory,
  type ChatMessage,
  type MemoryRecord,
  type RetrievalTrace,
  type TherapySession,
} from "./api-client"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function ndjsonResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  })
}

const session: TherapySession = {
  id: "session-1",
  patientId: "patient-1",
  status: "active",
  startedAt: "2026-07-18T12:00:00.000Z",
}

const memory: MemoryRecord = {
  id: "memory-1",
  patientId: "patient-1",
  category: "goal",
  statement: "Maya wants to protect a quiet morning routine.",
  importance: 0.8,
  confidence: 0.9,
  status: "proposed",
  createdAt: "2026-07-18T12:10:00.000Z",
}

describe("Threadline API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("preserves a structured API error and request metadata", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: "The message is too long.",
            fieldErrors: { content: ["Use 4,000 characters or fewer."] },
            requestId: "request-1",
          },
        },
        422,
      ),
    )

    const request = getMe()

    await expect(request).rejects.toMatchObject({
      name: "ThreadlineApiError",
      message: "The message is too long.",
      code: "VALIDATION_FAILED",
      status: 422,
      fieldErrors: { content: ["Use 4,000 characters or fewer."] },
      requestId: "request-1",
    })
  })

  it("uses a stable fallback for an empty infrastructure error body", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))

    const request = getMe()

    await expect(request).rejects.toEqual(
      expect.objectContaining({
        message: "Threadline could not complete that request.",
        code: "REQUEST_FAILED",
        status: 503,
      }),
    )
  })

  it("normalizes direct and nested demo identity envelopes", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            user: { id: "patient-1", role: "patient", displayName: "Maya" },
            workspace: {
              id: "workspace-1",
              expiresAt: "2026-07-19T12:00:00.000Z",
            },
            sessionExpiresAt: "2026-07-18T20:00:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          user: {
            id: "clinician-1",
            role: "clinician",
            displayName: "Dr. Chen",
          },
          workspaceId: "workspace-2",
          expiresAt: "2026-07-19T12:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          user: { id: "patient-2", role: "patient", displayName: "Maya" },
          workspace: {
            id: "workspace-3",
            expiresAt: "2026-07-20T12:00:00.000Z",
          },
        }),
      )

    await expect(enterDemo("patient")).resolves.toMatchObject({
      workspaceId: "workspace-1",
      expiresAt: "2026-07-18T20:00:00.000Z",
    })
    await expect(enterDemo("clinician", "workspace-2")).resolves.toMatchObject({
      workspaceId: "workspace-2",
      user: { role: "clinician" },
    })
    await expect(enterDemo("patient")).resolves.toMatchObject({
      workspaceId: "workspace-3",
      expiresAt: "2026-07-20T12:00:00.000Z",
    })

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/auth/demo",
      expect.objectContaining({
        credentials: "same-origin",
        body: JSON.stringify({ role: "clinician", workspaceId: "workspace-2" }),
      }),
    )
  })

  it("accepts wrapped and direct identity, session, and logout responses", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ data: { user: { id: "p-1", role: "patient", displayName: "Maya" } } }))
      .mockResolvedValueOnce(jsonResponse({ id: "p-2", role: "patient", displayName: "Maya" }))
      .mockResolvedValueOnce(jsonResponse({ data: { session } }))
      .mockResolvedValueOnce(jsonResponse({ ...session, id: "session-2" }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))

    await expect(getMe()).resolves.toMatchObject({ id: "p-1" })
    await expect(getMe()).resolves.toMatchObject({ id: "p-2" })
    await expect(createSession()).resolves.toEqual(session)
    await expect(createSession()).resolves.toMatchObject({ id: "session-2" })
    await expect(logout()).resolves.toEqual({ success: true })

    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/sessions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("normalizes all supported collection envelopes", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([session]))
      .mockResolvedValueOnce(jsonResponse({ sessions: [{ ...session, id: "session-2" }] }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ ...session, id: "session-3" }] }))
      .mockResolvedValueOnce(jsonResponse({ sessions: undefined }))
      .mockResolvedValueOnce(jsonResponse([memory]))
      .mockResolvedValueOnce(jsonResponse({ memories: [{ ...memory, id: "memory-2" }] }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ ...memory, id: "memory-3" }] }))

    await expect(listSessions()).resolves.toEqual([session])
    await expect(listSessions()).resolves.toEqual([
      expect.objectContaining({ id: "session-2" }),
    ])
    await expect(listSessions()).resolves.toEqual([
      expect.objectContaining({ id: "session-3" }),
    ])
    await expect(listSessions()).resolves.toEqual([])
    await expect(listPatientMemories("patient/1")).resolves.toEqual([memory])
    await expect(listPatientMemories("patient-1")).resolves.toEqual([
      expect.objectContaining({ id: "memory-2" }),
    ])
    await expect(listPatientMemories("patient-1")).resolves.toEqual([
      expect.objectContaining({ id: "memory-3" }),
    ])

    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/patients/patient%2F1/memories",
      expect.any(Object),
    )
  })

  it("normalizes wrapped and direct single-resource responses", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ session }))
      .mockResolvedValueOnce(jsonResponse({ ...session, id: "session-2" }))
      .mockResolvedValueOnce(jsonResponse({ memory }))
      .mockResolvedValueOnce(jsonResponse({ ...memory, id: "memory-2" }))
      .mockResolvedValueOnce(jsonResponse({ memory: { ...memory, status: "active" } }))
      .mockResolvedValueOnce(jsonResponse({ ...memory, status: "rejected" }))

    await expect(getSession("session/1")).resolves.toEqual(session)
    await expect(getSession("session-2")).resolves.toMatchObject({ id: "session-2" })
    await expect(updateMemory("memory/1", { importance: 0.7 })).resolves.toEqual(memory)
    await expect(updateMemory("memory-2", { statement: "Edited" })).resolves.toMatchObject({ id: "memory-2" })
    await expect(actOnMemory("memory-1", "approve")).resolves.toMatchObject({ status: "active" })
    await expect(actOnMemory("memory-2", "reject")).resolves.toMatchObject({ status: "rejected" })

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/sessions/session%2F1",
      expect.any(Object),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/memories/memory%2F1",
      expect.objectContaining({ method: "PATCH" }),
    )
  })

  it("normalizes finalization and summary transcript-deletion variants", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          summary: {
            sessionId: "session-1",
            narrative: "Maya reflected on a difficult week.",
            themes: ["routine"],
            followUps: [],
            safetyFlags: [],
            transcriptDeletedAt: "2026-07-18T12:30:00.000Z",
          },
          memories: [memory],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            summary: {
              sessionId: "session-2",
              narrative: "A second summary.",
              themes: [],
              followUps: [],
              safetyFlags: [],
              transcriptDeleted: false,
              transcriptDeletedAt: "2026-07-18T12:30:00.000Z",
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          session: { ...session, status: "finalized" },
          proposedMemories: [memory],
        }),
      )

    await expect(finalizeSession("session-1")).resolves.toMatchObject({
      summary: { transcriptDeleted: true },
      proposedMemories: [memory],
    })
    await expect(getSessionSummary("session-2")).resolves.toMatchObject({
      transcriptDeleted: false,
    })
    await expect(finalizeSession("session-3")).resolves.toMatchObject({
      session: { status: "finalized" },
      proposedMemories: [memory],
    })
  })

  it("normalizes raw, wrapped, direct, and empty retrieval traces", async () => {
    const rawTrace = {
      candidateCount: 3,
      selected: [
        {
          id: "memory-1",
          category: "goal" as const,
          statement: memory.statement,
          score: {
            semantic: 0.91,
            importance: 0.8,
            recency: 0.7,
            confidence: 0.9,
            total: 0.86,
          },
        },
      ],
      contextCharacters: 94,
      contextLimit: 3_200,
      model: "text-embedding-v4",
      promptVersion: "memory-v1",
      latencyMs: 32,
    }
    const normalizedTrace: RetrievalTrace = {
      candidateCount: 1,
      selectedMemories: [],
      contextBudget: 3_200,
    }

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ traces: [rawTrace] }))
      .mockResolvedValueOnce(jsonResponse({ traces: [] }))
      .mockResolvedValueOnce(jsonResponse({ trace: normalizedTrace }))
      .mockResolvedValueOnce(jsonResponse(normalizedTrace))

    await expect(getRetrievalTrace("session-1")).resolves.toEqual({
      candidateCount: 3,
      selectedMemories: [
        {
          id: "memory-1",
          category: "goal",
          statement: memory.statement,
          score: 0.86,
          similarity: 0.91,
          importance: 0.8,
          recency: 0.7,
          confidence: 0.9,
        },
      ],
      contextCharacters: 94,
      contextBudget: 3_200,
      model: "text-embedding-v4",
      promptVersion: "memory-v1",
      latencyMs: 32,
    })
    await expect(getRetrievalTrace("session-2")).resolves.toEqual({
      candidateCount: 0,
      selectedMemories: [],
    })
    await expect(getRetrievalTrace("session-3")).resolves.toEqual(normalizedTrace)
    await expect(getRetrievalTrace("session-4")).resolves.toEqual(normalizedTrace)
  })

  it("parses partial NDJSON chunks, event aliases, and a final unterminated line", async () => {
    const onToken = vi.fn()
    const onTrace = vi.fn()
    const onDone = vi.fn()
    const doneMessage: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "You protected a small pocket of calm.",
    }
    const rawTrace = {
      candidateCount: 1,
      selected: [
        {
          id: "memory-1",
          category: "goal",
          statement: memory.statement,
          score: {
            semantic: 0.9,
            importance: 0.8,
            recency: 0.7,
            confidence: 0.9,
            total: 0.85,
          },
        },
      ],
      contextCharacters: 80,
      contextLimit: 3200,
      model: "qwen3.7-plus",
      promptVersion: "v1",
    }
    const payload = [
      "\n",
      JSON.stringify({ event: "token", delta: "You " }) + "\n",
      JSON.stringify({ type: "token", content: "made " }) + "\n",
      JSON.stringify({ type: "token", token: "space." }) + "\n",
      JSON.stringify({ ignored: true }) + "\n",
      JSON.stringify({ type: "trace", data: rawTrace }) + "\n",
      JSON.stringify({ type: "done", data: doneMessage }),
    ].join("")

    vi.mocked(fetch).mockResolvedValue(
      ndjsonResponse([payload.slice(0, 19), payload.slice(19, 67), payload.slice(67)]),
    )

    await streamSessionMessage("session/1", "I took a quiet walk.", {
      onToken,
      onTrace,
      onDone,
    })

    expect(onToken.mock.calls.flat()).toEqual(["You ", "made ", "space."])
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateCount: 1,
        selectedMemories: [expect.objectContaining({ score: 0.85 })],
      }),
    )
    expect(onDone).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledWith(doneMessage)
    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions/session%2F1/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "I took a quiet walk." }),
      }),
    )
  })

  it("completes once when a valid stream omits the done event", async () => {
    const onToken = vi.fn()
    const onTrace = vi.fn()
    const onDone = vi.fn()
    vi.mocked(fetch).mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({ type: "token" }) + "\n",
        JSON.stringify({ type: "trace" }) + "\n",
        "null\n",
      ]),
    )

    await streamSessionMessage("session-1", "Hello", {
      onToken,
      onTrace,
      onDone,
    })

    expect(onToken).toHaveBeenCalledWith("")
    expect(onTrace).toHaveBeenCalledWith({
      candidateCount: 0,
      selectedMemories: [],
    })
    expect(onDone).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledWith()
  })

  it("rejects malformed NDJSON instead of silently inventing a response", async () => {
    vi.mocked(fetch).mockResolvedValue(ndjsonResponse(["{not-json}\n"]))

    await expect(
      streamSessionMessage("session-1", "Hello", {
        onToken: vi.fn(),
        onTrace: vi.fn(),
        onDone: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(SyntaxError)
  })

  it("reports an unavailable stream body with a typed error", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }))

    await expect(
      streamSessionMessage("session-1", "Hello", {
        onToken: vi.fn(),
        onTrace: vi.fn(),
        onDone: vi.fn(),
      }),
    ).rejects.toMatchObject({
      name: "ThreadlineApiError",
      code: "STREAM_UNAVAILABLE",
      message: "The response stream was unavailable.",
    })
  })

  it("delivers stream errors to the callback before rejecting", async () => {
    const onError = vi.fn()
    vi.mocked(fetch).mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({
          type: "error",
          error: {
            code: "QWEN_TIMEOUT",
            message: "Qwen took too long to respond.",
            requestId: "request-stream-1",
          },
        }) + "\n",
      ]),
    )

    const request = streamSessionMessage("session-1", "Hello", {
      onToken: vi.fn(),
      onTrace: vi.fn(),
      onDone: vi.fn(),
      onError,
    })

    await expect(request).rejects.toMatchObject({
      code: "QWEN_TIMEOUT",
      message: "Qwen took too long to respond.",
      requestId: "request-stream-1",
    })
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(ThreadlineApiError)
  })

  it("still rejects a minimal stream error when no error callback is supplied", async () => {
    vi.mocked(fetch).mockResolvedValue(
      ndjsonResponse([JSON.stringify({ type: "error" }) + "\n"]),
    )

    await expect(
      streamSessionMessage("session-1", "Hello", {
        onToken: vi.fn(),
        onTrace: vi.fn(),
        onDone: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: "REQUEST_FAILED",
      message: "The response stream stopped.",
    })
  })

  it("translates a non-streaming HTTP failure before reading NDJSON", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Try again in a few minutes.",
          },
        },
        429,
      ),
    )

    await expect(
      streamSessionMessage("session-1", "Hello", {
        onToken: vi.fn(),
        onTrace: vi.fn(),
        onDone: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      message: "Try again in a few minutes.",
    })
  })
})
