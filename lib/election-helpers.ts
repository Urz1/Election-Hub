import type { Election } from "@prisma/client";

export type ElectionPhase = "draft" | "before_registration" | "registration" | "between_phases" | "voting" | "closed";

export function getElectionPhase(election: Election): ElectionPhase {
  if (election.status === "draft") return "draft";
  if (election.status === "closed") return "closed";

  const now = new Date();

  // Status acts as a gate: the organizer must explicitly advance each election.
  // "registration" status can reach before_registration / registration / between_phases.
  // "voting" status can reach voting or auto-close when past voting end.
  if (election.status === "registration") {
    if (election.registrationStart && now < election.registrationStart) {
      return "before_registration";
    }
    if (election.registrationEnd && now > election.registrationEnd) {
      return "between_phases";
    }
    return "registration";
  }

  if (election.status === "voting") {
    if (election.votingEnd && now > election.votingEnd) {
      return "closed";
    }
    return "voting";
  }

  return election.status as ElectionPhase;
}

export function getPhaseLabel(phase: ElectionPhase): string {
  const labels: Record<ElectionPhase, string> = {
    draft: "Draft",
    before_registration: "Upcoming",
    registration: "Registration Open",
    between_phases: "Registration Closed",
    voting: "Voting Open",
    closed: "Closed",
  };
  return labels[phase];
}

export function getPhaseColor(phase: ElectionPhase): string {
  const colors: Record<ElectionPhase, string> = {
    draft: "bg-gray-100 text-gray-700",
    before_registration: "bg-blue-100 text-blue-700",
    registration: "bg-green-100 text-green-700",
    between_phases: "bg-yellow-100 text-yellow-700",
    voting: "bg-emerald-100 text-emerald-700",
    closed: "bg-red-100 text-red-700",
  };
  return colors[phase];
}
