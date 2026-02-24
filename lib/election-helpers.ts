import type { Election } from "@prisma/client";

export type ElectionPhase = "draft" | "before_registration" | "registration" | "between_phases" | "voting" | "closed";

export function getElectionPhase(election: Election): ElectionPhase {
  if (election.status === "draft") return "draft";
  if (election.status === "closed") return "closed";

  const now = new Date();

  if (election.autoTransition) {
    // Auto mode: dates drive the phase. The organizer sets a schedule and phases
    // transition automatically. Status only gates draft/closed.
    const pastVoteEnd = election.votingEnd && now > election.votingEnd;
    if (pastVoteEnd) return "closed";

    const inVoting = election.votingStart && now >= election.votingStart
      && election.votingEnd && now <= election.votingEnd;
    if (inVoting) return "voting";

    // Allow voting even without end date if status is voting and start has passed
    if (election.status === "voting" && election.votingStart && now >= election.votingStart) return "voting";
    if (election.status === "voting" && !election.votingStart) return "voting";

    const beforeRegStart = election.registrationStart && now < election.registrationStart;
    if (beforeRegStart) return "before_registration";

    const inRegistration = election.registrationStart && now >= election.registrationStart
      && (!election.registrationEnd || now <= election.registrationEnd);
    if (inRegistration) return "registration";

    const pastRegEnd = election.registrationEnd && now > election.registrationEnd;
    if (pastRegEnd) return "between_phases";

    return election.status as ElectionPhase;
  }

  // Manual mode: the organizer must explicitly advance each election via
  // "Open Registration" / "Open Voting" / "Close Election" buttons.
  // Status acts as a hard gate for the maximum reachable phase.
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
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    before_registration: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    registration: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    between_phases: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    voting: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    closed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return colors[phase];
}
