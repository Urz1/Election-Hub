"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ExternalLink, Users, Vote, BarChart3, Clock, Copy,
  RefreshCw, Play, Square, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getElectionPhase, getPhaseLabel, getPhaseColor } from "@/lib/election-helpers";
import type { Election, Region, CustomField, Position, Candidate } from "@prisma/client";
import { toast } from "sonner";

type ElectionFull = Election & {
  positions: (Position & { candidates: Candidate[] })[];
  regions: Region[];
  customFields: CustomField[];
  _count: { voters: number; votes: number };
};

interface PositionStats {
  id: string;
  title: string;
  totalVotes: number;
  candidates: { id: string; name: string; photoUrl?: string; votes: number; percentage: number }[];
}

interface Stats {
  totalVoters: number;
  totalVotes: number;
  votersWhoVoted: number;
  turnout: number;
  positions: PositionStats[];
  regions: { id: string; name: string; registered: number; voted: number; turnout: number }[] | null;
  timestamp: string;
}

interface VoterRow {
  id: string;
  email: string;
  emailVerified: boolean;
  region: string | null;
  customFieldValues: Record<string, string>;
  hasVoted: boolean;
  registeredAt: string;
}

export default function ElectionDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { status } = useSession();
  const router = useRouter();
  const [election, setElection] = useState<ElectionFull | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [voters, setVoters] = useState<VoterRow[]>([]);
  const [tab, setTab] = useState<"results" | "voters">("results");

  const fetchElection = useCallback(async () => {
    const res = await fetch(`/api/elections/${id}`);
    if (res.ok) setElection(await res.json());
  }, [id]);

  const fetchStats = useCallback(async () => {
    const res = await fetch(`/api/elections/${id}/stats`);
    if (res.ok) setStats(await res.json());
  }, [id]);

  const fetchVoters = useCallback(async () => {
    const res = await fetch(`/api/elections/${id}/voters`);
    if (res.ok) setVoters(await res.json());
  }, [id]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchElection();
      fetchStats();
      fetchVoters();
    }
  }, [status, fetchElection, fetchStats, fetchVoters]);

  useEffect(() => {
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  async function updateStatus(newStatus: string) {
    const res = await fetch(`/api/elections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      fetchElection();
      toast.success(`Election status updated to ${newStatus}`);
    }
  }

  function exportVotersCSV() {
    const customFieldLabels = election ? election.customFields.map((f) => f.label) : [];
    const headers = ["Email", "Region", ...customFieldLabels, "Verified", "Voted", "Registered At"];
    const rows = voters.map((v) => [
      v.email,
      v.region || "",
      ...(election ? election.customFields.map((f) => v.customFieldValues[f.id] || "") : []),
      v.emailVerified ? "Yes" : "No",
      v.hasVoted ? "Yes" : "No",
      new Date(v.registeredAt).toLocaleString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voters-${election?.title || id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!election) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const phase = getElectionPhase(election);
  const shareLink = `${typeof window !== "undefined" ? window.location.origin : ""}/vote/${election.shareCode}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="font-semibold truncate">{election.title}</h1>
          </div>
          <Badge className={getPhaseColor(phase)} variant="secondary">{getPhaseLabel(phase)}</Badge>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(shareLink); toast.success("Link copied!"); }}>
            <Copy className="h-3 w-3 mr-1" /> Copy Voter Link
          </Button>
          {(phase === "draft" || phase === "before_registration") && (
            <Button size="sm" onClick={() => updateStatus("registration")}>
              <Play className="h-3 w-3 mr-1" /> Open Registration
            </Button>
          )}
          {phase === "registration" && (
            <Button size="sm" onClick={() => updateStatus("voting")}>
              <Play className="h-3 w-3 mr-1" /> Open Voting
            </Button>
          )}
          {phase === "voting" && (
            <Button size="sm" variant="destructive" onClick={() => updateStatus("closed")}>
              <Square className="h-3 w-3 mr-1" /> Close Election
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => { fetchStats(); fetchVoters(); }}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>

        <div className="rounded-md border bg-white px-4 py-2 text-sm flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">Voter link:</span>
          <code className="font-mono text-xs flex-1 truncate">{shareLink}</code>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <StatCard icon={<Users />} label="Registered Voters" value={stats?.totalVoters ?? 0} />
          <StatCard icon={<Vote />} label="Voters Who Voted" value={stats?.votersWhoVoted ?? 0} />
          <StatCard icon={<BarChart3 />} label="Turnout" value={`${(stats?.turnout ?? 0).toFixed(1)}%`} />
        </div>

        <div className="flex gap-2 border-b">
          <button
            onClick={() => setTab("results")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === "results" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Results
          </button>
          <button
            onClick={() => setTab("voters")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === "voters" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Voters ({voters.length})
          </button>
        </div>

        {tab === "results" && stats && (
          <div className="space-y-4">
            {stats.positions.map((pos) => (
              <Card key={pos.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>{pos.title}</span>
                    <span className="text-sm font-normal text-muted-foreground">{pos.totalVotes} votes</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pos.candidates.map((c, i) => (
                    <div key={c.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {c.photoUrl ? (
                            <img src={c.photoUrl} alt={c.name} className="h-7 w-7 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-500 flex-shrink-0">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium">
                            {i === 0 && pos.totalVotes > 0 && "🏆 "}
                            {c.name}
                          </span>
                        </div>
                        <span className="text-muted-foreground">
                          {c.votes} votes ({c.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <Progress value={c.percentage} className="h-3" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}

            {stats.regions && stats.regions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Region Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium">Region</th>
                          <th className="text-right py-2 font-medium">Registered</th>
                          <th className="text-right py-2 font-medium">Voted</th>
                          <th className="text-right py-2 font-medium">Turnout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.regions.map((r) => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="py-2">{r.name}</td>
                            <td className="text-right py-2">{r.registered}</td>
                            <td className="text-right py-2">{r.voted}</td>
                            <td className="text-right py-2">{r.turnout.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Auto-refreshes every 5s · Last: {stats.timestamp ? new Date(stats.timestamp).toLocaleTimeString() : "—"}
            </p>
          </div>
        )}

        {tab === "voters" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Registered Voters</CardTitle>
                <Button size="sm" variant="outline" onClick={exportVotersCSV}>
                  <Download className="h-3 w-3 mr-1" /> Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {voters.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No voters registered yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium">Email</th>
                        <th className="text-left py-2 font-medium">Region</th>
                        {election.customFields.map((f) => (
                          <th key={f.id} className="text-left py-2 font-medium">{f.label}</th>
                        ))}
                        <th className="text-center py-2 font-medium">Verified</th>
                        <th className="text-center py-2 font-medium">Voted</th>
                        <th className="text-right py-2 font-medium">Registered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {voters.map((v) => (
                        <tr key={v.id} className="border-b last:border-0">
                          <td className="py-2 font-mono text-xs">{v.email}</td>
                          <td className="py-2">{v.region || "—"}</td>
                          {election.customFields.map((f) => (
                            <td key={f.id} className="py-2">
                              {f.fieldType === "image" && v.customFieldValues[f.id] ? (
                                <a href={v.customFieldValues[f.id]} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={v.customFieldValues[f.id]}
                                    alt={f.label}
                                    className="h-8 w-8 rounded object-cover border hover:ring-2 hover:ring-primary cursor-pointer"
                                  />
                                </a>
                              ) : (
                                <span className="text-xs">{v.customFieldValues[f.id] || "—"}</span>
                              )}
                            </td>
                          ))}
                          <td className="text-center py-2">
                            <Badge variant="secondary" className={v.emailVerified ? "bg-green-100 text-green-700" : ""}>
                              {v.emailVerified ? "Yes" : "No"}
                            </Badge>
                          </td>
                          <td className="text-center py-2">
                            <Badge variant="secondary" className={v.hasVoted ? "bg-blue-100 text-blue-700" : ""}>
                              {v.hasVoted ? "Yes" : "No"}
                            </Badge>
                          </td>
                          <td className="text-right py-2 text-muted-foreground">
                            {new Date(v.registeredAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">{icon}</div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
