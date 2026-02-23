import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationCode } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address").max(320),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
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
    const data = registerSchema.parse(body);

    const existing = await prisma.organizer.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const organizer = await prisma.organizer.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        verificationCode,
        verificationExpiry,
      },
    });

    const sent = await sendVerificationCode(data.email, verificationCode, "organizer");
    if (!sent) {
      console.log(`[FALLBACK] Organizer verification code for ${data.email}: ${verificationCode}`);
    }

    audit({ action: "organizer.register", actor: organizer.email, actorType: "organizer", targetId: organizer.id, ip });

    return NextResponse.json({
      id: organizer.id,
      name: organizer.name,
      email: organizer.email,
      devCode: process.env.NODE_ENV === "development" ? verificationCode : undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
