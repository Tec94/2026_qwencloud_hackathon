import type { Metadata } from "next"

import { PatientSession } from "@/components/threadline/patient-session"

export const metadata: Metadata = {
  title: "Patient reflection",
}

export default async function PatientSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { session } = await searchParams
  return <PatientSession initialSessionId={session} />
}
