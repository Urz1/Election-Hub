import { prisma } from "@/lib/prisma";

type AuditAction =
  | "organizer.register"
  | "organizer.login"
  | "organizer.login_failed"
  | "organizer.google_login"
  | "organizer.verify_email"
  | "organizer.password_reset"
  | "election.create"
  | "election.update"
  | "election.status_change"
  | "election.delete"
  | "election.schedule_change"
  | "voter.register"
  | "voter.verify"
  | "voter.vote_cast"
  | "voter.vote_update";

interface AuditEntry {
  action: AuditAction;
  actor: string;
  actorType: "organizer" | "voter" | "system";
  targetId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
}

/**
 * Immutable audit log. Fire-and-forget -- errors are silently caught
 * so audit failures never block the main flow.
 */
export function audit(entry: AuditEntry): void {
  prisma.auditLog
    .create({
      data: {
        action: entry.action,
        actor: entry.actor,
        actorType: entry.actorType,
        targetId: entry.targetId ?? null,
        meta: entry.meta ? JSON.stringify(entry.meta) : "{}",
        ip: entry.ip ?? null,
      },
    })
    .catch((err) => {
      console.error("[AUDIT] Failed to write audit log:", err);
    });
}
