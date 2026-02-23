import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getElectionPhase } from "@/lib/election-helpers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { z } from "zod";

const castVoteSchema = z.object({
  voterId: z.string().min(1),
  votes: z.array(
    z.object({
      positionId: z.string().min(1),
      candidateId: z.string().min(1),
    })
  ).min(1, "Must vote for at least one position"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const { shareCode } = await params;

  const ip = getClientIp(request);
  const rl = rateLimit(ip, "vote");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  try {
    const body = await request.json();
    const data = castVoteSchema.parse(body);

    const election = await prisma.election.findUnique({
      where: { shareCode },
      include: {
        positions: { include: { candidates: true } },
      },
    });

    if (!election) {
      return NextResponse.json({ error: "Election not found" }, { status: 404 });
    }

    const phase = getElectionPhase(election);
    if (phase !== "voting") {
      return NextResponse.json({ error: "Voting is not currently open" }, { status: 403 });
    }

    const voter = await prisma.voter.findFirst({
      where: { id: data.voterId, electionId: election.id },
    });

    if (!voter) {
      return NextResponse.json({ error: "Voter not found" }, { status: 404 });
    }

    if (!voter.emailVerified) {
      return NextResponse.json({ error: "Email not verified" }, { status: 403 });
    }

    const seenPositions = new Set<string>();
    for (const vote of data.votes) {
      if (seenPositions.has(vote.positionId)) {
        return NextResponse.json({ error: "Duplicate vote for the same position" }, { status: 400 });
      }
      seenPositions.add(vote.positionId);

      const position = election.positions.find((p) => p.id === vote.positionId);
      if (!position) {
        return NextResponse.json({ error: `Invalid position: ${vote.positionId}` }, { status: 400 });
      }
      const candidate = position.candidates.find((c) => c.id === vote.candidateId);
      if (!candidate) {
        return NextResponse.json({ error: `Invalid candidate for position ${position.title}` }, { status: 400 });
      }
    }

    const existingVotes = await prisma.vote.findMany({
      where: { electionId: election.id, voterId: voter.id },
    });

    const isUpdate = existingVotes.length > 0;

    if (isUpdate && !election.allowVoteUpdate) {
      return NextResponse.json(
        { error: "You have already voted and vote updates are not allowed" },
        { status: 403 }
      );
    }

    await prisma.$transaction(async (tx) => {
      if (isUpdate) {
        await tx.vote.deleteMany({
          where: { electionId: election.id, voterId: voter.id },
        });
      }

      await tx.vote.createMany({
        data: data.votes.map((v) => ({
          electionId: election.id,
          voterId: voter.id,
          positionId: v.positionId,
          candidateId: v.candidateId,
        })),
      });
    });

    audit({
      action: isUpdate ? "voter.vote_update" : "voter.vote_cast",
      actor: voter.email,
      actorType: "voter",
      targetId: election.id,
      meta: { voterId: voter.id, positionCount: data.votes.length },
      ip,
    });

    return NextResponse.json({
      message: isUpdate ? "Votes updated successfully" : "Votes cast successfully",
      updated: isUpdate,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Cast vote error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
