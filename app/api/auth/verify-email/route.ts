import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";
import { timingSafeEqual } from "crypto";

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6).regex(/^\d{6}$/, "Code must be 6 digits"),
});

export async function POST(request: Request) {
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
    const { email, code } = verifySchema.parse(body);

    const organizer = await prisma.organizer.findUnique({
      where: { email },
    });

    if (!organizer) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (organizer.emailVerified) {
      return NextResponse.json({ message: "Already verified" });
    }

    if (!organizer.verificationCode || !organizer.verificationExpiry) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    if (new Date() > organizer.verificationExpiry) {
      return NextResponse.json({ error: "Verification code has expired. Request a new one." }, { status: 400 });
    }

    const storedBuf = Buffer.from(organizer.verificationCode);
    const inputBuf = Buffer.from(code);
    if (storedBuf.length !== inputBuf.length || !timingSafeEqual(storedBuf, inputBuf)) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    await prisma.organizer.update({
      where: { id: organizer.id },
      data: {
        emailVerified: true,
        verificationCode: null,
        verificationExpiry: null,
      },
    });

    return NextResponse.json({ message: "Email verified successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Verify email error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
