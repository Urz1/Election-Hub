import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { invalidate } from "@/lib/cache";
import { getElectionPhase } from "@/lib/election-helpers";
import { validateElectionTimes } from "@/lib/time-validation";

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

  const phase = getElectionPhase(election);
  const isTimeChange = body.registrationEnd !== undefined
    || body.registrationStart !== undefined
    || body.votingStart !== undefined
    || body.votingEnd !== undefined;

  if (isTimeChange && (phase === "closed" || election.status === "closed")) {
    return NextResponse.json(
      { error: "Cannot modify times after voting has ended" },
      { status: 400 }
    );
  }

  if (isTimeChange) {
    const merged = {
      registrationStart: body.registrationStart !== undefined ? body.registrationStart : election.registrationStart,
      registrationEnd: body.registrationEnd !== undefined ? body.registrationEnd : election.registrationEnd,
      votingStart: body.votingStart !== undefined ? body.votingStart : election.votingStart,
      votingEnd: body.votingEnd !== undefined ? body.votingEnd : election.votingEnd,
    };
    const timeCheck = validateElectionTimes(merged, { allowPast: true });
    if (!timeCheck.valid) {
      return NextResponse.json({ error: timeCheck.errors[0] }, { status: 400 });
    }
  }

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

  invalidate(`election:${election.shareCode}`);

  const action = body.status !== undefined
    ? "election.status_change" as const
    : isTimeChange
      ? "election.schedule_change" as const
      : "election.update" as const;

  audit({
    action,
    actor: session.user.id,
    actorType: "organizer",
    targetId: id,
    meta: body.status ? { status: body.status } : isTimeChange ? { ...body } : { fields: Object.keys(body) },
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

  audit({
    action: "election.delete",
    actor: session.user.id,
    actorType: "organizer",
    targetId: id,
    meta: { title: election.title },
  });

  return NextResponse.json({ success: true });
}
