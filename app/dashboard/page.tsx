"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Vote, Users, BarChart3, LogOut, ExternalLink } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getElectionPhase, getPhaseLabel, getPhaseColor } from "@/lib/election-helpers";
import type { Election } from "@prisma/client";

type ElectionWithCounts = Election & {
  _count: { voters: number; votes: number; positions: number };
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [elections, setElections] = useState<ElectionWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/auth/me")
        .then((res) => res.json())
        .then((me) => {
          if (me.emailVerified === false) {
            router.push(`/verify-email?email=${encodeURIComponent(me.email)}`);
            return;
          }
          return fetch("/api/elections").then((res) => res.json());
        })
        .then((data) => {
          if (data) {
            setElections(data);
            setLoading(false);
          }
        });
    }
  }, [status, router]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Vote className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">ElectHub</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{session?.user?.name}</span>
            <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Your Elections</h1>
            <p className="text-muted-foreground mt-1">
              Create and manage elections
            </p>
          </div>
          <Link href="/dashboard/create">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Election
            </Button>
          </Link>
        </div>

        {elections.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Vote className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">No elections yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Create your first election to get started
              </p>
              <Link href="/dashboard/create">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Election
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {elections.map((election) => {
              const phase = getElectionPhase(election);
              return (
                <Card key={election.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl">
                          <Link
                            href={`/dashboard/${election.id}`}
                            className="hover:underline"
                          >
                            {election.title}
                          </Link>
                        </CardTitle>
                        {election.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {election.description}
                          </p>
                        )}
                      </div>
                      <Badge className={getPhaseColor(phase)} variant="secondary">
                        {getPhaseLabel(phase)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        <span>{election._count.voters} voters</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <BarChart3 className="h-4 w-4" />
                        <span>{election._count.votes} votes</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Vote className="h-4 w-4" />
                        <span>{election._count.positions} positions</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <Link href={`/dashboard/${election.id}`}>
                        <Button size="sm" variant="outline">
                          Manage
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${window.location.origin}/vote/${election.shareCode}`
                          );
                        }}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Copy Link
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
