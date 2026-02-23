import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const election = await prisma.election.findFirst({
    where: { id, organizerId: session.user.id },
    include: {
      positions: {
        orderBy: { displayOrder: "asc" },
        include: { candidates: { orderBy: { displayOrder: "asc" } } },
      },
      regions: true,
    },
  });

  if (!election) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [totalVoters, votersWhoVoted, voteCounts] = await Promise.all([
    prisma.voter.count({ where: { electionId: id } }),
    prisma.vote.groupBy({
      by: ["voterId"],
      where: { electionId: id },
    }).then((rows) => rows.length),
    prisma.vote.groupBy({
      by: ["positionId", "candidateId"],
      where: { electionId: id },
      _count: { id: true },
    }),
  ]);

  const countMap = new Map<string, number>();
  const positionTotals = new Map<string, number>();
  for (const row of voteCounts) {
    const key = `${row.positionId}:${row.candidateId}`;
    countMap.set(key, row._count.id);
    positionTotals.set(row.positionId, (positionTotals.get(row.positionId) || 0) + row._count.id);
  }

  const totalVotes = Array.from(positionTotals.values()).reduce((a, b) => a + b, 0);

  const positions = election.positions.map((pos) => {
    const totalPosVotes = positionTotals.get(pos.id) || 0;
    return {
      id: pos.id,
      title: pos.title,
      totalVotes: totalPosVotes,
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

  let regionStats = null;
  if (election.regions.length > 0) {
    const [regRegistered, regVoted] = await Promise.all([
      prisma.voter.groupBy({
        by: ["regionId"],
        where: { electionId: id },
        _count: { id: true },
      }),
      prisma.voter.groupBy({
        by: ["regionId"],
        where: {
          electionId: id,
          votes: { some: {} },
        },
        _count: { id: true },
      }),
    ]);

    const regMap = Object.fromEntries(regRegistered.map((r) => [r.regionId || "none", r._count.id]));
    const votedMap = Object.fromEntries(regVoted.map((r) => [r.regionId || "none", r._count.id]));

    regionStats = election.regions.map((r) => {
      const registered = regMap[r.id] || 0;
      const voted = votedMap[r.id] || 0;
      return {
        id: r.id,
        name: r.name,
        registered,
        voted,
        turnout: registered > 0 ? (voted / registered) * 100 : 0,
      };
    });
  }

  return NextResponse.json({
    totalVoters,
    totalVotes,
    votersWhoVoted,
    turnout: totalVoters > 0 ? (votersWhoVoted / totalVoters) * 100 : 0,
    positions,
    regions: regionStats,
    timestamp: new Date().toISOString(),
  });
}
