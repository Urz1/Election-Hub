"use client";

import { useEffect, useState, use, useCallback } from "react";
import { Vote, Mail, MapPin, Check, ArrowRight, Loader2, Clock } from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface PositionInfo {
  id: string;
  title: string;
  description: string;
  candidates: { id: string; name: string; description: string; photoUrl?: string }[];
}

interface ElectionInfo {
  id: string;
  title: string;
  description: string;
  organizerName: string;
  phase: string;
  registrationStart: string | null;
  registrationEnd: string | null;
  votingStart: string | null;
  votingEnd: string | null;
  requireLocation: boolean;
  allowVoteUpdate: boolean;
  showLiveResults: boolean;
  resultsVisibility: string;
  securityLevel: string;
  positions: PositionInfo[];
  regions: { id: string; name: string; geometry: string; bufferMeters: number }[];
  customFields: { id: string; label: string; fieldType: string; isRequired: boolean; options: string[] }[];
}

interface ResultsPosition {
  id: string;
  title: string;
  totalVotes: number;
  currentVote: string | null;
  candidates: { id: string; name: string; photoUrl?: string; votes: number; percentage: number }[];
}

type VoterStep = "loading" | "info" | "register" | "verify" | "vote" | "done" | "results" | "closed" | "registered_waiting" | "error";

