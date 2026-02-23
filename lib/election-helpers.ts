import type { Election } from "@prisma/client";

export type ElectionPhase = "draft" | "before_registration" | "registration" | "between_phases" | "voting" | "closed";

export function getElectionPhase(election: Election): ElectionPhase {
  if (election.status === "draft") return "draft";
  if (election.status === "closed") return "closed";

  const now = new Date();

  const beforeRegStart = election.registrationStart && now < election.registrationStart;
  const inRegistration = election.registrationStart && now >= election.registrationStart
    && election.registrationEnd && now <= election.registrationEnd;
  const pastRegEnd = election.registrationEnd && now > election.registrationEnd;

  const beforeVoteStart = election.votingStart && now < election.votingStart;
  const inVoting = election.votingStart && now >= election.votingStart
    && election.votingEnd && now <= election.votingEnd;
  const pastVoteEnd = election.votingEnd && now > election.votingEnd;

  // Voting takes priority — if we're inside the voting window, it's voting.
  if (inVoting) return "voting";

  // Past voting end → closed (regardless of registration dates)
  if (pastVoteEnd) return "closed";

  // Before registration starts
  if (beforeRegStart) return "before_registration";

  // Inside registration window (and not yet in voting)
  if (inRegistration) return "registration";

  // Registration ended, voting hasn't started yet
  if (pastRegEnd && beforeVoteStart) return "between_phases";

  // Registration ended, no voting dates set
  if (pastRegEnd && !election.votingStart) return "between_phases";

  // No dates match — fall back to status
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
