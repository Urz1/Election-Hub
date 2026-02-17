import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getElectionPhase } from "@/lib/election-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const { shareCode } = await params;

  const election = await prisma.election.findUnique({
    where: { shareCode },
    include: {
      positions: {
        orderBy: { displayOrder: "asc" },
        include: { candidates: { orderBy: { displayOrder: "asc" } } },
      },
      regions: { select: { id: true, name: true, geometry: true, bufferMeters: true } },
      customFields: { orderBy: { displayOrder: "asc" } },
      organizer: { select: { name: true } },
    },
  });

  if (!election) {
    return NextResponse.json({ error: "Election not found" }, { status: 404 });
  }

  const phase = getElectionPhase(election);

  return NextResponse.json({
    id: election.id,
    title: election.title,
    description: election.description,
    organizerName: election.organizer.name,
    phase,
    registrationStart: election.registrationStart,
    registrationEnd: election.registrationEnd,
    votingStart: election.votingStart,
    votingEnd: election.votingEnd,
    requireLocation: election.requireLocation,
    allowVoteUpdate: election.allowVoteUpdate,
    showLiveResults: election.showLiveResults,
    resultsVisibility: election.resultsVisibility,
    securityLevel: election.securityLevel,
    positions: election.positions.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      candidates: p.candidates.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
      })),
    })),
    regions: election.regions,
    customFields: election.customFields.map((f) => ({
      id: f.id,
      label: f.label,
      fieldType: f.fieldType,
      isRequired: f.isRequired,
      options: JSON.parse(f.options),
    })),
  });
}
