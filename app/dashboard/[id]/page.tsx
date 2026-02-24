"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft, ExternalLink, Users, Vote, BarChart3, Clock, Copy,
  RefreshCw, Play, Square, Download, CalendarClock, Pencil, Save, X,
  AlertCircle, Lock, Plus, Trash2, Settings, MapPin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateElectionTimes } from "@/lib/time-validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getElectionPhase, getPhaseLabel, getPhaseColor } from "@/lib/election-helpers";
import { ImageUpload } from "@/components/image-upload";
import type { Election, Region, CustomField, Position, Candidate } from "@prisma/client";
import type { DrawnRegion } from "@/components/map-draw";
import { toast } from "sonner";

const MapDraw = dynamic(() => import("@/components/map-draw").then((m) => m.default), { ssr: false });

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
  const [tab, setTab] = useState<"results" | "voters" | "settings">("results");
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
          <Badge variant="outline" className="text-xs">
            {election.autoTransition ? "Auto" : "Manual"}
          </Badge>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6 pb-24">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(shareLink); toast.success("Link copied!"); }}>
            <Copy className="h-3 w-3 mr-1" /> Copy Voter Link
          </Button>
          {election?.autoTransition ? (
            <>
              {phase === "draft" && (
                <Button size="sm" onClick={() => updateStatus("registration")} disabled={updatingStatus}>
                  <Play className="h-3 w-3 mr-1" /> {updatingStatus ? "Activating..." : "Activate Election"}
                </Button>
              )}
              {phase !== "draft" && phase !== "closed" && (
                <Button size="sm" variant="destructive" onClick={() => updateStatus("closed")} disabled={updatingStatus}>
                  <Square className="h-3 w-3 mr-1" /> {updatingStatus ? "Closing..." : "Close Election"}
                </Button>
              )}
            </>
          ) : (
            <>
              {(phase === "draft" || phase === "before_registration") && (
                <Button size="sm" onClick={() => updateStatus("registration")} disabled={updatingStatus}>
                  <Play className="h-3 w-3 mr-1" /> {updatingStatus ? "Updating..." : "Open Registration"}
                </Button>
              )}
              {(phase === "registration" || phase === "between_phases") && (
                <Button size="sm" onClick={() => updateStatus("voting")} disabled={updatingStatus}>
                  <Play className="h-3 w-3 mr-1" /> {updatingStatus ? "Updating..." : "Open Voting"}
                </Button>
              )}
              {phase === "voting" && (
                <Button size="sm" variant="destructive" onClick={() => updateStatus("closed")} disabled={updatingStatus}>
                  <Square className="h-3 w-3 mr-1" /> {updatingStatus ? "Closing..." : "Close Election"}
                </Button>
              )}
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => { fetchElection(); fetchStats(); fetchVoters(); }}>
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

        <div className="flex gap-2 border-b overflow-x-auto">
          {(["results", "voters", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"
              }`}
            >
              {t === "results" && "Results"}
              {t === "voters" && `Voters (${voters.length})`}
              {t === "settings" && (
                <span className="flex items-center gap-1"><Settings className="h-3.5 w-3.5" /> Settings</span>
              )}
            </button>
          ))}
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

        {tab === "settings" && (
          <SettingsPanel
            election={election}
            phase={phase}
            electionId={id}
            onRefresh={fetchElection}
          />
        )}
      </main>
    </div>
  );
}

// ──────────────────── Settings Panel ────────────────────

function SettingsPanel({
  election,
  phase,
  electionId,
  onRefresh,
}: {
  election: ElectionFull;
  phase: string;
  electionId: string;
  onRefresh: () => void;
}) {
  const hasVoters = election._count.voters > 0;
  const hasVotes = election._count.votes > 0;
  const isClosed = phase === "closed";

  return (
    <div className="space-y-6">
      <GeneralSettings
        election={election}
        electionId={electionId}
        isClosed={isClosed}
        hasVoters={hasVoters}
        hasVotes={hasVotes}
        onRefresh={onRefresh}
      />
      <PositionCandidateEditor
        election={election}
        electionId={electionId}
        hasVoters={hasVoters}
        hasVotes={hasVotes}
        isClosed={isClosed}
        onRefresh={onRefresh}
      />
      <RegionEditor
        election={election}
        electionId={electionId}
        hasVoters={hasVoters}
        hasVotes={hasVotes}
        isClosed={isClosed}
        onRefresh={onRefresh}
      />
    </div>
  );
}

// ──────────────────── General Settings ────────────────────

function GeneralSettings({
  election,
  electionId,
  isClosed,
  hasVoters,
  hasVotes,
  onRefresh,
}: {
  election: ElectionFull;
  electionId: string;
  isClosed: boolean;
  hasVoters: boolean;
  hasVotes: boolean;
  onRefresh: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  async function saveField(field: string, value: unknown) {
    setSaving(field);
    try {
      const res = await fetch(`/api/elections/${electionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || `Failed to update ${field}`);
      } else {
        toast.success("Setting saved");
        onRefresh();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="h-4 w-4" />
          General Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <EditableTextField
          label="Title"
          value={election.title}
          locked={isClosed}
          lockReason="Election is closed"
          saving={saving === "title"}
          onSave={(val) => saveField("title", val)}
        />
        <EditableTextField
          label="Description"
          value={election.description || ""}
          locked={isClosed}
          lockReason="Election is closed"
          saving={saving === "description"}
          onSave={(val) => saveField("description", val)}
          multiline
        />
        <ToggleField
          label="Require Location"
          description="Only voters within defined regions can register"
          value={election.requireLocation}
          locked={hasVoters}
          lockReason="Cannot change after voters have registered"
          saving={saving === "requireLocation"}
          onSave={(val) => saveField("requireLocation", val)}
        />
        <SelectField
          label="Security Level"
          value={election.securityLevel}
          options={[
            { value: "casual", label: "Casual — no device fingerprinting" },
            { value: "standard", label: "Standard — device fingerprinting" },
            { value: "strict", label: "Strict — fingerprint + single vote" },
          ]}
          locked={hasVoters}
          lockReason="Cannot change after voters have registered"
          saving={saving === "securityLevel"}
          onSave={(val) => saveField("securityLevel", val)}
        />
        <ToggleField
          label="Allow Vote Updates"
          description="Voters can change their vote before voting ends"
          value={election.allowVoteUpdate}
          locked={hasVotes}
          lockReason="Cannot change after voting has started"
          saving={saving === "allowVoteUpdate"}
          onSave={(val) => saveField("allowVoteUpdate", val)}
        />
        <ToggleField
          label="Auto-start phases on schedule"
          description={
            election.autoTransition
              ? "Registration and voting start automatically at the scheduled times. Phases close at their end times."
              : "You manually open registration and voting from the dashboard. Phases still close automatically at their end times."
          }
          value={election.autoTransition}
          locked={isClosed}
          lockReason="Election is closed"
          saving={saving === "autoTransition"}
          onSave={(val) => saveField("autoTransition", val)}
        />
        <ToggleField
          label="Show Live Results"
          description="Voters can see results while voting is open"
          value={election.showLiveResults}
          locked={isClosed}
          lockReason="Election is closed"
          saving={saving === "showLiveResults"}
          onSave={(val) => saveField("showLiveResults", val)}
        />
        <SelectField
          label="Results Visibility"
          value={election.resultsVisibility}
          options={[
            { value: "organizer", label: "Organizer only" },
            { value: "voters", label: "Verified voters" },
            { value: "public", label: "Public" },
          ]}
          locked={false}
          lockReason=""
          saving={saving === "resultsVisibility"}
          onSave={(val) => saveField("resultsVisibility", val)}
        />
      </CardContent>
    </Card>
  );
}

// ──────────────────── Position/Candidate Editor ────────────────────

function PositionCandidateEditor({
  election,
  electionId,
  hasVoters,
  hasVotes,
  isClosed,
  onRefresh,
}: {
  election: ElectionFull;
  electionId: string;
  hasVoters: boolean;
  hasVotes: boolean;
  isClosed: boolean;
  onRefresh: () => void;
}) {
  const [addingPosition, setAddingPosition] = useState(false);
  const [newPosTitle, setNewPosTitle] = useState("");
  const [newPosDesc, setNewPosDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [editPosTitle, setEditPosTitle] = useState("");
  const [editPosDesc, setEditPosDesc] = useState("");
  const [addingCandidateFor, setAddingCandidateFor] = useState<string | null>(null);
  const [newCandName, setNewCandName] = useState("");
  const [newCandDesc, setNewCandDesc] = useState("");
  const [newCandPhoto, setNewCandPhoto] = useState("");
  const [editingCandId, setEditingCandId] = useState<string | null>(null);
  const [editCandName, setEditCandName] = useState("");
  const [editCandDesc, setEditCandDesc] = useState("");
  const [editCandPhoto, setEditCandPhoto] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canAdd = !hasVotes && !isClosed;
  const canEdit = !hasVotes && !isClosed;
  const canRemove = !hasVoters && !isClosed;

  async function apiPatch(body: Record<string, unknown>) {
    const res = await fetch(`/api/elections/${electionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed");
    }
    return res.json();
  }

  async function handleAddPosition() {
    if (!newPosTitle.trim()) return;
    setSaving(true);
    try {
      await apiPatch({ addPosition: { title: newPosTitle.trim(), description: newPosDesc.trim() } });
      toast.success("Position added");
      setNewPosTitle("");
      setNewPosDesc("");
      setAddingPosition(false);
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add position");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdatePosition(posId: string) {
    if (!editPosTitle.trim()) return;
    setSaving(true);
    try {
      await apiPatch({ updatePosition: { id: posId, title: editPosTitle.trim(), description: editPosDesc.trim() } });
      toast.success("Position updated");
      setEditingPosId(null);
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update position");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemovePosition(posId: string) {
    setSaving(true);
    try {
      await apiPatch({ removePosition: posId });
      toast.success("Position removed");
      setConfirmDelete(null);
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove position");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCandidate(positionId: string) {
    if (!newCandName.trim()) return;
    setSaving(true);
    try {
      await apiPatch({ addCandidate: { positionId, name: newCandName.trim(), description: newCandDesc.trim(), photoUrl: newCandPhoto || undefined } });
      toast.success("Candidate added");
      setNewCandName("");
      setNewCandDesc("");
      setNewCandPhoto("");
      setAddingCandidateFor(null);
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add candidate");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCandidate(candId: string) {
    if (!editCandName.trim()) return;
    setSaving(true);
    try {
      await apiPatch({ updateCandidate: { id: candId, name: editCandName.trim(), description: editCandDesc.trim(), photoUrl: editCandPhoto || null } });
      toast.success("Candidate updated");
      setEditingCandId(null);
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update candidate");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveCandidate(candId: string) {
    setSaving(true);
    try {
      await apiPatch({ removeCandidate: candId });
      toast.success("Candidate removed");
      setConfirmDelete(null);
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove candidate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Vote className="h-4 w-4" />
            Positions & Candidates
          </CardTitle>
          {canAdd && !addingPosition && (
            <Button size="sm" variant="outline" onClick={() => setAddingPosition(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add Position
            </Button>
          )}
          {!canAdd && (
            <LockedBadge reason={hasVotes ? "Locked during voting" : "Election closed"} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {addingPosition && (
          <div className="border rounded-lg p-4 bg-blue-50/50 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Position Title</Label>
              <Input value={newPosTitle} onChange={(e) => setNewPosTitle(e.target.value)} placeholder="e.g. President" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input value={newPosDesc} onChange={(e) => setNewPosDesc(e.target.value)} placeholder="Brief description" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddPosition} disabled={saving || !newPosTitle.trim()}>
                <Save className="h-3 w-3 mr-1" /> {saving ? "Saving..." : "Add Position"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setAddingPosition(false); setNewPosTitle(""); setNewPosDesc(""); }}>
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {election.positions.length === 0 && !addingPosition && (
          <p className="text-sm text-muted-foreground text-center py-4">No positions defined yet</p>
        )}

        {election.positions.map((pos) => (
          <div key={pos.id} className="border rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
              {editingPosId === pos.id ? (
                <div className="flex-1 space-y-2 mr-2">
                  <Input value={editPosTitle} onChange={(e) => setEditPosTitle(e.target.value)} className="h-8" />
                  <Input value={editPosDesc} onChange={(e) => setEditPosDesc(e.target.value)} placeholder="Description" className="h-8" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleUpdatePosition(pos.id)} disabled={saving || !editPosTitle.trim()}>
                      <Save className="h-3 w-3 mr-1" /> {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingPosId(null)}>
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="font-medium text-sm">{pos.title}</h3>
                    {pos.description && <p className="text-xs text-muted-foreground">{pos.description}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <Button size="icon-sm" variant="ghost" onClick={() => { setEditingPosId(pos.id); setEditPosTitle(pos.title); setEditPosDesc(pos.description || ""); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    {canRemove && (
                      confirmDelete === `pos-${pos.id}` ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="destructive" onClick={() => handleRemovePosition(pos.id)} disabled={saving}>
                            Confirm
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                            No
                          </Button>
                        </div>
                      ) : (
                        <Button size="icon-sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setConfirmDelete(`pos-${pos.id}`)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="px-4 py-3 space-y-3">
              {pos.candidates.map((cand) => (
                <div key={cand.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                  {editingCandId === cand.id ? (
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-shrink-0">
                          <ImageUpload
                            value={editCandPhoto}
                            onChange={setEditCandPhoto}
                            onRemove={() => setEditCandPhoto("")}
                            compact
                          />
                        </div>
                        <div className="flex-1 space-y-2">
                          <Input value={editCandName} onChange={(e) => setEditCandName(e.target.value)} placeholder="Candidate name" className="h-8" />
                          <Input value={editCandDesc} onChange={(e) => setEditCandDesc(e.target.value)} placeholder="Description" className="h-8" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdateCandidate(cand.id)} disabled={saving || !editCandName.trim()}>
                          <Save className="h-3 w-3 mr-1" /> {saving ? "Saving..." : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingCandId(null)}>
                          <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {cand.photoUrl ? (
                        <img src={cand.photoUrl} alt={cand.name} className="h-10 w-10 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-slate-500 flex-shrink-0">
                          {cand.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{cand.name}</p>
                        {cand.description && <p className="text-xs text-muted-foreground">{cand.description}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {canEdit && (
                          <Button size="icon-sm" variant="ghost" onClick={() => {
                            setEditingCandId(cand.id);
                            setEditCandName(cand.name);
                            setEditCandDesc(cand.description || "");
                            setEditCandPhoto(cand.photoUrl || "");
                          }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                        {canRemove && (
                          confirmDelete === `cand-${cand.id}` ? (
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="destructive" onClick={() => handleRemoveCandidate(cand.id)} disabled={saving}>
                                Confirm
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                                No
                              </Button>
                            </div>
                          ) : (
                            <Button size="icon-sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setConfirmDelete(`cand-${cand.id}`)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}

              {pos.candidates.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No candidates yet</p>
              )}

              {addingCandidateFor === pos.id ? (
                <div className="border rounded-lg p-3 bg-green-50/50 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0">
                      <ImageUpload
                        value={newCandPhoto}
                        onChange={setNewCandPhoto}
                        onRemove={() => setNewCandPhoto("")}
                        compact
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <Input value={newCandName} onChange={(e) => setNewCandName(e.target.value)} placeholder="Candidate name" className="h-8" />
                      <Input value={newCandDesc} onChange={(e) => setNewCandDesc(e.target.value)} placeholder="Description (optional)" className="h-8" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleAddCandidate(pos.id)} disabled={saving || !newCandName.trim()}>
                      <Save className="h-3 w-3 mr-1" /> {saving ? "Saving..." : "Add Candidate"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAddingCandidateFor(null); setNewCandName(""); setNewCandDesc(""); setNewCandPhoto(""); }}>
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : canAdd && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => { setAddingCandidateFor(pos.id); setNewCandName(""); setNewCandDesc(""); setNewCandPhoto(""); }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Candidate
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ──────────────────── Region Editor ────────────────────

function RegionEditor({
  election,
  electionId,
  hasVoters,
  hasVotes,
  isClosed,
  onRefresh,
}: {
  election: ElectionFull;
  electionId: string;
  hasVoters: boolean;
  hasVotes: boolean;
  isClosed: boolean;
  onRefresh: () => void;
}) {
  const [showMap, setShowMap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canAdd = !hasVotes && !isClosed;
  const canRemove = !hasVoters && !isClosed;

  const existingRegions: DrawnRegion[] = election.regions.map((r) => ({
    name: r.name,
    geometry: r.geometry,
    bufferMeters: r.bufferMeters,
  }));

  async function handleAddRegion(region: DrawnRegion) {
    setSaving(true);
    try {
      let geometry;
      try { geometry = JSON.parse(region.geometry); } catch { geometry = region.geometry; }
      const res = await fetch(`/api/elections/${electionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addRegion: { name: region.name, geometry, bufferMeters: region.bufferMeters } }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to add region");
      } else {
        toast.success("Region added");
        onRefresh();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveRegion(regionId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/elections/${electionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeRegion: regionId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to remove region");
      } else {
        toast.success("Region removed");
        setConfirmDelete(null);
        onRefresh();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  function handleRegionsChange(regions: DrawnRegion[]) {
    if (regions.length > existingRegions.length) {
      const newRegion = regions[regions.length - 1];
      handleAddRegion(newRegion);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Regions
            {election.regions.length > 0 && (
              <Badge variant="secondary" className="text-xs">{election.regions.length}</Badge>
            )}
          </CardTitle>
          {canAdd && (
            <Button size="sm" variant="outline" onClick={() => setShowMap(!showMap)}>
              {showMap ? (
                <><X className="h-3 w-3 mr-1" /> Close Map</>
              ) : (
                <><Plus className="h-3 w-3 mr-1" /> Add Region</>
              )}
            </Button>
          )}
          {!canAdd && (
            <LockedBadge reason={hasVotes ? "Locked during voting" : "Election closed"} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {election.regions.length > 0 && (
          <div className="space-y-2">
            {election.regions.map((region) => {
              let geoInfo = "";
              try {
                const geo = JSON.parse(region.geometry);
                if (geo.type === "circle") geoInfo = `Circle · ${Math.round(geo.radius)}m radius`;
                else if (geo.type === "polygon") geoInfo = `Polygon · ${geo.coordinates.length} points`;
                else if (geo.type === "rectangle") geoInfo = "Rectangle";
              } catch { /* invalid geometry */ }

              return (
                <div key={region.id} className="flex items-center justify-between border rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{region.name}</p>
                    <p className="text-xs text-muted-foreground">{geoInfo} · Buffer: {region.bufferMeters}m</p>
                  </div>
                  {canRemove && (
                    confirmDelete === region.id ? (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="destructive" onClick={() => handleRemoveRegion(region.id)} disabled={saving}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button size="icon-sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setConfirmDelete(region.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}

        {election.regions.length === 0 && !showMap && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No regions defined. {election.requireLocation ? "Voters won't be able to register without a region." : "Location checking is disabled."}
          </p>
        )}

        {showMap && (
          <div className="border rounded-lg overflow-hidden" style={{ height: "500px" }}>
            <MapDraw
              regions={existingRegions}
              onRegionsChange={handleRegionsChange}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ──────────────────── Shared UI Components ────────────────────

function LockedBadge({ reason }: { reason: string }) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground" title={reason}>
      <Lock className="h-3 w-3" />
      <span>{reason}</span>
    </div>
  );
}

function EditableTextField({
  label,
  value,
  locked,
  lockReason,
  saving,
  onSave,
  multiline,
}: {
  label: string;
  value: string;
  locked: boolean;
  lockReason: string;
  saving: boolean;
  onSave: (val: string) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function startEdit() {
    setDraft(value);
    setEditing(true);
  }

  function handleSave() {
    if (draft.trim() !== value) {
      onSave(draft.trim());
    }
    setEditing(false);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        {locked && <LockedBadge reason={lockReason} />}
      </div>
      {editing ? (
        <div className="space-y-2">
          {multiline ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} />
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-3 w-3 mr-1" /> {saving ? "Saving..." : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div
          onClick={locked ? undefined : startEdit}
          className={`rounded-md border px-3 py-2 text-sm ${
            locked ? "bg-muted text-muted-foreground cursor-not-allowed" : "cursor-pointer hover:bg-slate-50 transition-colors"
          } ${!value ? "text-muted-foreground italic" : ""}`}
        >
          {value || "Click to add..."}
        </div>
      )}
    </div>
  );
}

function ToggleField({
  label,
  description,
  value,
  locked,
  lockReason,
  saving,
  onSave,
}: {
  label: string;
  description: string;
  value: boolean;
  locked: boolean;
  lockReason: string;
  saving: boolean;
  onSave: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">{label}</Label>
          {locked && <span title={lockReason}><Lock className="h-3 w-3 text-muted-foreground" /></span>}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        disabled={locked || saving}
        onClick={() => onSave(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        } ${value ? "bg-emerald-500" : "bg-gray-300"}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  locked,
  lockReason,
  saving,
  onSave,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  locked: boolean;
  lockReason: string;
  saving: boolean;
  onSave: (val: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        {locked && <LockedBadge reason={lockReason} />}
      </div>
      <select
        value={value}
        disabled={locked || saving}
        onChange={(e) => onSave(e.target.value)}
        className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
          locked ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
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
