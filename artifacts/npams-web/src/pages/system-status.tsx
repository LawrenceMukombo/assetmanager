import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-fetch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ServerCog, Database, ShieldCheck, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";

type StatusData = {
  api: { status: string; uptime_seconds: number };
  database: { status: string; latency_ms: number | null };
  environment: string;
  backups: { provider: string; cadence: string; last_known_snapshot_at: string | null; notes: string };
  data_retention: Record<string, string>;
  disaster_recovery: {
    rpo_minutes: number;
    rto_hours: number;
    procedure: string[];
    contacts: string[];
  };
  monitoring: { health_endpoint: string; log_aggregation: string; alerting: string };
};

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SystemStatusPage() {
  const { data, isLoading, error } = useQuery<StatusData>({
    queryKey: ["system-status"],
    queryFn: async () => {
      const r = await apiFetchJson<StatusData>("/api/v1/system/status");
      if (!r.ok) throw new Error(r.message);
      return r.data!;
    },
    refetchInterval: 30000,
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (error || !data) return <div className="p-6 text-destructive">Failed to load system status.</div>;

  const apiOk = data.api.status === "ok";
  const dbOk = data.database.status === "ok";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ServerCog className="w-6 h-6" /> System Status
        </h1>
        <p className="text-sm text-muted-foreground">Operational health, backups and disaster recovery posture.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> API Service</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {apiOk ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertTriangle className="w-5 h-5 text-red-600" />}
              <span className="text-xl font-semibold">{apiOk ? "Operational" : "Degraded"}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Uptime: {formatUptime(data.api.uptime_seconds)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> Database</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {dbOk ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertTriangle className="w-5 h-5 text-red-600" />}
              <span className="text-xl font-semibold">{dbOk ? "Connected" : "Unreachable"}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Latency: {data.database.latency_ms != null ? `${data.database.latency_ms} ms` : "n/a"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Environment</CardDescription></CardHeader>
          <CardContent>
            <Badge variant={data.environment === "production" ? "default" : "outline"} className="text-sm">
              {data.environment}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="w-5 h-5" /> Backups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Provider:</span> {data.backups.provider}</div>
          <div><span className="text-muted-foreground">Cadence:</span> {data.backups.cadence}</div>
          <div><span className="text-muted-foreground">Last known snapshot:</span> {data.backups.last_known_snapshot_at ?? "Managed by platform"}</div>
          <p className="text-muted-foreground italic">{data.backups.notes}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data retention</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {Object.entries(data.data_retention).map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Disaster recovery plan</CardTitle>
          <CardDescription>
            RPO: {data.disaster_recovery.rpo_minutes} minutes · RTO: {data.disaster_recovery.rto_hours} hours
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="font-medium mb-1">Recovery procedure</div>
            <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
              {data.disaster_recovery.procedure.map((step, i) => (
                <li key={i}>{step.replace(/^\d+\.\s*/, "")}</li>
              ))}
            </ol>
          </div>
          <div>
            <div className="font-medium mb-1">Escalation contacts</div>
            <ul className="list-disc pl-5 text-muted-foreground">
              {data.disaster_recovery.contacts.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monitoring</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div><span className="text-muted-foreground">Health endpoint:</span> <code className="font-mono text-xs">{data.monitoring.health_endpoint}</code></div>
          <div><span className="text-muted-foreground">Log aggregation:</span> {data.monitoring.log_aggregation}</div>
          <div><span className="text-muted-foreground">Alerting:</span> {data.monitoring.alerting}</div>
        </CardContent>
      </Card>
    </div>
  );
}
