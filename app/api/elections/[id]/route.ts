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
    include: { _count: { select: { voters: true, votes: true } } },
  });

  if (!election) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const phase = getElectionPhase(election);
  const hasVoters = election._count.voters > 0;
  const hasVotes = election._count.votes > 0;

  if (phase === "closed" && election.status === "closed" && body.status !== "closed") {
    const allowedWhenClosed = ["title", "description", "resultsVisibility"];
    const keys = Object.keys(body);
    const disallowed = keys.filter((k) => !allowedWhenClosed.includes(k));
    if (disallowed.length > 0) {
      return NextResponse.json(
        { error: "Election is closed. Only title, description, and results visibility can be changed." },
        { status: 400 }
      );
    }
  }

  if (hasVoters && body.securityLevel !== undefined) {
    return NextResponse.json(
      { error: "Cannot change security level after voters have registered" },
      { status: 400 }
    );
  }

  if (hasVoters && body.requireLocation !== undefined) {
    return NextResponse.json(
      { error: "Cannot change location requirement after voters have registered" },
      { status: 400 }
    );
  }

  if (hasVotes && body.allowVoteUpdate !== undefined) {
    return NextResponse.json(
      { error: "Cannot change vote update policy after voting has started" },
      { status: 400 }
    );
  }

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

  // --- Position/Candidate CRUD ---
  if (body.addPosition) {
    if (hasVotes) {
      return NextResponse.json({ error: "Cannot add positions after voting has started" }, { status: 400 });
    }
    const maxOrder = await prisma.position.aggregate({
      where: { electionId: id },
      _max: { displayOrder: true },
    });
    const pos = await prisma.position.create({
      data: {
        electionId: id,
        title: body.addPosition.title,
        description: body.addPosition.description || "",
        displayOrder: (maxOrder._max.displayOrder ?? -1) + 1,
      },
      include: { candidates: true },
    });
    invalidate(`election:${election.shareCode}`);
    audit({ action: "election.update", actor: session.user.id, actorType: "organizer", targetId: id, meta: { added: "position", positionId: pos.id } });
    return NextResponse.json(pos);
  }

  if (body.updatePosition) {
    if (hasVotes) {
      return NextResponse.json({ error: "Cannot edit positions after voting has started" }, { status: 400 });
    }
    const pos = await prisma.position.updateMany({
      where: { id: body.updatePosition.id, electionId: id },
      data: {
        ...(body.updatePosition.title !== undefined && { title: body.updatePosition.title }),
        ...(body.updatePosition.description !== undefined && { description: body.updatePosition.description }),
      },
    });
    invalidate(`election:${election.shareCode}`);
    audit({ action: "election.update", actor: session.user.id, actorType: "organizer", targetId: id, meta: { updated: "position", positionId: body.updatePosition.id } });
    return NextResponse.json({ updated: pos.count });
  }

  if (body.removePosition) {
    if (hasVoters) {
      return NextResponse.json({ error: "Cannot remove positions after voters have registered" }, { status: 400 });
    }
    await prisma.position.deleteMany({ where: { id: body.removePosition, electionId: id } });
    invalidate(`election:${election.shareCode}`);
    audit({ action: "election.update", actor: session.user.id, actorType: "organizer", targetId: id, meta: { removed: "position", positionId: body.removePosition } });
    return NextResponse.json({ success: true });
  }

  if (body.addCandidate) {
    if (hasVotes) {
      return NextResponse.json({ error: "Cannot add candidates after voting has started" }, { status: 400 });
    }
    const position = await prisma.position.findFirst({ where: { id: body.addCandidate.positionId, electionId: id } });
    if (!position) return NextResponse.json({ error: "Position not found" }, { status: 404 });
    const maxOrder = await prisma.candidate.aggregate({
      where: { positionId: position.id },
      _max: { displayOrder: true },
    });
    const candidate = await prisma.candidate.create({
      data: {
        positionId: position.id,
        name: body.addCandidate.name,
        description: body.addCandidate.description || "",
        photoUrl: body.addCandidate.photoUrl || null,
        displayOrder: (maxOrder._max.displayOrder ?? -1) + 1,
      },
    });
    invalidate(`election:${election.shareCode}`);
    audit({ action: "election.update", actor: session.user.id, actorType: "organizer", targetId: id, meta: { added: "candidate", candidateId: candidate.id } });
    return NextResponse.json(candidate);
  }

  if (body.updateCandidate) {
    if (hasVotes) {
      return NextResponse.json({ error: "Cannot edit candidates after voting has started" }, { status: 400 });
    }
    const candidate = await prisma.candidate.findFirst({
      where: { id: body.updateCandidate.id },
      include: { position: true },
    });
    if (!candidate || candidate.position.electionId !== id) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    const updated = await prisma.candidate.update({
      where: { id: body.updateCandidate.id },
      data: {
        ...(body.updateCandidate.name !== undefined && { name: body.updateCandidate.name }),
        ...(body.updateCandidate.description !== undefined && { description: body.updateCandidate.description }),
        ...(body.updateCandidate.photoUrl !== undefined && { photoUrl: body.updateCandidate.photoUrl || null }),
      },
    });
    invalidate(`election:${election.shareCode}`);
    audit({ action: "election.update", actor: session.user.id, actorType: "organizer", targetId: id, meta: { updated: "candidate", candidateId: updated.id } });
    return NextResponse.json(updated);
  }

  if (body.removeCandidate) {
    if (hasVoters) {
      return NextResponse.json({ error: "Cannot remove candidates after voters have registered" }, { status: 400 });
    }
    const candidate = await prisma.candidate.findFirst({
      where: { id: body.removeCandidate },
      include: { position: true },
    });
    if (!candidate || candidate.position.electionId !== id) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    await prisma.candidate.delete({ where: { id: body.removeCandidate } });
    invalidate(`election:${election.shareCode}`);
    audit({ action: "election.update", actor: session.user.id, actorType: "organizer", targetId: id, meta: { removed: "candidate", candidateId: body.removeCandidate } });
    return NextResponse.json({ success: true });
  }

  // --- Region CRUD ---
  if (body.addRegion) {
    if (hasVotes) {
      return NextResponse.json({ error: "Cannot add regions after voting has started" }, { status: 400 });
    }
    const region = await prisma.region.create({
      data: {
        electionId: id,
        name: body.addRegion.name,
        geometry: JSON.stringify(body.addRegion.geometry),
        bufferMeters: body.addRegion.bufferMeters ?? 20,
      },
    });
    invalidate(`election:${election.shareCode}`);
    audit({ action: "election.update", actor: session.user.id, actorType: "organizer", targetId: id, meta: { added: "region", regionId: region.id } });
    return NextResponse.json(region);
  }

  if (body.updateRegion) {
    if (hasVotes) {
      return NextResponse.json({ error: "Cannot edit regions after voting has started" }, { status: 400 });
    }
    const region = await prisma.region.findFirst({ where: { id: body.updateRegion.id, electionId: id } });
    if (!region) return NextResponse.json({ error: "Region not found" }, { status: 404 });
    const updated = await prisma.region.update({
      where: { id: body.updateRegion.id },
      data: {
        ...(body.updateRegion.name !== undefined && { name: body.updateRegion.name }),
        ...(body.updateRegion.geometry !== undefined && { geometry: JSON.stringify(body.updateRegion.geometry) }),
        ...(body.updateRegion.bufferMeters !== undefined && { bufferMeters: body.updateRegion.bufferMeters }),
      },
    });
    invalidate(`election:${election.shareCode}`);
    audit({ action: "election.update", actor: session.user.id, actorType: "organizer", targetId: id, meta: { updated: "region", regionId: updated.id } });
    return NextResponse.json(updated);
  }

  if (body.removeRegion) {
    if (hasVoters) {
      const regionVoters = await prisma.voter.count({ where: { regionId: body.removeRegion, electionId: id } });
      if (regionVoters > 0) {
        return NextResponse.json(
          { error: `Cannot remove region: ${regionVoters} voter(s) are assigned to it` },
          { status: 400 }
        );
      }
    }
    await prisma.region.deleteMany({ where: { id: body.removeRegion, electionId: id } });
    invalidate(`election:${election.shareCode}`);
    audit({ action: "election.update", actor: session.user.id, actorType: "organizer", targetId: id, meta: { removed: "region", regionId: body.removeRegion } });
    return NextResponse.json({ success: true });
  }

  // --- Standard field updates ---
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
      ...(body.autoTransition !== undefined && { autoTransition: body.autoTransition }),
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
