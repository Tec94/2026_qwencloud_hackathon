export type UserRole = "patient" | "clinician"

export type SessionStatus =
  | "active"
  | "finalizing"
  | "finalized"
  | "failed"

export type MemoryStatus =
  | "proposed"
  | "active"
  | "superseded"
  | "disputed"
  | "forgotten"
  | "rejected"

export type MemoryCategory =
  | "goal"
  | "preference"
  | "coping_strategy"
  | "trigger"
  | "symptom"
  | "context"
  | "follow_up"

export interface ThreadlineUser {
  id: string
  role: UserRole
  displayName: string
  workspaceId?: string
}

export interface ChatMessage {
  id: string
  role: "patient" | "assistant" | "system"
  content: string
  createdAt?: string
}

export interface TherapySession {
  id: string
  patientId: string
  clinicianId?: string | null
  status: SessionStatus
  startedAt: string
  endedAt?: string | null
  transcriptDeletedAt?: string | null
  safetyFollowUp?: boolean
  safetyReasonCodes?: string[]
  messageCount?: number
  patient?: Pick<ThreadlineUser, "id" | "displayName">
  messages?: ChatMessage[]
}

export interface MemoryRecord {
  id: string
  patientId: string
  sourceSessionId?: string | null
  category: MemoryCategory
  statement: string
  importance: number
  confidence: number
  status: MemoryStatus
  createdAt: string
  updatedAt?: string
  supersedesId?: string | null
}

export interface SessionSummary {
  id?: string
  sessionId: string
  narrative: string
  themes: string[]
  followUps: string[]
  safetyFlags: string[]
  reviewStatus?: "pending_review" | "approved" | "rejected"
  transcriptDeleted?: boolean
  transcriptDeletedAt?: string | null
  memories?: MemoryRecord[]
}

export interface RetrievalMemory {
  id: string
  statement: string
  category: MemoryCategory
  score: number
  similarity?: number
  importance?: number
  recency?: number
  confidence?: number
}

export interface RetrievalTrace {
  candidateCount: number
  selectedMemories: RetrievalMemory[]
  contextCharacters?: number
  contextBudget?: number
  model?: string
  promptVersion?: string
  latencyMs?: number
}

export interface FinalizeResult {
  session?: TherapySession
  summary?: SessionSummary
  proposedMemories?: MemoryRecord[]
}

export interface DemoAuthResult {
  user: ThreadlineUser
  workspaceId: string
  expiresAt: string
}

interface ApiErrorEnvelope {
  error?: {
    code?: string
    message?: string
    fieldErrors?: Record<string, string[] | string>
    requestId?: string
  }
}

interface ApiDataEnvelope<T> {
  data: T
}

export class ThreadlineApiError extends Error {
  readonly code: string
  readonly status: number
  readonly fieldErrors?: Record<string, string[] | string>
  readonly requestId?: string

  constructor(
    message: string,
    options: {
      code?: string
      status?: number
      fieldErrors?: Record<string, string[] | string>
      requestId?: string
    } = {},
  ) {
    super(message)
    this.name = "ThreadlineApiError"
    this.code = options.code ?? "REQUEST_FAILED"
    this.status = options.status ?? 500
    this.fieldErrors = options.fieldErrors
    this.requestId = options.requestId
  }
}

function isEnvelope<T>(value: unknown): value is ApiDataEnvelope<T> {
  return Boolean(value && typeof value === "object" && "data" in value)
}

async function parseApiError(response: Response) {
  let payload: ApiErrorEnvelope | null = null

  try {
    payload = (await response.json()) as ApiErrorEnvelope
  } catch {
    // The response body may be empty for infrastructure failures.
  }

  return new ThreadlineApiError(
    payload?.error?.message ?? "Threadline could not complete that request.",
    {
      code: payload?.error?.code,
      status: response.status,
      fieldErrors: payload?.error?.fieldErrors,
      requestId: payload?.error?.requestId,
    },
  )
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  })

  if (!response.ok) {
    throw await parseApiError(response)
  }

  const payload = (await response.json()) as ApiDataEnvelope<T> | T
  return isEnvelope<T>(payload) ? payload.data : payload
}

