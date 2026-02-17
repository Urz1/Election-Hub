import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const verifySchema = z.object({
  voterId: z.string(),
  code: z.string().length(6),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const { shareCode } = await params;

  try {
    const body = await request.json();
    const data = verifySchema.parse(body);

    const election = await prisma.election.findUnique({
      where: { shareCode },
    });

    if (!election) {
      return NextResponse.json({ error: "Election not found" }, { status: 404 });
    }

    const voter = await prisma.voter.findFirst({
      where: { id: data.voterId, electionId: election.id },
    });

    if (!voter) {
      return NextResponse.json({ error: "Voter not found" }, { status: 404 });
    }

    if (voter.emailVerified) {
      return NextResponse.json({ message: "Already verified", verified: true });
    }

    if (
      voter.verificationCode !== data.code ||
      !voter.verificationExpiry ||
      new Date() > voter.verificationExpiry
    ) {
      return NextResponse.json(
        { error: "Invalid or expired verification code" },
        { status: 400 }
      );
    }

    await prisma.voter.update({
      where: { id: voter.id },
      data: {
        emailVerified: true,
        verificationCode: null,
        verificationExpiry: null,
      },
    });

    return NextResponse.json({ message: "Email verified successfully", verified: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
