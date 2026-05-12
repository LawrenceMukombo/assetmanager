import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetchJson } from "@/lib/api-fetch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Boxes, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Sparkline } from "@/components/sparkline";

type CategorySummary = {
  category: string | null;
  categoryKey: string;
  itemCount: number;
  totalQuantity: number;
  totalValue: string;
  burnRate30d: number;
  burnRate30dPrev: number;
  weeklyBurn: number[];
};

// How many top categories to surface on the dashboard. The Stock page itself
// shows the full list; the dashboard is meant to be a glanceable summary.
const TOP_N = 5;

export function StockCategoryTrends() {
  const [, setLocation] = useLocation();

  const { data: categorySummary, isLoading } = useQuery<CategorySummary[]>({
    queryKey: ["stock-category-summary"],
    queryFn: async () => {
      const r = await apiFetchJson<CategorySummary[]>(`/api/v1/stock/category-summary`);
      return r.data ?? [];
    },
    staleTime: 60_000,
  });

  // Surface the categories with the highest current consumption, falling back
  // to the previous-window burn so a category that just stopped moving still
  // appears (rather than getting pushed off by a freshly-active one with the
  // same burn). When both windows are zero we tie-break on on-hand value so
  // big-ticket categories stay visible.
  const topCategories = (categorySummary ?? [])
    .slice()
    .sort((a, b) => {
      if (b.burnRate30d !== a.burnRate30d) return b.burnRate30d - a.burnRate30d;
      if (b.burnRate30dPrev !== a.burnRate30dPrev) return b.burnRate30dPrev - a.burnRate30dPrev;
      return Number(b.totalValue) - Number(a.totalValue);
    })
    .slice(0, TOP_N);

  if (isLoading) return null;
  if (topCategories.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Boxes className="w-4 h-4" /> Stock Category Trends
        </CardTitle>
        <CardDescription>
          Top {topCategories.length} stock categories by 30-day consumption. Click a card to open
          the Stock page filtered to that category.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {topCategories.map((c) => {
            const label = c.category ?? "Uncategorised";
            const cur = c.burnRate30d;
            const prev = c.burnRate30dPrev;
            // Same delta semantics as the Stock page, kept consistent so a
            // director jumping between the two pages sees identical numbers.
            let deltaLabel: string;
            let deltaTone: "up" | "down" | "flat";
            if (prev === 0 && cur === 0) {
              deltaLabel = "no change";
              deltaTone = "flat";
            } else if (prev === 0) {
              deltaLabel = "new activity";
              deltaTone = "up";
            } else {
              const pct = ((cur - prev) / prev) * 100;
              const rounded = Math.round(pct);
              if (rounded === 0) {
                deltaLabel = "0% vs prev 30d";
                deltaTone = "flat";
              } else {
                deltaLabel = `${rounded > 0 ? "+" : ""}${rounded}% vs prev 30d`;
                deltaTone = rounded > 0 ? "up" : "down";
              }
            }
            // Rising consumption (up) is amber because it eats stock faster;
            // falling consumption (down) is green because it eases pressure.
            // Matches the colour scheme on the Stock page.
            const deltaClass =
              deltaTone === "up" ? "text-amber-600"
              : deltaTone === "down" ? "text-emerald-600"
              : "text-muted-foreground";
            const DeltaIcon = deltaTone === "up" ? TrendingUp : deltaTone === "down" ? TrendingDown : Minus;
            const sparkAria = `Weekly issued-out units for ${label}, last 8 weeks: ${c.weeklyBurn.join(", ")}`;
            return (
              <button
                key={c.categoryKey}
                type="button"
                onClick={() => setLocation(`/stock?category=${encodeURIComponent(c.categoryKey)}`)}
                className="text-left rounded-md border border-border p-3 transition hover:bg-muted/50 hover:shadow-sm"
                aria-label={`Open Stock page filtered to ${label}. 30-day burn ${cur}, ${deltaLabel}.`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm truncate">{label}</div>
                  <Badge variant="outline" className="shrink-0 text-[10px] px-1.5">
                    {c.itemCount}
                  </Badge>
                </div>
                <div className="mt-2 text-lg font-semibold leading-tight">
                  {cur.toLocaleString()}
                  <span className="text-xs font-normal text-muted-foreground"> / 30d</span>
                </div>
                <div className={`mt-0.5 text-xs flex items-center gap-1 ${deltaClass}`}>
                  <DeltaIcon className="w-3.5 h-3.5" />
                  <span>{deltaLabel}</span>
                </div>
                <div className="mt-2">
                  <Sparkline points={c.weeklyBurn} ariaLabel={sparkAria} width={140} height={28} />
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
