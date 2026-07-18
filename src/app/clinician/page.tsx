import type { Metadata } from "next"

import { ClinicianDashboard } from "@/components/threadline/clinician-dashboard"

export const metadata: Metadata = {
  title: "Clinician workspace",
}

export default function ClinicianPage() {
  return <ClinicianDashboard />
}
