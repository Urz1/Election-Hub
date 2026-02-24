import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getElectionPhase } from "@/lib/election-helpers";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const { shareCode } = await params;

  const election = await cached(`election:${shareCode}`, 3000, () =>
    prisma.election.findUnique({
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
    })
  );

  if (!election) {
    return NextResponse.json({ error: "Election not found" }, { status: 404 });
  }

  const phase = getElectionPhase(election);

  // Sync DB status when the computed phase has advanced past the stored status.
  // Auto-transition: sync both registration→voting and voting→closed.
  // Manual: only auto-close when votingEnd passes (start is always manual).
  const dbStatus = election.status;
  if (election.autoTransition && phase === "voting" && dbStatus === "registration") {
    await prisma.election.update({ where: { id: election.id }, data: { status: "voting" } });
  }
  if (phase === "closed" && dbStatus !== "closed") {
    await prisma.election.update({ where: { id: election.id }, data: { status: "closed" } });
  }

  return NextResponse.json({
    id: election.id,
    title: election.title,
    description: election.description,
    organizerName: election.organizer.name,
    phase,
    autoTransition: election.autoTransition,
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
        photoUrl: c.photoUrl,
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
