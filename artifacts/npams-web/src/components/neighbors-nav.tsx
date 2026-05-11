import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetchJson } from "@/lib/api-fetch";

export type NeighborInfo = { id: string; title: string; subtitle?: string | null };
export type NeighborsData = {
  previous: NeighborInfo | null;
  next: NeighborInfo | null;
  position: number;
  total: number;
  in_context: boolean;
};

export function useNeighbors(
  endpoint: string | null,
  ctxStorageKey: string,
): { data: NeighborsData | null; loading: boolean; ctxNonce: string | null } {
  const ctxNonce = (() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    return sp.get("ctx");
  })();
  const [data, setData] = useState<NeighborsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!endpoint) return;
    let cancelled = false;
    setData(null);
    setLoading(true);
    let filters: Record<string, string> = {};
    if (ctxNonce) {
      try {
        const raw = sessionStorage.getItem(`${ctxStorageKey}_${ctxNonce}`);
        if (raw) filters = JSON.parse(raw) as Record<string, string>;
      } catch {
        // ignore
      }
    }
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    const qs = params.toString();
    apiFetchJson<NeighborsData>(`${endpoint}${qs ? `?${qs}` : ""}`)
      .then((r) => {
        if (cancelled) return;
        setData(r.ok && r.data ? r.data : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, ctxNonce, ctxStorageKey]);

  return { data, loading, ctxNonce };
}

interface NeighborsNavProps {
  data: NeighborsData | null;
  loading: boolean;
  onNavigate: (id: string) => void;
  noun: string;
}

export function NeighborsNav({ data, loading, onNavigate, noun }: NeighborsNavProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) return;
      }
      if (loading || !data) return;
      if (e.key === "ArrowLeft" && data.previous) {
        e.preventDefault();
        onNavigate(data.previous.id);
      } else if (e.key === "ArrowRight" && data.next) {
        e.preventDefault();
        onNavigate(data.next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, loading, onNavigate]);

  if (!loading && (!data || data.total === 0)) return null;

  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-3">
        <Button
          variant="outline"
          size="sm"
          disabled={loading || !data?.previous}
          onClick={() => data?.previous && onNavigate(data.previous.id)}
          className="h-auto py-2"
          title={data?.previous ? `Previous: ${data.previous.title}` : `No previous ${noun}`}
        >
          <ChevronLeft className="w-4 h-4 mr-2 shrink-0" />
          <div className="text-left min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Previous (←)</div>
            <div className="text-xs font-mono truncate max-w-[180px] mt-0.5">
              {data?.previous ? data.previous.title : "—"}
            </div>
            {data?.previous?.subtitle && (
              <div className="text-[11px] text-muted-foreground truncate max-w-[180px] leading-tight">
                {data.previous.subtitle}
              </div>
            )}
          </div>
        </Button>
        <div className="text-sm text-muted-foreground text-center">
          {loading ? (
            <span className="italic">Loading…</span>
          ) : data?.in_context ? (
            <>
              {Noun} <span className="font-semibold text-foreground">{data.position}</span> of{" "}
              <span className="font-semibold text-foreground">{data.total}</span>
            </>
          ) : (
            <span className="italic">Outside current filter</span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || !data?.next}
          onClick={() => data?.next && onNavigate(data.next.id)}
          className="h-auto py-2"
          title={data?.next ? `Next: ${data.next.title}` : `No next ${noun}`}
        >
          <div className="text-right min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Next (→)</div>
            <div className="text-xs font-mono truncate max-w-[180px] mt-0.5">
              {data?.next ? data.next.title : "—"}
            </div>
            {data?.next?.subtitle && (
              <div className="text-[11px] text-muted-foreground truncate max-w-[180px] leading-tight">
                {data.next.subtitle}
              </div>
            )}
          </div>
          <ChevronRight className="w-4 h-4 ml-2 shrink-0" />
        </Button>
      </CardContent>
    </Card>
  );
}
