import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getElectionPhase } from "@/lib/election-helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const { shareCode } = await params;
  const url = new URL(request.url);
  const voterId = url.searchParams.get("voterId");

  const election = await prisma.election.findUnique({
    where: { shareCode },
    include: {
      positions: {
        orderBy: { displayOrder: "asc" },
        include: { candidates: { orderBy: { displayOrder: "asc" } } },
      },
    },
  });

  if (!election) {
    return NextResponse.json({ error: "Election not found" }, { status: 404 });
  }

  const phase = getElectionPhase(election);

  const canSeeResults =
    election.resultsVisibility === "public" ||
    (election.showLiveResults && phase === "voting") ||
    phase === "closed";

  if (!canSeeResults && election.resultsVisibility !== "voters") {
    return NextResponse.json({ error: "Results are not available yet" }, { status: 403 });
  }

  const allVotes = await prisma.vote.findMany({
    where: { electionId: election.id },
    select: { positionId: true, candidateId: true, voterId: true },
  });

  let currentVotes: Record<string, string> = {};
  if (voterId) {
    const voterVotes = await prisma.vote.findMany({
      where: { electionId: election.id, voterId },
      select: { positionId: true, candidateId: true },
    });
    currentVotes = Object.fromEntries(voterVotes.map((v) => [v.positionId, v.candidateId]));
  }

  const positions = election.positions.map((pos) => {
    const posVotes = allVotes.filter((v) => v.positionId === pos.id);
    const totalPosVotes = posVotes.length;

    return {
      id: pos.id,
      title: pos.title,
      totalVotes: totalPosVotes,
      currentVote: currentVotes[pos.id] || null,
      candidates: pos.candidates.map((c) => {
        const cVotes = posVotes.filter((v) => v.candidateId === c.id).length;
        return {
          id: c.id,
          name: c.name,
          votes: cVotes,
          percentage: totalPosVotes > 0 ? (cVotes / totalPosVotes) * 100 : 0,
        };
      }),
    };
  });

  return NextResponse.json({ positions, phase });
}
