import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";
import crypto, { timingSafeEqual } from "crypto";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(ip, "auth");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  try {
    const body = await request.json();
    const { token, email, password } = schema.parse(body);

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const organizer = await prisma.organizer.findUnique({
      where: { email },
    });

    if (!organizer || !organizer.resetToken || !organizer.resetTokenExpiry) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    if (new Date() > organizer.resetTokenExpiry) {
      await prisma.organizer.update({
        where: { id: organizer.id },
        data: { resetToken: null, resetTokenExpiry: null },
      });
      return NextResponse.json({ error: "Reset link has expired. Please request a new one." }, { status: 400 });
    }

    const storedBuf = Buffer.from(organizer.resetToken, "hex");
    const inputBuf = Buffer.from(tokenHash, "hex");
    if (storedBuf.length !== inputBuf.length || !timingSafeEqual(storedBuf, inputBuf)) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.organizer.update({
      where: { id: organizer.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        emailVerified: true,
      },
    });

    return NextResponse.json({ message: "Password has been reset. You can now sign in." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
