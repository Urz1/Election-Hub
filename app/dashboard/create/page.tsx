"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Plus, Trash2, ArrowLeft, ArrowRight, Check, Users, AlertCircle } from "lucide-react";
import { LogoIcon } from "@/components/logo";
import { ImageUpload } from "@/components/image-upload";
import { validateElectionTimes } from "@/lib/time-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { DrawnRegion } from "@/components/map-draw";

const MapDraw = dynamic(() => import("@/components/map-draw"), { ssr: false });

interface CandidateInput {
  name: string;
  description: string;
  photoUrl?: string;
}

interface PositionInput {
  title: string;
  description: string;
  candidates: CandidateInput[];
}

interface CustomFieldInput {
  label: string;
  fieldType: "text" | "number" | "dropdown" | "phone" | "image";
  isRequired: boolean;
  options: string[];
}

const STEPS = ["Basic Info", "Positions & Candidates", "Regions", "Voter Fields", "Settings", "Review"];

export default function CreateElectionPage() {
  const { status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [positions, setPositions] = useState<PositionInput[]>([
    {
      title: "",
      description: "",
      candidates: [
        { name: "", description: "", photoUrl: undefined },
        { name: "", description: "", photoUrl: undefined },
      ],
    },
  ]);
  const [regions, setRegions] = useState<DrawnRegion[]>([]);
  const [requireLocation, setRequireLocation] = useState(false);
  const [customFields, setCustomFields] = useState<CustomFieldInput[]>([]);
  const [registrationStart, setRegistrationStart] = useState("");
  const [registrationEnd, setRegistrationEnd] = useState("");
  const [votingStart, setVotingStart] = useState("");
  const [votingEnd, setVotingEnd] = useState("");
  const [securityLevel, setSecurityLevel] = useState<"casual" | "standard" | "strict">("standard");
  const [allowVoteUpdate, setAllowVoteUpdate] = useState(false);
  const [showLiveResults, setShowLiveResults] = useState(false);
  const [resultsVisibility, setResultsVisibility] = useState<"organizer" | "voters" | "public">("organizer");
  const [autoTransition, setAutoTransition] = useState(true);

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  function updatePosition(index: number, field: keyof PositionInput, value: string) {
    setPositions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function updateCandidate(posIndex: number, candIndex: number, field: keyof CandidateInput, value: string) {
    setPositions(prev => {
      const updated = [...prev];
      const candidates = [...updated[posIndex].candidates];
      candidates[candIndex] = { ...candidates[candIndex], [field]: value };
      updated[posIndex] = { ...updated[posIndex], candidates };
      return updated;
    });
  }

  function addCandidate(posIndex: number) {
    setPositions(prev => {
      const updated = [...prev];
      updated[posIndex] = {
        ...updated[posIndex],
        candidates: [...updated[posIndex].candidates, { name: "", description: "", photoUrl: undefined }],
      };
      return updated;
    });
  }

  function removeCandidate(posIndex: number, candIndex: number) {
    setPositions(prev => {
      const updated = [...prev];
      updated[posIndex] = {
        ...updated[posIndex],
        candidates: updated[posIndex].candidates.filter((_, i) => i !== candIndex),
      };
      return updated;
    });
  }

  function addPosition() {
    setPositions(prev => [
      ...prev,
      { title: "", description: "", candidates: [{ name: "", description: "", photoUrl: undefined }, { name: "", description: "", photoUrl: undefined }] },
    ]);
  }

  function removePosition(index: number) {
    setPositions(prev => prev.filter((_, i) => i !== index));
  }

  const timeErrors = (() => {
    const hasAnyTime = registrationStart || registrationEnd || votingStart || votingEnd;
    if (!hasAnyTime) return [];
    const result = validateElectionTimes({
      registrationStart: registrationStart || undefined,
      registrationEnd: registrationEnd || undefined,
      votingStart: votingStart || undefined,
      votingEnd: votingEnd || undefined,
    });
    return result.errors;
  })();

  function canProceed(): boolean {
    if (step === 0) return title.trim().length > 0;
    if (step === 1) {
      return positions.every(
        (p) => p.title.trim().length > 0 && p.candidates.filter((c) => c.name.trim()).length >= 2
      );
    }
    if (step === 4) return timeErrors.length === 0;
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/elections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          positions: positions.map((p) => ({
            title: p.title,
            description: p.description || undefined,
            candidates: p.candidates
              .filter((c) => c.name.trim())
              .map((c) => ({ name: c.name, description: c.description || undefined, photoUrl: c.photoUrl || undefined })),
          })),
          regions: regions.length > 0 ? regions : undefined,
          customFields: customFields.length > 0
            ? customFields.map((f) => ({
                label: f.label,
                fieldType: f.fieldType,
                isRequired: f.isRequired,
                options: f.options.filter((o) => o.trim()),
              }))
            : undefined,
          registrationStart: registrationStart || undefined,
          registrationEnd: registrationEnd || undefined,
          votingStart: votingStart || undefined,
          votingEnd: votingEnd || undefined,
          securityLevel,
          allowVoteUpdate,
          showLiveResults,
          resultsVisibility,
          requireLocation,
          autoTransition,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to create election");
        return;
      }

      const election = await res.json();
      toast.success("Election created!");
      router.push(`/dashboard/${election.id}`);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
          <div className="flex items-center gap-2">
            <LogoIcon size={24} />
            <span className="font-semibold">Create Election</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 pb-24">
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <button
              key={s}
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : <span>{i + 1}</span>}
              {s}
            </button>
          ))}
        </div>

        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Give your election a title and description</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Election Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Student Council Election 2026"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the election..."
                  className="w-full min-h-[100px] px-3 py-2 rounded-md border text-sm resize-y"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <div className="space-y-6">
            {positions.map((pos, pi) => (
              <Card key={pi}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                        {pi + 1}
                      </div>
                      <div>
                        <CardTitle className="text-lg">Position {pi + 1}</CardTitle>
                        <CardDescription>Define the role and its candidates</CardDescription>
                      </div>
                    </div>
                    {positions.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removePosition(pi)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Position Title *</Label>
                      <Input
                        value={pos.title}
                        onChange={(e) => updatePosition(pi, "title", e.target.value)}
                        placeholder="e.g., President"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input
                        value={pos.description}
                        onChange={(e) => updatePosition(pi, "description", e.target.value)}
                        placeholder="Optional description of this role"
                      />
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">Candidates for {pos.title || `Position ${pi + 1}`}</Label>
                    </div>
                    <div className="space-y-2">
                      {pos.candidates.map((cand, ci) => (
                        <div key={ci} className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">
                            {ci + 1}
                          </div>
                          <ImageUpload
                            value={cand.photoUrl}
                            onChange={(url) => {
                              setPositions(prev => {
                                const updated = [...prev];
                                const candidates = [...updated[pi].candidates];
                                candidates[ci] = { ...candidates[ci], photoUrl: url };
                                updated[pi] = { ...updated[pi], candidates };
                                return updated;
                              });
                            }}
                            onRemove={() => {
                              setPositions(prev => {
                                const updated = [...prev];
                                const candidates = [...updated[pi].candidates];
                                candidates[ci] = { ...candidates[ci], photoUrl: undefined };
                                updated[pi] = { ...updated[pi], candidates };
                                return updated;
                              });
                            }}
                            compact
                          />
                          <Input
                            value={cand.name}
                            onChange={(e) => updateCandidate(pi, ci, "name", e.target.value)}
                            placeholder={`Candidate ${ci + 1} name`}
                            className="flex-1"
                          />
                          <Input
                            value={cand.description}
                            onChange={(e) => updateCandidate(pi, ci, "description", e.target.value)}
                            placeholder="Bio (optional)"
                            className="flex-1"
                          />
                          {pos.candidates.length > 2 && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removeCandidate(pi, ci)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => addCandidate(pi)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Candidate
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button variant="outline" className="w-full border-dashed" onClick={addPosition}>
              <Plus className="h-4 w-4 mr-2" />
              Add Another Position
            </Button>
          </div>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Regions</CardTitle>
              <CardDescription>
                Draw regions on the map to restrict where voters can register from.
                Skip this step if location doesn&apos;t matter.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={requireLocation} onCheckedChange={setRequireLocation} />
                <Label>Require location verification for voters</Label>
              </div>
              <MapDraw regions={regions} onRegionsChange={setRegions} />
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Voter Registration Fields</CardTitle>
              <CardDescription>
                Email is always collected. Add any extra fields you need from voters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                Email (always required)
              </div>
              {customFields.map((f, i) => (
                <div key={i} className="flex items-start gap-2 border rounded-md p-3">
                  <div className="flex-1 space-y-2">
                    <Input
                      value={f.label}
                      onChange={(e) => {
                        const updated = [...customFields];
                        updated[i] = { ...updated[i], label: e.target.value };
                        setCustomFields(updated);
                      }}
                      placeholder="Field label (e.g., Full Name)"
                    />
                    <div className="flex gap-2">
                      <Select
                        value={f.fieldType}
                        onValueChange={(v) => {
                          const updated = [...customFields];
                          updated[i] = { ...updated[i], fieldType: v as CustomFieldInput["fieldType"] };
                          setCustomFields(updated);
                        }}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="dropdown">Dropdown</SelectItem>
                          <SelectItem value="phone">Phone</SelectItem>
                          <SelectItem value="image">Image Upload</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={f.isRequired}
                          onCheckedChange={(v) => {
                            const updated = [...customFields];
                            updated[i] = { ...updated[i], isRequired: v };
                            setCustomFields(updated);
                          }}
                        />
                        <span className="text-sm">Required</span>
                      </div>
                    </div>
                    {f.fieldType === "dropdown" && (
                      <Input
                        value={f.options.join(", ")}
                        onChange={(e) => {
                          const updated = [...customFields];
                          updated[i] = { ...updated[i], options: e.target.value.split(",").map((o) => o.trim()) };
                          setCustomFields(updated);
                        }}
                        placeholder="Options (comma-separated): e.g., Section A, Section B, Section C"
                      />
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setCustomFields(customFields.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() => setCustomFields([...customFields, { label: "", fieldType: "text", isRequired: false, options: [] }])}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Field
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Settings & Timing</CardTitle>
              <CardDescription>Configure when the election runs and how it behaves</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Registration Opens</Label>
                  {!autoTransition && <p className="text-xs text-muted-foreground">Optional — you can start it manually</p>}
                  <Input
                    type="datetime-local"
                    value={registrationStart}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={(e) => setRegistrationStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Registration Closes</Label>
                  <p className="text-xs text-muted-foreground">Registration closes automatically at this time</p>
                  <Input
                    type="datetime-local"
                    value={registrationEnd}
                    min={registrationStart || new Date().toISOString().slice(0, 16)}
                    onChange={(e) => setRegistrationEnd(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Voting Opens</Label>
                  {!autoTransition && <p className="text-xs text-muted-foreground">Optional — you can start it manually</p>}
                  <Input
                    type="datetime-local"
                    value={votingStart}
                    min={registrationEnd || registrationStart || new Date().toISOString().slice(0, 16)}
                    onChange={(e) => setVotingStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Voting Closes</Label>
                  <p className="text-xs text-muted-foreground">Voting closes automatically at this time</p>
                  <Input
                    type="datetime-local"
                    value={votingEnd}
                    min={votingStart || registrationEnd || new Date().toISOString().slice(0, 16)}
                    onChange={(e) => setVotingEnd(e.target.value)}
                  />
                </div>
              </div>
              {timeErrors.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1">
                  {timeErrors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-red-700">
                      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-start phases on schedule</Label>
                  <p className="text-xs text-muted-foreground">
                    {autoTransition
                      ? "Registration and voting start automatically at the scheduled times. Phases close at their end times."
                      : "You manually open registration and voting from the dashboard. Phases still close automatically at their end times."}
                  </p>
                </div>
                <Switch checked={autoTransition} onCheckedChange={setAutoTransition} />
              </div>
              <div className="space-y-2">
                <Label>Security Level</Label>
                <Select value={securityLevel} onValueChange={(v) => setSecurityLevel(v as typeof securityLevel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casual">Casual — Email only</SelectItem>
                    <SelectItem value="standard">Standard — Email + device fingerprint</SelectItem>
                    <SelectItem value="strict">Strict — Email + fingerprint + stricter checks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Results Visibility (after election closes)</Label>
                <Select value={resultsVisibility} onValueChange={(v) => setResultsVisibility(v as typeof resultsVisibility)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organizer">Organizer only</SelectItem>
                    <SelectItem value="voters">Registered voters</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Allow vote updates</Label>
                    <p className="text-xs text-muted-foreground">Voters can change their vote within the voting window</p>
                  </div>
                  <Switch checked={allowVoteUpdate} onCheckedChange={setAllowVoteUpdate} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show live results to voters</Label>
                    <p className="text-xs text-muted-foreground">Voters can see results while voting is open</p>
                  </div>
                  <Switch checked={showLiveResults} onCheckedChange={setShowLiveResults} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle>Review & Create</CardTitle>
              <CardDescription>Double check everything before publishing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ReviewItem label="Title" value={title} />
              <ReviewItem label="Description" value={description || "—"} />
              <div className="py-2 border-b">
                <span className="text-sm font-medium text-muted-foreground">Positions & Candidates</span>
                <div className="mt-2 space-y-2">
                  {positions.map((p, i) => (
                    <div key={i} className="bg-slate-50 rounded-md px-3 py-2 text-sm">
                      <span className="font-semibold">{p.title}</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {p.candidates.filter((c) => c.name.trim()).map((c, ci) => (
                          <span key={ci} className="inline-flex items-center gap-1.5 bg-white border rounded-full px-2 py-0.5 text-xs">
                            {c.photoUrl && (
                              <img src={c.photoUrl} alt={c.name} className="h-4 w-4 rounded-full object-cover" />
                            )}
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <ReviewItem label="Regions" value={regions.length > 0 ? regions.map((r) => r.name).join(", ") : "None (open to all)"} />
              <ReviewItem label="Location Required" value={requireLocation ? "Yes" : "No"} />
              <ReviewItem label="Custom Fields" value={customFields.length > 0 ? customFields.map((f) => f.label).join(", ") : "None"} />
              <ReviewItem label="Registration" value={registrationStart && registrationEnd ? `${new Date(registrationStart).toLocaleString()} — ${new Date(registrationEnd).toLocaleString()}` : "Not set (manual control)"} />
              <ReviewItem label="Voting" value={votingStart && votingEnd ? `${new Date(votingStart).toLocaleString()} — ${new Date(votingEnd).toLocaleString()}` : "Not set (manual control)"} />
              <ReviewItem label="Phase Transitions" value={autoTransition ? "Automatic (based on schedule)" : "Manual (organizer controls)"} />
              <ReviewItem label="Security" value={securityLevel} />
              <ReviewItem label="Vote Updates" value={allowVoteUpdate ? "Allowed" : "Not allowed"} />
              <ReviewItem label="Live Results" value={showLiveResults ? "Visible to voters" : "Hidden during voting"} />
              <ReviewItem label="Final Results" value={resultsVisibility} />
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between mt-6">
          <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Creating..." : "Create Election"}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start py-2 border-b last:border-0">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-sm text-right max-w-[60%]">{value}</span>
    </div>
  );
}
