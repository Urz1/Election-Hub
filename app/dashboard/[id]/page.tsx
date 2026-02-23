"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ExternalLink, Users, Vote, BarChart3, Clock, Copy,
  RefreshCw, Play, Square, Download, CalendarClock, Pencil, Save, X, AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateElectionTimes } from "@/lib/time-validation";
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
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    registrationStart: "",
    registrationEnd: "",
    votingStart: "",
    votingEnd: "",
  });
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchElection = useCallback(async () => {
    try {
      const res = await fetch(`/api/elections/${id}`);
      if (res.ok) setElection(await res.json());
    } catch { /* network error - silently retry on next poll */ }
  }, [id]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/elections/${id}/stats`);
      if (res.ok) setStats(await res.json());
    } catch { /* network error */ }
  }, [id]);

  const fetchVoters = useCallback(async () => {
    try {
      const res = await fetch(`/api/elections/${id}/voters`);
      if (res.ok) setVoters(await res.json());
    } catch { /* network error */ }
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
    let interval: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (interval) clearInterval(interval);
      interval = setInterval(fetchStats, 5000);
    }
    function stopPolling() {
      if (interval) { clearInterval(interval); interval = null; }
    }
    function onVisibilityChange() {
      if (document.hidden) stopPolling();
      else { fetchStats(); startPolling(); }
    }

    startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchStats]);

  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function updateStatus(newStatus: string) {
    if (updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/elections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchElection();
        toast.success(`Election status updated to ${newStatus}`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update status");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setUpdatingStatus(false);
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

  function toLocalInput(dateStr: string | Date | null | undefined): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  }

  function startEditSchedule() {
    if (!election) return;
    setScheduleForm({
      registrationStart: toLocalInput(election.registrationStart),
      registrationEnd: toLocalInput(election.registrationEnd),
      votingStart: toLocalInput(election.votingStart),
      votingEnd: toLocalInput(election.votingEnd),
    });
    setEditingSchedule(true);
  }

  const scheduleErrors = (() => {
    if (!editingSchedule) return [];
    const result = validateElectionTimes({
      registrationStart: scheduleForm.registrationStart || undefined,
      registrationEnd: scheduleForm.registrationEnd || undefined,
      votingStart: scheduleForm.votingStart || undefined,
      votingEnd: scheduleForm.votingEnd || undefined,
    }, { allowPast: true });
    return result.errors;
  })();

  async function saveSchedule() {
    if (scheduleErrors.length > 0) {
      toast.error(scheduleErrors[0]);
      return;
    }
    setSavingSchedule(true);
    try {
      const res = await fetch(`/api/elections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationStart: scheduleForm.registrationStart || null,
          registrationEnd: scheduleForm.registrationEnd || null,
          votingStart: scheduleForm.votingStart || null,
          votingEnd: scheduleForm.votingEnd || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to update schedule");
        return;
      }
      toast.success("Schedule updated! Voters will see the new times.");
      setEditingSchedule(false);
      fetchElection();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSavingSchedule(false);
    }
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
            <Button size="sm" onClick={() => updateStatus("registration")} disabled={updatingStatus}>
              <Play className="h-3 w-3 mr-1" /> {updatingStatus ? "Updating..." : "Open Registration"}
            </Button>
          )}
          {phase === "registration" && (
            <Button size="sm" onClick={() => updateStatus("voting")} disabled={updatingStatus}>
              <Play className="h-3 w-3 mr-1" /> {updatingStatus ? "Updating..." : "Open Voting"}
            </Button>
          )}
          {phase === "voting" && (
            <Button size="sm" variant="destructive" onClick={() => updateStatus("closed")} disabled={updatingStatus}>
              <Square className="h-3 w-3 mr-1" /> {updatingStatus ? "Closing..." : "Close Election"}
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

        {/* Schedule / Time Extension */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                Schedule
              </CardTitle>
              {phase !== "closed" && !editingSchedule && (
                <Button size="sm" variant="outline" onClick={startEditSchedule}>
                  <Pencil className="h-3 w-3 mr-1" /> Extend Times
                </Button>
              )}
              {phase === "closed" && (
                <Badge variant="secondary" className="bg-red-100 text-red-700 text-xs">Locked</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingSchedule ? (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Registration Opens</Label>
                    <Input
                      type="datetime-local"
                      value={scheduleForm.registrationStart}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, registrationStart: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Registration Closes</Label>
                    <Input
                      type="datetime-local"
                      value={scheduleForm.registrationEnd}
                      min={scheduleForm.registrationStart || undefined}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, registrationEnd: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Voting Opens</Label>
                    <Input
                      type="datetime-local"
                      value={scheduleForm.votingStart}
                      min={scheduleForm.registrationEnd || scheduleForm.registrationStart || undefined}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, votingStart: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Voting Closes</Label>
                    <Input
                      type="datetime-local"
                      value={scheduleForm.votingEnd}
                      min={scheduleForm.votingStart || scheduleForm.registrationEnd || undefined}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, votingEnd: e.target.value }))}
                    />
                  </div>
                </div>
                {scheduleErrors.length > 0 && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1">
                    {scheduleErrors.map((err, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-red-700">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>{err}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={saveSchedule} disabled={savingSchedule || scheduleErrors.length > 0}>
                    <Save className="h-3 w-3 mr-1" />
                    {savingSchedule ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingSchedule(false)} disabled={savingSchedule}>
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <ScheduleRow label="Registration opens" value={election.registrationStart} phase={phase} activePhases={["before_registration"]} />
                <ScheduleRow label="Registration closes" value={election.registrationEnd} phase={phase} activePhases={["registration"]} />
                <ScheduleRow label="Voting opens" value={election.votingStart} phase={phase} activePhases={["between_phases", "registered_waiting"]} />
                <ScheduleRow label="Voting closes" value={election.votingEnd} phase={phase} activePhases={["voting"]} />
              </div>
            )}
          </CardContent>
        </Card>

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

function ScheduleRow({ label, value, phase, activePhases }: {
  label: string;
  value: string | Date | null;
  phase: string;
  activePhases: string[];
}) {
  const isActive = activePhases.includes(phase);
  const dateStr = value ? new Date(value).toLocaleString() : "Not set";
  const isPast = value && new Date(value) < new Date();

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`text-xs font-medium ${isPast ? "text-muted-foreground line-through" : ""}`}>
          {dateStr}
        </span>
        {isActive && !isPast && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        )}
      </div>
    </div>
  );
}