function listFrom<T>(value: T[] | { items?: T[] } | undefined, key: string): T[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== "object") return []

  const record = value as Record<string, unknown>
  const candidate = record[key] ?? record.items
  return Array.isArray(candidate) ? (candidate as T[]) : []
}

export async function enterDemo(
  role: UserRole,
  workspaceId?: string,
): Promise<DemoAuthResult> {
  const result = await apiRequest<
    DemoAuthResult | {
      user: ThreadlineUser
      workspace: { id: string; expiresAt: string }
      sessionExpiresAt: string
    }
  >("/api/auth/demo", {
    method: "POST",
    body: JSON.stringify({ role, workspaceId }),
  })

  if ("workspace" in result) {
    return {
      user: result.user,
      workspaceId: result.workspace.id,
      expiresAt: result.sessionExpiresAt ?? result.workspace.expiresAt,
    }
  }

  return result
}

export function getMe() {
  return apiRequest<{ user: ThreadlineUser } | ThreadlineUser>("/api/me").then(
    (value) => ("user" in value ? value.user : value),
  )
}

export function logout() {
  return apiRequest<{ success?: boolean }>("/api/auth/logout", {
    method: "POST",
  })
}

export function createSession() {
  return apiRequest<{ session: TherapySession } | TherapySession>(
    "/api/sessions",
    { method: "POST", body: JSON.stringify({}) },
  ).then((value) => ("session" in value ? value.session : value))
}

export function listSessions() {
  return apiRequest<
    TherapySession[] | { sessions?: TherapySession[]; items?: TherapySession[] }
  >("/api/sessions").then((value) => listFrom(value, "sessions"))
}

export function getSession(sessionId: string) {
  return apiRequest<{ session: TherapySession } | TherapySession>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
  ).then((value) => ("session" in value ? value.session : value))
}

export function finalizeSession(sessionId: string) {
  return apiRequest<
    FinalizeResult | { summary: SessionSummary; memories: MemoryRecord[] }
  >(
    `/api/sessions/${encodeURIComponent(sessionId)}/finalize`,
    { method: "POST", body: JSON.stringify({}) },
  ).then((value) =>
    "memories" in value
      ? { summary: normalizeSummary(value.summary), proposedMemories: value.memories }
      : value,
  )
}

export function getSessionSummary(sessionId: string) {
  return apiRequest<{ summary: SessionSummary } | SessionSummary>(
    `/api/sessions/${encodeURIComponent(sessionId)}/summary`,
  ).then((value) => normalizeSummary("summary" in value ? value.summary : value))
}

export function getRetrievalTrace(sessionId: string) {
  return apiRequest<
    | { trace: RetrievalTrace }
    | { traces: Array<RetrievalTrace | RawRetrievalTrace> }
    | RetrievalTrace
  >(
    `/api/sessions/${encodeURIComponent(sessionId)}/retrieval-trace`,
  ).then((value) => {
    if ("traces" in value) {
      const latest = value.traces[0]
      return latest ? normalizeTrace(latest) : emptyTrace()
    }
    return normalizeTrace("trace" in value ? value.trace : value)
  })
}

interface RawRetrievalTrace {
  candidateCount: number
  selected: Array<{
    id: string
    category: MemoryCategory
    statement: string
    score: {
      semantic: number
      importance: number
      recency: number
      confidence: number
      total: number
    }
  }>
  contextCharacters: number
  contextLimit: number
  model: string
  promptVersion: string
  latencyMs?: number
}

function emptyTrace(): RetrievalTrace {
  return { candidateCount: 0, selectedMemories: [] }
}

