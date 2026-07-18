import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowDownIcon,
  CheckCircle2Icon,
  EyeIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react"

import { RoleEntry } from "@/components/threadline/role-entry"
import { BrandLink } from "@/components/threadline/brand"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Separator } from "@/components/ui/separator"

export const metadata: Metadata = {
  title: "Therapy continuity with accountable memory",
}

const memorySteps = [
  {
    label: "Session one",
    detail: "Maya says paced breathing helped before a difficult meeting.",
    icon: SparklesIcon,
  },
  {
    label: "Reviewed",
    detail: "Dr. Chen checks the wording before the memory becomes active.",
    icon: CheckCircle2Icon,
  },
  {
    label: "Session two",
    detail: "Qwen retrieves that detail only when it is relevant—and shows why.",
    icon: EyeIcon,
  },
]

export default function Home() {
  return (
    <div className="min-h-svh overflow-x-clip bg-background">
      <header className="mx-auto flex min-h-20 w-full max-w-[90rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <BrandLink />
        <nav aria-label="Landing page" className="ms-auto hidden items-center gap-1 md:flex">
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="#how-it-works">How memory works</Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="#safety">Safety boundary</Link>
          </Button>
          <Button asChild className="min-h-11">
            <Link href="#demo">Open the demo</Link>
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-[90rem] items-center gap-12 px-4 py-12 sm:px-6 sm:py-18 lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)] lg:gap-16 lg:px-8 lg:py-24">
          <div className="flex max-w-3xl flex-col items-start gap-7">
            <Badge variant="secondary">Qwen MemoryAgent track</Badge>
            <div className="flex flex-col gap-5">
              <h1 className="threadline-hero-title max-w-[13ch] font-heading font-semibold text-balance">
                Care should not begin from zero every time.
              </h1>
              <p className="max-w-[64ch] text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
                Threadline turns a reflection into clinician-reviewed memory,
                then makes every reused detail visible and reversible in the
                next conversation.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="min-h-11">
                <Link href="#demo">
                  Try both perspectives
                  <ArrowDownIcon data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                Synthetic personas · no health data required
              </p>
            </div>
          </div>

          <aside
            aria-label="A memory moving between sessions"
            className="threadline-memory-thread"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">One careful thread</p>
                <p className="text-sm text-muted-foreground">Inspectable at every handoff</p>
              </div>
              <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <ShieldCheckIcon aria-hidden="true" />
              </span>
            </div>
            <ol className="threadline-memory-thread-list">
              {memorySteps.map((step) => {
                const Icon = step.icon
                return (
                  <li key={step.label} className="threadline-memory-thread-item">
                    <span className="threadline-thread-node">
                      <Icon aria-hidden="true" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="font-medium text-foreground">{step.label}</p>
                      <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                        {step.detail}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
            <Marker>
              <MarkerIcon>
                <EyeIcon />
              </MarkerIcon>
              <MarkerContent>Raw transcript deleted after extraction</MarkerContent>
            </Marker>
          </aside>
        </section>

        <Separator />

        <section
          id="how-it-works"
          className="mx-auto grid w-full max-w-[90rem] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)] lg:px-8 lg:py-24"
        >
          <div className="flex max-w-md flex-col gap-4">
            <p className="threadline-kicker">How it works</p>
            <h2 className="font-heading text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
              Memory is a reviewed record, not an invisible guess.
            </h2>
            <p className="leading-relaxed text-pretty text-muted-foreground">
              The full loop is designed around consent, inspection, and the
              ability to change your mind.
            </p>
          </div>

          <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {[
              ["01", "Reflect", "Qwen responds in a live session using only relevant, approved context."],
              ["02", "Extract", "The session becomes a concise summary and a small set of proposed memories."],
              ["03", "Review", "A clinician edits, approves, or rejects each memory before reuse."],
              ["04", "Reuse visibly", "The next session names which details were selected and why."],
            ].map(([number, title, description]) => (
              <li key={number} className="flex gap-4">
                <span className="font-heading text-xl font-semibold tabular-nums text-primary">
                  {number}
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="font-heading text-xl font-medium">{title}</h3>
                  <p className="leading-relaxed text-pretty text-muted-foreground">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="safety" className="bg-secondary/55">
          <div className="mx-auto grid w-full max-w-[90rem] gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
            <div className="flex max-w-3xl flex-col gap-3">
              <p className="threadline-kicker">A bounded prototype</p>
              <h2 className="font-heading text-2xl font-semibold tracking-[-0.025em] text-balance sm:text-3xl">
                Designed to demonstrate continuity—not deliver clinical care.
              </h2>
              <p className="leading-relaxed text-pretty text-muted-foreground">
                Threadline uses synthetic personas. It is not therapy, crisis
                care, a medical device, or a HIPAA-compliant system. High-risk
                language routes to deterministic support guidance instead of
                generated advice.
              </p>
            </div>
            <ShieldCheckIcon className="hidden size-16 text-primary/70 lg:block" aria-hidden="true" />
          </div>
        </section>

        <section
          id="demo"
          className="mx-auto grid w-full max-w-[90rem] gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(15rem,0.72fr)_minmax(0,1.28fr)] lg:px-8 lg:py-24"
        >
          <div className="flex max-w-md flex-col gap-4">
            <p className="threadline-kicker">Open the demo</p>
            <h2 className="font-heading text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
              Follow the same memory from both sides.
            </h2>
            <p className="leading-relaxed text-pretty text-muted-foreground">
              Start as Maya, end a reflection, then switch to Dr. Chen to review
              what Threadline proposes carrying forward.
            </p>
          </div>
          <RoleEntry />
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>Threadline · built with Qwen Cloud on Alibaba Cloud</p>
          <p>All people and session details in this demo are synthetic.</p>
        </div>
      </footer>
    </div>
  )
}
