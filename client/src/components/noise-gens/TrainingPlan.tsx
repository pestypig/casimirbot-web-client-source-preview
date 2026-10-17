import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock, RefreshCw, CheckCircle, Play, Layers, Info } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

type TrainStatus =
  | {
      epoch?: number;
      step?: number;
      loss?: number;
      status?: string;
      timestamp?: number;
      checkpoint?: string;
    }
  | null;

type TrainJob = {
  id: string;
  type: "dataset" | "train";
  state: string;
  message: string;
  progress?: { current: number; total: number };
};

const formatTime = (ts?: number) => {
  if (!ts || !Number.isFinite(ts)) return "—";
  const date = new Date(ts * 1000);
  return date.toLocaleString();
};

export function TrainingPlan() {
  const [status, setStatus] = useState<TrainStatus>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<"dataset" | "train" | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<TrainJob | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/train/status");
      if (resp.status === 404) {
        setStatus(null);
        setError(null);
      } else if (!resp.ok) {
        throw new Error(`status ${resp.status}`);
      } else {
        const json = await resp.json();
        setStatus(json);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, []);

  const callAction = async (url: string, action: "dataset" | "train" | "reset") => {
    setBusyAction(action === "reset" ? null : (action as "dataset" | "train"));
    try {
      const resp = await fetch(url, { method: "POST" });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const json = await resp.json().catch(() => ({}));
      if (json.jobId) {
        setJobId(json.jobId);
      }
      await fetchStatus();
      const label =
        action === "dataset"
          ? `Dataset build triggered${json.jobId ? ` (job ${json.jobId})` : ""}`
          : action === "train"
            ? `Training started${json.jobId ? ` (job ${json.jobId})` : ""}`
            : "Status reset";
      setInfo(label);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setInfo(null);
    } finally {
      setBusyAction(null);
    }
  };

  const badge = useMemo(() => {
    const s = status?.status?.toLowerCase();
    if (s === "completed") return { icon: <CheckCircle className="h-4 w-4 text-emerald-500" />, text: "Completed" };
    if (s === "running") return { icon: <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />, text: "Running" };
    if (s) return { icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, text: s };
    return null;
  }, [status]);

  const fetchJob = async (id: string) => {
    try {
      const resp = await fetch(`/api/train/job/${id}`);
      if (resp.status === 404) {
        setJob(null);
        return;
      }
      const json = (await resp.json()) as TrainJob;
      setJob(json);
    } catch {
      // ignore polling errors
    }
  };

  useEffect(() => {
    if (!jobId) return;
    fetchJob(jobId);
    const id = setInterval(() => fetchJob(jobId), 4000);
    return () => clearInterval(id);
  }, [jobId]);

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">Training Plan</CardTitle>
        <Button variant="ghost" size="sm" onClick={fetchStatus} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="text-muted-foreground">
          1) Upload/select knowledge audio → build dataset<br />
          2) Run spectral adapter training script<br />
          3) Check status here → load checkpoint into MusicGen server
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => callAction("/api/train/dataset", "dataset")}
            disabled={busyAction !== null}
            className="gap-2"
          >
            <Layers className="h-4 w-4" />
            Build dataset
          </Button>
          <Button
            size="sm"
            onClick={() => callAction("/api/train/start", "train")}
            disabled={busyAction !== null}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            Start training
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => callAction("/api/train/status/reset", "reset")}
            disabled={busyAction !== null}
          >
            Reset status
          </Button>
        </div>

        {error && (
          <div className="text-sm text-amber-600 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}
        {info && (
          <div className="text-sm text-emerald-600 flex items-center gap-2">
            <Info className="h-4 w-4" />
            {info}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400" />
          <span className="text-xs text-slate-500">Last update: {formatTime(status?.timestamp)}</span>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-1 text-xs">
          <div className="flex items-center gap-2 font-semibold">
            <span>Status:</span>
            {badge ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border text-slate-700">
                {badge.icon}
                {badge.text}
              </span>
            ) : (
              <span className="text-slate-500">No status yet</span>
            )}
          </div>
          <div>Epoch: {status?.epoch ?? "—"}</div>
          <div>Step: {status?.step ?? "—"}</div>
          <div>Loss: {status?.loss ?? "—"}</div>
          <div>Checkpoint: {status?.checkpoint ?? "—"}</div>
          {job ? (
            <div className="mt-2 space-y-0.5">
              <div className="font-semibold">Current job ({job.type}):</div>
              <div>State: {job.state}</div>
              <div>Message: {job.message}</div>
              {job.progress ? (
                <div>
                  Progress: {job.progress.current}/{job.progress.total}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