function normalizeTrace(trace: RetrievalTrace | RawRetrievalTrace): RetrievalTrace {
  if ("selectedMemories" in trace) return trace
  return {
    candidateCount: trace.candidateCount,
    selectedMemories: trace.selected.map((memory) => ({
      id: memory.id,
      category: memory.category,
      statement: memory.statement,
      score: memory.score.total,
      similarity: memory.score.semantic,
      importance: memory.score.importance,
      recency: memory.score.recency,
      confidence: memory.score.confidence,
    })),
    contextCharacters: trace.contextCharacters,
    contextBudget: trace.contextLimit,
    model: trace.model,
    promptVersion: trace.promptVersion,
    latencyMs: trace.latencyMs,
  }
}

function normalizeSummary(summary: SessionSummary): SessionSummary {
  return {
    ...summary,
    transcriptDeleted:
      summary.transcriptDeleted ?? Boolean(summary.transcriptDeletedAt),
  }
}

export function listPatientMemories(patientId: string) {
  return apiRequest<
    MemoryRecord[] | { memories?: MemoryRecord[]; items?: MemoryRecord[] }
  >(`/api/patients/${encodeURIComponent(patientId)}/memories`).then((value) =>
    listFrom(value, "memories"),
  )
}

export function updateMemory(
  memoryId: string,
  changes: Pick<Partial<MemoryRecord>, "statement" | "importance">,
) {
  return apiRequest<{ memory: MemoryRecord } | MemoryRecord>(
    `/api/memories/${encodeURIComponent(memoryId)}`,
    { method: "PATCH", body: JSON.stringify(changes) },
  ).then((value) => ("memory" in value ? value.memory : value))
}

export function actOnMemory(
  memoryId: string,
  action: "approve" | "reject" | "dispute" | "forget",
) {
  return apiRequest<{ memory: MemoryRecord } | MemoryRecord>(
    `/api/memories/${encodeURIComponent(memoryId)}/${action}`,
    { method: "POST", body: JSON.stringify({}) },
  ).then((value) => ("memory" in value ? value.memory : value))
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onTrace: (trace: RetrievalTrace) => void
  onDone: (message?: ChatMessage) => void
  onError?: (error: ThreadlineApiError) => void
}

type StreamEvent =
  | { type: "token"; token?: string; content?: string; delta?: string }
  | {
      type: "trace"
      trace?: RetrievalTrace | RawRetrievalTrace
      data?: RetrievalTrace | RawRetrievalTrace
    }
  | { type: "done"; message?: ChatMessage; data?: ChatMessage }
  | {
      type: "error"
      error?: { code?: string; message?: string; requestId?: string }
      message?: string
    }

function normalizeStreamEvent(value: unknown): StreamEvent | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const type = record.type ?? record.event
  if (typeof type !== "string") return null
  return { ...record, type } as StreamEvent
}

function dispatchStreamEvent(event: StreamEvent, callbacks: StreamCallbacks) {
  switch (event.type) {
    case "token":
      callbacks.onToken(event.token ?? event.delta ?? event.content ?? "")
      return
    case "trace":
      callbacks.onTrace(
        event.trace || event.data
          ? normalizeTrace(event.trace ?? event.data!)
          : emptyTrace(),
      )
      return
    case "done":
      callbacks.onDone(event.message ?? event.data)
      return
    case "error": {
      const error = new ThreadlineApiError(
        event.error?.message ?? event.message ?? "The response stream stopped.",
        {
          code: event.error?.code,
          requestId: event.error?.requestId,
        },
      )
      callbacks.onError?.(error)
      throw error
    }
  }
}

export async function streamSessionMessage(
  sessionId: string,
  content: string,
  callbacks: StreamCallbacks,
) {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/x-ndjson",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    },
  )

  if (!response.ok) {
    throw await parseApiError(response)
  }

  if (!response.body) {
    throw new ThreadlineApiError("The response stream was unavailable.", {
      code: "STREAM_UNAVAILABLE",
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let sawDone = false

  const consumeLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const event = normalizeStreamEvent(JSON.parse(trimmed))
    if (!event) return
    if (event.type === "done") sawDone = true
    dispatchStreamEvent(event, callbacks)
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) consumeLine(line)

    if (done) break
  }

  if (buffer.trim()) consumeLine(buffer)
  if (!sawDone) callbacks.onDone()
}
