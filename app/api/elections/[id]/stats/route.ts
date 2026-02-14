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

  const [totalVoters, totalVotes] = await Promise.all([
    prisma.voter.count({ where: { electionId: id } }),
    prisma.vote.count({ where: { electionId: id } }),
  ]);

  const allVotes = await prisma.vote.findMany({
    where: { electionId: id },
    select: { positionId: true, candidateId: true, voterId: true },
  });

  const uniqueVoterIds = new Set(allVotes.map((v) => v.voterId));
  const votersWhoVoted = uniqueVoterIds.size;

  const positionResults = election.positions.map((pos) => {
    const posVotes = allVotes.filter((v) => v.positionId === pos.id);
    const totalPosVotes = posVotes.length;

    return {
      id: pos.id,
      title: pos.title,
      totalVotes: totalPosVotes,
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

  let regionStats = null;
  if (election.regions.length > 0) {
    const votersByRegion = await prisma.voter.groupBy({
      by: ["regionId"],
      where: { electionId: id },
      _count: { id: true },
    });

    const votersWithVotes = await prisma.voter.findMany({
      where: { electionId: id, id: { in: Array.from(uniqueVoterIds) } },
      select: { regionId: true },
    });

    const votedByRegion: Record<string, number> = {};
    for (const v of votersWithVotes) {
      if (v.regionId) {
        votedByRegion[v.regionId] = (votedByRegion[v.regionId] || 0) + 1;
      }
    }

    const regionCounts = Object.fromEntries(
      votersByRegion.map((v) => [v.regionId || "none", v._count.id])
    );

    regionStats = election.regions.map((r) => ({
      id: r.id,
      name: r.name,
      registered: regionCounts[r.id] || 0,
      voted: votedByRegion[r.id] || 0,
      turnout: (regionCounts[r.id] || 0) > 0
        ? ((votedByRegion[r.id] || 0) / (regionCounts[r.id] || 1)) * 100
        : 0,
    }));
  }

  return NextResponse.json({
    totalVoters,
    totalVotes,
    votersWhoVoted,
    turnout: totalVoters > 0 ? (votersWhoVoted / totalVoters) * 100 : 0,
    positions: positionResults,
    regions: regionStats,
    timestamp: new Date().toISOString(),
  });
}
