import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getElectionPhase } from "@/lib/election-helpers";
import { isPointInRegion, type GeoRegion } from "@/lib/geo";
import { sendVerificationCode } from "@/lib/email";
import { z } from "zod";

const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  customFieldValues: z.record(z.string(), z.any()).optional(),
  deviceFingerprint: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const { shareCode } = await params;

  try {
    const body = await request.json();
    const data = registerSchema.parse(body);

    const election = await prisma.election.findUnique({
      where: { shareCode },
      include: {
        regions: true,
        customFields: true,
      },
    });

    if (!election) {
      return NextResponse.json({ error: "Election not found" }, { status: 404 });
    }

    const phase = getElectionPhase(election);
    if (phase !== "registration") {
      const message = phase === "voting" || phase === "closed"
        ? "Registration has closed. Only voters who registered before voting started can vote."
        : "Registration is not currently open";
      return NextResponse.json({ error: message }, { status: 403 });
    }

    const existing = await prisma.voter.findUnique({
      where: { electionId_email: { electionId: election.id, email: data.email } },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: "Already registered",
          voterId: existing.id,
          emailVerified: existing.emailVerified,
        },
        { status: 409 }
      );
    }

    if (
      election.securityLevel !== "casual" &&
      data.deviceFingerprint
    ) {
      const existingDevice = await prisma.voter.findFirst({
        where: {
          electionId: election.id,
          deviceFingerprint: data.deviceFingerprint,
        },
      });

      if (existingDevice) {
        return NextResponse.json(
          { error: "A voter has already registered from this device" },
          { status: 403 }
        );
      }
    }

    let assignedRegionId: string | null = null;

    if (election.requireLocation && election.regions.length > 0) {
      if (data.latitude == null || data.longitude == null) {
        return NextResponse.json(
          { error: "Location is required for this election" },
          { status: 400 }
        );
      }

      for (const region of election.regions) {
        const geometry: GeoRegion = JSON.parse(region.geometry);
        if (isPointInRegion(data.latitude, data.longitude, geometry, region.bufferMeters)) {
          assignedRegionId = region.id;
          break;
        }
      }

      if (!assignedRegionId) {
        return NextResponse.json(
          { error: "Your location is not within any eligible region for this election" },
          { status: 403 }
        );
      }
    }

    for (const field of election.customFields) {
      if (field.isRequired) {
        const value = data.customFieldValues?.[field.id];
        if (!value || (typeof value === "string" && value.trim() === "")) {
          return NextResponse.json(
            { error: `${field.label} is required` },
            { status: 400 }
          );
        }
      }
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const voter = await prisma.voter.create({
      data: {
        electionId: election.id,
        email: data.email,
        regionId: assignedRegionId,
        deviceFingerprint: data.deviceFingerprint || null,
        customFieldValues: JSON.stringify(data.customFieldValues || {}),
        locationLat: data.latitude || null,
        locationLng: data.longitude || null,
        verificationCode,
        verificationExpiry,
      },
    });

    const sent = await sendVerificationCode(data.email, verificationCode, "voter");
    if (!sent) {
      console.log(`[FALLBACK] Voter verification code for ${data.email}: ${verificationCode}`);
    }

    return NextResponse.json({
      voterId: voter.id,
      message: "Registration successful. Check your email for verification code.",
      devCode: process.env.NODE_ENV === "development" ? verificationCode : undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Register voter error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
