import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.EMAIL_FROM || "ElectHub <onboarding@resend.dev>";

export async function sendVerificationCode(email: string, code: string, type: "organizer" | "voter" = "organizer") {
  const subject = type === "organizer"
    ? "Verify your ElectHub account"
    : "Your voting verification code";

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1a1a1a; margin-bottom: 8px;">
        ${type === "organizer" ? "Verify your email" : "Your verification code"}
      </h2>
      <p style="color: #666; font-size: 14px;">
        ${type === "organizer"
          ? "Enter this code to complete your ElectHub registration:"
          : "Enter this code to verify your identity and proceed to vote:"}
      </p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1a1a1a;">${code}</span>
      </div>
      <p style="color: #999; font-size: 12px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Email send failed:", err);
    return false;
  }
}

export async function sendPasswordReset(email: string, resetUrl: string) {
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1a1a1a; margin-bottom: 8px;">Reset your password</h2>
      <p style="color: #666; font-size: 14px;">
        Click the button below to set a new password for your ElectHub account.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${resetUrl}"
           style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
          Reset Password
        </a>
      </div>
      <p style="color: #999; font-size: 12px;">
        This link expires in 1 hour. If you didn't request a password reset, ignore this email.
      </p>
      <p style="color: #999; font-size: 12px;">
        Or copy this URL: ${resetUrl}
      </p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Reset your ElectHub password",
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Email send failed:", err);
    return false;
  }
}