export default function VoterPage({ params }: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = use(params);
  const [election, setElection] = useState<ElectionInfo | null>(null);
  const [step, setStep] = useState<VoterStep>("loading");
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [voterId, setVoterId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [devCode, setDevCode] = useState("");
  // votes: positionId -> candidateId
  const [selectedVotes, setSelectedVotes] = useState<Record<string, string>>({});
  const [resultsData, setResultsData] = useState<ResultsPosition[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/vote/${shareCode}`)
      .then((res) => {
        if (!res.ok) throw new Error("Election not found");
        return res.json();
      })
      .then((data: ElectionInfo) => {
        setElection(data);
        const stored = sessionStorage.getItem(`voter_${data.id}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          setVoterId(parsed.voterId);
          if (parsed.email) setEmail(parsed.email);

          if (data.phase === "voting") {
            setStep("vote");
          } else if (data.phase === "closed") {
            setStep("closed");
          } else if (data.phase === "registration" || data.phase === "between_phases") {
            setStep("registered_waiting");
          } else {
            setStep("info");
          }
        } else {
          if (data.phase === "registration") {
            setStep("info");
          } else if (data.phase === "closed") {
            setStep("closed");
          } else {
            setStep("info");
          }
        }
      })
      .catch(() => {
        setError("Election not found");
        setStep("error");
      });
  }, [shareCode]);

  // Poll for phase changes when voter is waiting for voting to start
  useEffect(() => {
    if (step !== "registered_waiting") return;

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/vote/${shareCode}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.phase === "voting") {
          setElection(data);
          setStep("vote");
          toast.success("Voting has started! You can cast your vote now.");
        } else if (data.phase === "closed") {
          setElection(data);
          setStep("closed");
        }
      } catch { /* ignore */ }
    }, 4000);

    return () => clearInterval(poll);
  }, [step, shareCode]);

  const fetchResults = useCallback(async () => {
    if (!election) return;
    const res = await fetch(`/api/vote/${shareCode}/results?voterId=${voterId}`);
    if (res.ok) {
      const data = await res.json();
      setResultsData(data.positions);
    }
  }, [shareCode, voterId, election]);

  async function handleRegister() {
    if (!election) return;
    setSubmitting(true);

    let latitude: number | undefined;
    let longitude: number | undefined;

    if (election.requireLocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          });
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch {
        toast.error("Location access is required for this election");
        setSubmitting(false);
        return;
      }
    }

    let fingerprint: string | undefined;
    if (election.securityLevel !== "casual") {
      try {
        const FingerprintJS = (await import("@fingerprintjs/fingerprintjs")).default;
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        fingerprint = result.visitorId;
      } catch {
        // continue without fingerprint
      }
    }

    try {
      const res = await fetch(`/api/vote/${shareCode}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          customFieldValues: customValues,
          deviceFingerprint: fingerprint,
          latitude,
          longitude,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setVoterId(data.voterId);
        sessionStorage.setItem(`voter_${election.id}`, JSON.stringify({ voterId: data.voterId, email }));
        if (data.emailVerified) {
          if (election.phase === "voting") {
            setStep("vote");
          } else {
            setStep("registered_waiting");
          }
          toast.info("You're already registered!");
        } else {
          setStep("verify");
        }
        return;
      }

      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      setVoterId(data.voterId);
      if (data.devCode) setDevCode(data.devCode);
      sessionStorage.setItem(`voter_${election.id}`, JSON.stringify({ voterId: data.voterId, email }));
      setStep("verify");
      toast.success("Registration successful! Check your email for the code.");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/vote/${shareCode}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId, code: verificationCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      toast.success("Email verified!");
      if (election?.phase === "voting") {
        setStep("vote");
      } else {
        setStep("registered_waiting");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVote() {
    if (!election) return;

    const missingPositions = election.positions.filter((p) => !selectedVotes[p.id]);
    if (missingPositions.length > 0) {
      toast.error(`Please select a candidate for: ${missingPositions.map((p) => p.title).join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      const votes = Object.entries(selectedVotes).map(([positionId, candidateId]) => ({
        positionId,
        candidateId,
      }));

      const res = await fetch(`/api/vote/${shareCode}/cast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId, votes }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      toast.success(data.updated ? "Votes updated!" : "Votes cast successfully!");
      setStep("done");
      if (election.showLiveResults) {
        fetchResults();
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <Vote className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Not Found</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!election) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-2">
          <Vote className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm truncate">{election.title}</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-4">
        {step === "info" && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">{election.title}</CardTitle>
              {election.description && (
                <CardDescription className="mt-2">{election.description}</CardDescription>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Organized by {election.organizerName}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <PhaseInfo election={election} />
              {election.positions.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Positions to vote for:</p>
                  {election.positions.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 py-1">
                      <Vote className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{p.title}</span>
                      <span className="text-xs">({p.candidates.length} candidates)</span>
                    </div>
                  ))}
                </div>
              )}
              {election.phase === "registration" && (
                <Button className="w-full" onClick={() => setStep("register")}>
                  Register to Vote
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {election.phase === "voting" && (
                <p className="text-sm text-center text-muted-foreground bg-amber-50 rounded-md px-3 py-2">
                  Registration is closed. Only pre-registered voters can vote.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {step === "register" && (
          <Card>
            <CardHeader>
              <CardTitle>Register</CardTitle>
              <CardDescription>Fill in your details to participate</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              {election.customFields.map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label>
                    {field.label} {field.isRequired && "*"}
                  </Label>
                  {field.fieldType === "image" ? (
                    <ImageUpload
                      value={customValues[field.id] || undefined}
                      onChange={(url) => setCustomValues({ ...customValues, [field.id]: url })}
                      onRemove={() => {
                        const updated = { ...customValues };
                        delete updated[field.id];
                        setCustomValues(updated);
                      }}
                    />
                  ) : field.fieldType === "dropdown" ? (
                    <Select
                      value={customValues[field.id] || ""}
                      onValueChange={(v) => setCustomValues({ ...customValues, [field.id]: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Select ${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={field.fieldType === "phone" ? "tel" : field.fieldType === "number" ? "number" : "text"}
                      value={customValues[field.id] || ""}
                      onChange={(e) => setCustomValues({ ...customValues, [field.id]: e.target.value })}
                      placeholder={field.label}
                      required={field.isRequired}
                    />
                  )}
                </div>
              ))}

              {election.requireLocation && (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-md px-3 py-2">
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <span>This election requires location verification.</span>
                </div>
              )}

              <Button className="w-full" onClick={handleRegister} disabled={submitting || !email}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {submitting ? "Registering..." : "Register"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep("info")}>Back</Button>
            </CardContent>
          </Card>
        )}

        {step === "verify" && (
          <Card>
            <CardHeader className="text-center">
              <Mail className="h-10 w-10 text-primary mx-auto mb-2" />
              <CardTitle>Check Your Email</CardTitle>
              <CardDescription>
                We sent a 6-digit code to <strong>{email}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {devCode && (
                <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-sm">
                  <span className="font-medium text-amber-700">Dev mode:</span>{" "}
                  <code className="font-mono">{devCode}</code>
                </div>
              )}
              <Input
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="text-center text-2xl tracking-[0.5em] font-mono"
                maxLength={6}
              />
              <Button
                className="w-full"
                onClick={handleVerify}
                disabled={submitting || verificationCode.length !== 6}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Verify
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "vote" && (
          <>
            <div className="text-center mb-2">
              <h2 className="text-xl font-bold">Cast Your Votes</h2>
              <p className="text-sm text-muted-foreground">Select one candidate for each position</p>
            </div>

            {election.positions.map((pos) => (
              <Card key={pos.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{pos.title}</CardTitle>
                  {pos.description && (
                    <CardDescription className="text-xs">{pos.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {pos.candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedVotes({ ...selectedVotes, [pos.id]: c.id })}
                      className={`w-full text-left rounded-lg border-2 p-3 transition-all ${
                        selectedVotes[pos.id] === c.id
                          ? "border-primary bg-primary/5"
                          : "border-transparent bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            selectedVotes[pos.id] === c.id ? "border-primary bg-primary" : "border-slate-300"
                          }`}
                        >
                          {selectedVotes[pos.id] === c.id && <Check className="h-3 w-3 text-white" />}
                        </div>
                        {c.photoUrl ? (
                          <img src={c.photoUrl} alt={c.name} className="h-10 w-10 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-slate-500 flex-shrink-0">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{c.name}</p>
                          {c.description && (
                            <p className="text-xs text-muted-foreground truncate">{c.description}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            ))}

            <Button
              className="w-full"
              size="lg"
              onClick={handleVote}
              disabled={submitting || Object.keys(selectedVotes).length !== election.positions.length}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {submitting ? "Submitting..." : `Submit All Votes (${Object.keys(selectedVotes).length}/${election.positions.length})`}
            </Button>
            {election.allowVoteUpdate && (
              <p className="text-xs text-center text-muted-foreground">
                You can change your votes anytime before voting closes
              </p>
            )}
          </>
        )}

        {step === "done" && (
          <Card className="text-center">
            <CardContent className="pt-8 pb-8 space-y-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold">Votes Submitted!</h2>
              <p className="text-muted-foreground">
                Your votes for all {election.positions.length} position{election.positions.length > 1 ? "s" : ""} have been recorded.
              </p>
              {election.allowVoteUpdate && (
                <Button variant="outline" onClick={() => setStep("vote")}>Change My Votes</Button>
              )}
              {election.showLiveResults && (
                <Button variant="outline" onClick={() => { fetchResults(); setStep("results"); }}>
                  View Results
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {step === "results" && resultsData.length > 0 && (
          <>
            <div className="text-center mb-2">
              <h2 className="text-xl font-bold">Results</h2>
            </div>
            {resultsData.map((pos) => (
              <Card key={pos.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{pos.title}</CardTitle>
                  <CardDescription className="text-xs">{pos.totalVotes} votes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pos.candidates.map((c) => (
                    <div key={c.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {c.photoUrl ? (
                            <img src={c.photoUrl} alt={c.name} className="h-6 w-6 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-500 flex-shrink-0">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium">
                            {c.name}
                            {pos.currentVote === c.id && (
                              <Badge variant="secondary" className="ml-2 text-xs">Your vote</Badge>
                            )}
                          </span>
                        </div>
                        <span className="text-muted-foreground">
                          {c.votes} ({c.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <Progress value={c.percentage} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
            <Button variant="outline" className="w-full" onClick={() => setStep("done")}>Back</Button>
          </>
        )}

        {step === "registered_waiting" && <RegisteredWaiting election={election!} />}

        {step === "closed" && (
          <Card className="text-center">
            <CardContent className="pt-8 pb-8 space-y-4">
              <Vote className="h-12 w-12 text-muted-foreground mx-auto" />
              <h2 className="text-xl font-semibold">Election Closed</h2>
              <p className="text-muted-foreground">This election has ended.</p>
              {(election.resultsVisibility === "public" ||
                (election.resultsVisibility === "voters" && voterId)) && (
                <Button variant="outline" onClick={() => { fetchResults(); setStep("results"); }}>
                  View Results
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function RegisteredWaiting({ election }: { election: ElectionInfo }) {
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!election.votingStart) return;
    const target = new Date(election.votingStart).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setCountdown("Starting any moment..."); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h > 0 ? `${h}h ` : ""}${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [election.votingStart]);

  return (
    <Card className="text-center">
      <CardContent className="pt-8 pb-8 space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">You&apos;re Registered!</h2>
        <p className="text-muted-foreground">
          Your registration is confirmed. This page will automatically take you to the ballot when voting opens.
        </p>
        {election.votingStart && (
          <div className="bg-blue-50 rounded-lg p-4 space-y-1">
            <div className="flex items-center justify-center gap-2 text-blue-700 font-medium">
              <Clock className="h-4 w-4" />
              Voting starts in
            </div>
            <p className="text-2xl font-bold text-blue-800">{countdown || "Calculating..."}</p>
            <p className="text-xs text-blue-600">
              {new Date(election.votingStart).toLocaleString()}
            </p>
          </div>
        )}
        {!election.votingStart && (
          <p className="text-sm text-muted-foreground">
            The organizer hasn&apos;t set a voting start time yet. Stay on this page — it will refresh automatically.
          </p>
        )}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking for updates...
        </div>
      </CardContent>
    </Card>
  );
}

function PhaseInfo({ election }: { election: ElectionInfo }) {
  const phaseMessages: Record<string, { label: string; color: string; message: string }> = {
    draft: { label: "Draft", color: "bg-gray-100 text-gray-700", message: "This election hasn't been published yet." },
    before_registration: { label: "Upcoming", color: "bg-blue-100 text-blue-700", message: `Registration opens ${election.registrationStart ? new Date(election.registrationStart).toLocaleString() : "soon"}.` },
    registration: { label: "Registration Open", color: "bg-green-100 text-green-700", message: `Registration closes ${election.registrationEnd ? new Date(election.registrationEnd).toLocaleString() : "when the organizer decides"}.` },
    between_phases: { label: "Registration Closed", color: "bg-yellow-100 text-yellow-700", message: `Voting opens ${election.votingStart ? new Date(election.votingStart).toLocaleString() : "soon"}.` },
    voting: { label: "Voting Open", color: "bg-emerald-100 text-emerald-700", message: `Voting closes ${election.votingEnd ? new Date(election.votingEnd).toLocaleString() : "when the organizer decides"}.` },
    closed: { label: "Closed", color: "bg-red-100 text-red-700", message: "This election has ended." },
  };
  const info = phaseMessages[election.phase] || phaseMessages.draft;
  return (
    <div className="text-center space-y-2">
      <Badge className={info.color} variant="secondary">{info.label}</Badge>
      <p className="text-sm text-muted-foreground">{info.message}</p>
    </div>
  );
}
