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
  });

  if (!election) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const voters = await prisma.voter.findMany({
    where: { electionId: id },
    include: {
      region: { select: { name: true } },
      votes: { select: { id: true, castAt: true } },
    },
    orderBy: { registeredAt: "desc" },
  });

  return NextResponse.json(
    voters.map((v) => ({
      id: v.id,
      email: v.email,
      emailVerified: v.emailVerified,
      region: v.region?.name || null,
      customFieldValues: JSON.parse(v.customFieldValues),
      hasVoted: v.votes.length > 0,
      registeredAt: v.registeredAt,
    }))
  );
}
