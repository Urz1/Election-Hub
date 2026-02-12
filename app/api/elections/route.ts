import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const candidateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const positionSchema = z.object({
  title: z.string().min(1, "Position title is required"),
  description: z.string().optional(),
  candidates: z.array(candidateSchema).min(2, "Each position needs at least 2 candidates"),
});

const createElectionSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  positions: z.array(positionSchema).min(1, "At least 1 position required"),
  regions: z
    .array(
      z.object({
        name: z.string().min(1),
        geometry: z.string(),
        bufferMeters: z.number().optional(),
      })
    )
    .optional(),
  customFields: z
    .array(
      z.object({
        label: z.string().min(1),
        fieldType: z.enum(["text", "number", "dropdown", "phone"]),
        isRequired: z.boolean().optional(),
        options: z.array(z.string()).optional(),
      })
    )
    .optional(),
  registrationStart: z.string().optional(),
  registrationEnd: z.string().optional(),
  votingStart: z.string().optional(),
  votingEnd: z.string().optional(),
  securityLevel: z.enum(["casual", "standard", "strict"]).optional(),
  allowVoteUpdate: z.boolean().optional(),
  showLiveResults: z.boolean().optional(),
  resultsVisibility: z.enum(["organizer", "voters", "public"]).optional(),
  requireLocation: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const elections = await prisma.election.findMany({
    where: { organizerId: session.user.id },
    include: {
      _count: { select: { voters: true, votes: true, positions: true } },
      regions: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(elections);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = createElectionSchema.parse(body);

    const election = await prisma.election.create({
      data: {
        organizerId: session.user.id,
        title: data.title,
        description: data.description || "",
        registrationStart: data.registrationStart ? new Date(data.registrationStart) : null,
        registrationEnd: data.registrationEnd ? new Date(data.registrationEnd) : null,
        votingStart: data.votingStart ? new Date(data.votingStart) : null,
        votingEnd: data.votingEnd ? new Date(data.votingEnd) : null,
        securityLevel: data.securityLevel || "standard",
        allowVoteUpdate: data.allowVoteUpdate || false,
        showLiveResults: data.showLiveResults || false,
        resultsVisibility: data.resultsVisibility || "organizer",
        requireLocation: data.requireLocation || false,
        positions: {
          create: data.positions.map((p, pi) => ({
            title: p.title,
            description: p.description || "",
            displayOrder: pi,
            candidates: {
              create: p.candidates.map((c, ci) => ({
                name: c.name,
                description: c.description || "",
                displayOrder: ci,
              })),
            },
          })),
        },
        regions: data.regions
          ? { create: data.regions.map((r) => ({ name: r.name, geometry: r.geometry, bufferMeters: r.bufferMeters || 20 })) }
          : undefined,
        customFields: data.customFields
          ? {
              create: data.customFields.map((f, i) => ({
                label: f.label,
                fieldType: f.fieldType,
                isRequired: f.isRequired || false,
                options: JSON.stringify(f.options || []),
                displayOrder: i,
              })),
            }
          : undefined,
      },
      include: {
        positions: { include: { candidates: true } },
        regions: true,
        customFields: true,
      },
    });

    return NextResponse.json(election);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Create election error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
