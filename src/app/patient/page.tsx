import type { Metadata } from "next"

import { PatientDashboard } from "@/components/threadline/patient-dashboard"

export const metadata: Metadata = {
  title: "Patient workspace",
}

export default function PatientPage() {
  return <PatientDashboard />
}
