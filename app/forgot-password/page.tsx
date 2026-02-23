"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { LogoIcon } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (data.devUrl) {
        toast.info(`[DEV] Reset URL: ${data.devUrl}`, { duration: 15000 });
      }

      setSent(true);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <LogoIcon size={40} />
          </div>
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>
            {sent
              ? "Check your email for a reset link"
              : "Enter your email and we'll send you a reset link"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Mail className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm text-muted-foreground">
                If an account exists for <span className="font-medium text-foreground">{email}</span>,
                you&apos;ll receive a password reset link shortly.
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full mt-2">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to login
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
              <Link
                href="/login"
                className="block text-center text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3 inline mr-1" />
                Back to login
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
