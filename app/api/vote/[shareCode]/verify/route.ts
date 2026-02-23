import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";
import { timingSafeEqual } from "crypto";

const verifySchema = z.object({
  voterId: z.string().min(1),
  code: z.string().length(6).regex(/^\d{6}$/, "Code must be 6 digits"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const { shareCode } = await params;

  const ip = getClientIp(request);
  const rl = rateLimit(ip, "verify");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

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

    if (!voter.verificationExpiry || new Date() > voter.verificationExpiry) {
      return NextResponse.json(
        { error: "Verification code has expired. Please request a new one." },
        { status: 400 }
      );
    }

    const storedBuf = Buffer.from(voter.verificationCode || "");
    const inputBuf = Buffer.from(data.code);
    const codesMatch = storedBuf.length === inputBuf.length && timingSafeEqual(storedBuf, inputBuf);

    if (!codesMatch) {
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
