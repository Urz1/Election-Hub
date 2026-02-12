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
      customFields: { orderBy: { displayOrder: "asc" } },
      _count: { select: { voters: true, votes: true } },
    },
  });

  if (!election) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(election);
}

export async function PATCH(
  request: Request,
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

  const body = await request.json();

  const updated = await prisma.election.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.registrationStart !== undefined && {
        registrationStart: body.registrationStart ? new Date(body.registrationStart) : null,
      }),
      ...(body.registrationEnd !== undefined && {
        registrationEnd: body.registrationEnd ? new Date(body.registrationEnd) : null,
      }),
      ...(body.votingStart !== undefined && {
        votingStart: body.votingStart ? new Date(body.votingStart) : null,
      }),
      ...(body.votingEnd !== undefined && {
        votingEnd: body.votingEnd ? new Date(body.votingEnd) : null,
      }),
      ...(body.securityLevel !== undefined && { securityLevel: body.securityLevel }),
      ...(body.allowVoteUpdate !== undefined && { allowVoteUpdate: body.allowVoteUpdate }),
      ...(body.showLiveResults !== undefined && { showLiveResults: body.showLiveResults }),
      ...(body.resultsVisibility !== undefined && { resultsVisibility: body.resultsVisibility }),
      ...(body.requireLocation !== undefined && { requireLocation: body.requireLocation }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
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

  await prisma.election.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
