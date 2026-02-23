import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationCode } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const resendSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(ip, "register");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  try {
    const body = await request.json();
    const { email } = resendSchema.parse(body);

    const organizer = await prisma.organizer.findUnique({
      where: { email },
    });

    if (!organizer) {
      return NextResponse.json({ message: "If an account exists, a new code has been sent." });
    }

    if (organizer.emailVerified) {
      return NextResponse.json({ message: "Email is already verified." });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.organizer.update({
      where: { id: organizer.id },
      data: { verificationCode, verificationExpiry },
    });

    const sent = await sendVerificationCode(email, verificationCode, "organizer");
    if (!sent) {
      console.log(`[FALLBACK] Resent verification code for ${email}: ${verificationCode}`);
    }

    return NextResponse.json({
      message: "A new verification code has been sent.",
      devCode: process.env.NODE_ENV === "development" ? verificationCode : undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Resend code error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
