/**
 * Validates election time fields for logical consistency.
 * Used by both server APIs and client-side forms.
 *
 * Rules:
 * 1. All provided dates must be in the future (for new elections)
 * 2. Registration end must be after registration start
 * 3. Voting start must be on or after registration end
 * 4. Voting end must be after voting start
 * 5. If only partial dates are set, validate only the pairs that exist
 */

interface TimeFields {
  registrationStart?: string | Date | null;
  registrationEnd?: string | Date | null;
  votingStart?: string | Date | null;
  votingEnd?: string | Date | null;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function validateElectionTimes(
  fields: TimeFields,
  options: { allowPast?: boolean } = {}
): ValidationResult {
  const errors: string[] = [];
  const now = new Date();

  const regStart = toDate(fields.registrationStart);
  const regEnd = toDate(fields.registrationEnd);
  const voteStart = toDate(fields.votingStart);
  const voteEnd = toDate(fields.votingEnd);

  if (!options.allowPast) {
    if (regStart && regStart < now) errors.push("Registration start must be in the future");
    if (regEnd && regEnd < now) errors.push("Registration end must be in the future");
    if (voteStart && voteStart < now) errors.push("Voting start must be in the future");
    if (voteEnd && voteEnd < now) errors.push("Voting end must be in the future");
  }

  if (regStart && regEnd && regEnd <= regStart) {
    errors.push("Registration end must be after registration start");
  }

  if (voteStart && voteEnd && voteEnd <= voteStart) {
    errors.push("Voting end must be after voting start");
  }

  if (regEnd && voteStart && voteStart < regEnd) {
    errors.push("Voting start must be on or after registration end");
  }

  if (regStart && voteStart && !regEnd && voteStart <= regStart) {
    errors.push("Voting start must be after registration start");
  }

  if (regStart && voteEnd && voteEnd <= regStart) {
    errors.push("Voting end must be after registration start");
  }

  return { valid: errors.length === 0, errors };
}
