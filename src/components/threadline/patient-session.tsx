"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeftIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  SendIcon,
  ShieldAlertIcon,
  SquareIcon,
  UserRoundIcon,
} from "lucide-react"
import { FormEvent, KeyboardEvent, useEffect, useRef, useState, useTransition } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Marker, MarkerContent } from "@/components/ui/marker"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

import { AppShell } from "./app-shell"
import {
  createSession,
  finalizeSession,
  getMe,
  getSession,
  streamSessionMessage,
  ThreadlineApiError,
  type ChatMessage,
  type RetrievalTrace,
  type TherapySession,
} from "./api-client"
import { ThreadlineMark } from "./brand"
import { MemoryTrace } from "./memory-trace"

const welcomeMessage: ChatMessage = {
  id: "threadline-welcome",
  role: "assistant",
  content:
    "Take your time. What feels most important to put into words today? I will show you if an approved memory becomes relevant.",
}

const messageTimeFormatter = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  minute: "2-digit",
})

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function PatientSession({ initialSessionId }: { initialSessionId?: string }) {
  const router = useRouter()
  const [session, setSession] = useState<TherapySession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage])
  const [trace, setTrace] = useState<RetrievalTrace | null>(null)
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highRisk, setHighRisk] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [isFinalizing, startFinalizing] = useTransition()
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true

    const load = async () => {
      try {
        const user = await getMe()
        if (user.role !== "patient") {
          throw new Error("This session belongs to the patient role.")
        }
        const nextSession = initialSessionId
          ? await getSession(initialSessionId)
          : await createSession()
        if (!mounted.current) return
        setSession(nextSession)
        if (nextSession.messages?.length) setMessages(nextSession.messages)
      } catch (cause) {
        if (mounted.current) {
          setError(
            cause instanceof Error ? cause.message : "The reflection could not be opened.",
          )
        }
      } finally {
        if (mounted.current) setLoading(false)
      }
    }

    void load()
    return () => {
      mounted.current = false
    }
  }, [initialSessionId])

  const send = async () => {
    const content = draft.trim()
    if (!content || !session || streaming || completed) return

    const patientMessage: ChatMessage = {
      id: createMessageId("patient"),
      role: "patient",
      content,
      createdAt: new Date().toISOString(),
    }
    const assistantId = createMessageId("assistant")
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    }

    setDraft("")
    setError(null)
    setHighRisk(false)
    setStreaming(true)
    setMessages((current) => [...current, patientMessage, assistantMessage])

    try {
      await streamSessionMessage(session.id, content, {
        onToken: (token) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + token }
                : message,
            ),
          )
        },
        onTrace: setTrace,
        onDone: (message) => {
          if (!message?.content) return
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId && !item.content ? { ...item, ...message } : item,
            ),
          )
        },
      })
    } catch (cause) {
      const isSafetyError =
        cause instanceof ThreadlineApiError &&
        /RISK|SAFETY|CRISIS/.test(cause.code.toUpperCase())
      setHighRisk(isSafetyError)
      setError(
        isSafetyError
          ? "Threadline paused generated guidance because this may need immediate human support."
          : cause instanceof Error
            ? cause.message
            : "Qwen could not finish that response.",
      )
      setMessages((current) => current.filter((message) => message.id !== assistantId))
    } finally {
      setStreaming(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void send()
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send()
    }
  }

  const endSession = () => {
    if (!session || streaming || completed) return
    setError(null)
    startFinalizing(async () => {
      try {
        const result = await finalizeSession(session.id)
        setSession((current) =>
          result.session ??
          (current
            ? {
                ...current,
                status: "finalized",
                endedAt: new Date().toISOString(),
                transcriptDeletedAt: new Date().toISOString(),
              }
            : current),
        )
        setTrace((current) =>
          current ? { ...current, transcriptDeleted: true } : current,
        )
        setCompleted(true)
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The reflection could not be summarized. Your transcript is retained so you can retry.",
        )
      }
    })
  }

  const composerHelp = completed
    ? "This reflection is finalized. Start a new reflection from your dashboard."
    : "Enter sends · Shift + Enter adds a line · 4,000 character limit"

  return (
    <AppShell role="patient">
      <main className="threadline-app-main !pb-5">
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-2">
              <Button asChild variant="ghost" className="w-fit">
                <Link href="/patient">
                  <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
                  Patient workspace
                </Link>
              </Button>
              <div>
                <p className="threadline-kicker">Private reflection</p>
                <h1 className="font-heading text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
                  Continue from what matters today.
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button type="button" variant="outline" className="lg:hidden">
                    <BrainCircuitIcon data-icon="inline-start" aria-hidden="true" />
                    Memory Trace
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[92vw] sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle>Memory Trace</SheetTitle>
                    <SheetDescription>
                      Approved context selected for the current response.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 px-4 pb-4">
                    <MemoryTrace trace={trace} showTitle={false} />
                  </div>
                </SheetContent>
              </Sheet>
              <Button
                type="button"
                variant="outline"
                onClick={endSession}
                disabled={!session || streaming || isFinalizing || completed}
              >
                {isFinalizing ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <SquareIcon data-icon="inline-start" aria-hidden="true" />
                )}
                End session
              </Button>
            </div>
          </header>

          {highRisk ? (
            <Alert variant="destructive">
              <ShieldAlertIcon aria-hidden="true" />
              <AlertTitle>Connect with immediate human support</AlertTitle>
              <AlertDescription>
                If you may be in immediate danger, call local emergency services.
                In the U.S. or Canada, call or text 988. This demo cannot provide
                crisis care.
              </AlertDescription>
            </Alert>
          ) : error ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>The session needs your attention</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {completed ? (
            <Alert>
              <CheckCircle2Icon aria-hidden="true" />
              <AlertTitle>Session ready for review</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                <span>
                  Qwen created a summary and proposed memories. The raw transcript
                  was deleted after the transaction completed.
                </span>
                <Button type="button" variant="outline" onClick={() => router.push("/patient")}>
                  Return to memory record
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid min-h-[38rem] gap-5 lg:h-[calc(100svh-15rem)] lg:min-h-[42rem] lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section
              aria-label="Reflection conversation"
              aria-busy={streaming || loading}
              className="threadline-app-surface flex min-h-[38rem] min-w-0 flex-col overflow-hidden"
            >
              {loading ? (
                <div className="flex flex-1 flex-col gap-5 p-5" aria-label="Loading conversation">
                  <Skeleton className="h-20 w-3/4 rounded-xl" />
                  <Skeleton className="ms-auto h-16 w-2/3 rounded-xl" />
                  <Skeleton className="h-24 w-4/5 rounded-xl" />
                </div>
              ) : (
                <MessageScrollerProvider autoScroll defaultScrollPosition="end">
                  <MessageScroller className="min-h-0 flex-1">
                    <MessageScrollerViewport aria-label="Conversation messages">
                      <MessageScrollerContent
                        role="log"
                        aria-live="polite"
                        aria-relevant="additions text"
                        className="p-4 sm:p-6"
                      >
                        {messages.map((message, index) =>
                          message.role === "system" ? (
                            <MessageScrollerItem key={message.id} messageId={message.id}>
                              <Marker variant="separator">
                                <MarkerContent>{message.content}</MarkerContent>
                              </Marker>
                            </MessageScrollerItem>
                          ) : (
                            <MessageScrollerItem
                              key={message.id}
                              messageId={message.id}
                              scrollAnchor={index === messages.length - 1}
                            >
                              <Message align={message.role === "patient" ? "end" : "start"}>
                                <MessageAvatar>
                                  <Avatar size="lg">
                                    <AvatarFallback>
                                      {message.role === "patient" ? (
                                        <UserRoundIcon aria-hidden="true" />
                                      ) : (
                                        <ThreadlineMark className="size-6 text-primary" />
                                      )}
                                    </AvatarFallback>
                                  </Avatar>
                                </MessageAvatar>
                                <MessageContent>
                                  <MessageHeader>
                                    {message.role === "patient" ? "Maya" : "Threadline with Qwen"}
                                  </MessageHeader>
                                  <Bubble
                                    align={message.role === "patient" ? "end" : "start"}
                                    variant={message.role === "patient" ? "default" : "secondary"}
                                  >
                                    <BubbleContent>
                                      {message.content ? (
                                        message.content
                                      ) : (
                                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                                          <Spinner /> Thinking with approved context…
                                        </span>
                                      )}
                                    </BubbleContent>
                                  </Bubble>
                                  <MessageFooter>
                                    {message.createdAt ? formatTime(message.createdAt) : "Ready when you are"}
                                  </MessageFooter>
                                </MessageContent>
                              </Message>
                            </MessageScrollerItem>
                          ),
                        )}
                      </MessageScrollerContent>
                    </MessageScrollerViewport>
                    <MessageScrollerButton direction="end" />
                  </MessageScroller>
                </MessageScrollerProvider>
              )}

              <form onSubmit={submit} className="threadline-composer border-t border-border bg-card p-3 sm:p-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="reflection-message" className="sr-only">
                      Share what is on your mind
                    </FieldLabel>
                    <InputGroup className="min-h-28 items-stretch bg-background">
                      <InputGroupTextarea
                        id="reflection-message"
                        name="message"
                        placeholder="Share what is on your mind"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        disabled={!session || streaming || completed}
                        maxLength={4000}
                        aria-describedby="reflection-message-help"
                        className="min-h-20 text-base"
                      />
                      <InputGroupAddon align="block-end" className="justify-between gap-3">
                        <span className="text-xs tabular-nums" aria-hidden="true">
                          {draft.length}/4,000
                        </span>
                        <InputGroupButton
                          type="submit"
                          size="sm"
                          variant="default"
                          className="min-h-11 px-4"
                          disabled={!draft.trim() || !session || streaming || completed}
                          aria-label="Send message"
                        >
                          {streaming ? <Spinner /> : <SendIcon aria-hidden="true" />}
                          Send message
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldDescription id="reflection-message-help">
                      {composerHelp}
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </form>
            </section>

            <aside className="threadline-app-surface hidden min-h-0 p-5 lg:block">
              <MemoryTrace trace={trace} />
            </aside>
          </div>
        </div>
      </main>
    </AppShell>
  )
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return messageTimeFormatter.format(date)
}
