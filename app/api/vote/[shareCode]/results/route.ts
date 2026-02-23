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

  const isVoter = voterId
    ? await prisma.voter.findFirst({ where: { id: voterId, electionId: election.id, emailVerified: true } })
    : null;

  const canSeeResults =
    election.resultsVisibility === "public" ||
    (election.resultsVisibility === "voters" && !!isVoter) ||
    (election.showLiveResults && phase === "voting") ||
    phase === "closed";

  if (!canSeeResults) {
    return NextResponse.json({ error: "Results are not available yet" }, { status: 403 });
  }

  const [voteCounts, currentVotesRaw] = await Promise.all([
    prisma.vote.groupBy({
      by: ["positionId", "candidateId"],
      where: { electionId: election.id },
      _count: { id: true },
    }),
    voterId
      ? prisma.vote.findMany({
          where: { electionId: election.id, voterId },
          select: { positionId: true, candidateId: true },
        })
      : Promise.resolve([]),
  ]);

  const countMap = new Map<string, number>();
  const positionTotals = new Map<string, number>();
  for (const row of voteCounts) {
    countMap.set(`${row.positionId}:${row.candidateId}`, row._count.id);
    positionTotals.set(row.positionId, (positionTotals.get(row.positionId) || 0) + row._count.id);
  }

  const currentVotes = Object.fromEntries(currentVotesRaw.map((v) => [v.positionId, v.candidateId]));

  const positions = election.positions.map((pos) => {
    const totalPosVotes = positionTotals.get(pos.id) || 0;
    return {
      id: pos.id,
      title: pos.title,
      totalVotes: totalPosVotes,
      currentVote: currentVotes[pos.id] || null,
      candidates: pos.candidates.map((c) => {
        const cVotes = countMap.get(`${pos.id}:${c.id}`) || 0;
        return {
          id: c.id,
          name: c.name,
          photoUrl: c.photoUrl,
          votes: cVotes,
          percentage: totalPosVotes > 0 ? (cVotes / totalPosVotes) * 100 : 0,
        };
      }),
    };
  });

  return NextResponse.json({ positions, phase });
}
