import type { Metadata } from "next"

import { ClinicianReview } from "@/components/threadline/clinician-review"

export const metadata: Metadata = {
  title: "Session review",
}

export default async function ClinicianReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { session } = await searchParams
  return <ClinicianReview initialSessionId={session} />
}
