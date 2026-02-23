"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { LogoIcon } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      setDone(true);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!token || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <h2 className="text-xl font-semibold">Invalid reset link</h2>
            <p className="text-muted-foreground text-sm">
              This password reset link is invalid or has expired.
            </p>
            <Link href="/forgot-password">
              <Button variant="outline">Request a new link</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <LogoIcon size={40} />
          </div>
          <CardTitle className="text-2xl">
            {done ? "Password reset!" : "Set new password"}
          </CardTitle>
          <CardDescription>
            {done ? "You can now sign in with your new password" : `For ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <Button className="w-full" onClick={() => router.push("/login")}>
                Go to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
