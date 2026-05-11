import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search, X, Clock, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiFetchJson } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";

type AssetHit = {
  id: string;
  assetTag: string;
  assetName: string;
  status?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
};

type AssetsListResponse = {
  items: AssetHit[];
  pagination?: { total: number };
};

const RECENT_KEY = "npams_recent_searches";
const MAX_RECENTS = 5;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string").slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  const q = query.trim();
  if (!q) return;
  const existing = loadRecents().filter((s) => s.toLowerCase() !== q.toLowerCase());
  const next = [q, ...existing].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}

function navWithSearchCtx(
  setLocation: (path: string) => void,
  assetId: string,
  query: string,
) {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  try {
    sessionStorage.setItem(
      `npams_assets_list_ctx_${nonce}`,
      JSON.stringify({ search: query }),
    );
  } catch {
    // ignore quota errors
  }
  setLocation(`/assets/${assetId}?ctx=${nonce}`);
}

export function GlobalSearch() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<AssetHit[] | null>(null);
  const [totalMatches, setTotalMatches] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecents(loadRecents());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debounced) {
      setResults(null);
      setTotalMatches(0);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    apiFetchJson<AssetsListResponse>(
      `/api/v1/assets?search=${encodeURIComponent(debounced)}&limit=8&page=1`,
    )
      .then((r) => {
        if (cancelled) return;
        if (r.ok && r.data) {
          setResults(r.data.items ?? []);
          setTotalMatches(r.data.pagination?.total ?? r.data.items?.length ?? 0);
        } else {
          setResults([]);
          setTotalMatches(0);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const showRecents = open && !query.trim() && recents.length > 0;
  const showResults = open && !!query.trim();

  const items = useMemo(() => {
    if (showRecents) return recents.map((r) => ({ kind: "recent" as const, value: r }));
    if (showResults && results) return results.map((r) => ({ kind: "asset" as const, value: r }));
    return [];
  }, [showRecents, showResults, recents, results]);

  useEffect(() => {
    setActiveIdx(items.length > 0 ? 0 : -1);
  }, [items.length, debounced]);

  const runSearch = (q: string) => {
    const term = q.trim();
    if (!term) return;
    saveRecent(term);
    setRecents(loadRecents());
    setIsLoading(true);
    apiFetchJson<AssetsListResponse>(
      `/api/v1/assets?search=${encodeURIComponent(term)}&limit=1&page=1`,
    )
      .then((r) => {
        const first = r.ok && r.data?.items?.[0];
        if (first) {
          navWithSearchCtx(setLocation, first.id, term);
          setOpen(false);
          setQuery("");
          inputRef.current?.blur();
        }
      })
      .finally(() => setIsLoading(false));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (items.length === 0) return;
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      if (items.length === 0) return;
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIdx];
      if (item?.kind === "asset") {
        navWithSearchCtx(setLocation, item.value.id, query.trim());
        saveRecent(query.trim());
        setRecents(loadRecents());
        setOpen(false);
        setQuery("");
        inputRef.current?.blur();
      } else if (item?.kind === "recent") {
        setQuery(item.value);
        runSearch(item.value);
      } else if (query.trim()) {
        runSearch(query);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const clearRecents = () => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // ignore
    }
    setRecents([]);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-sm hidden md:block">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search assets by name, tag, serial..."
        className="pl-9 pr-9 h-9"
        aria-label="Global asset search"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setResults(null);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-colors"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
      {isLoading && !query && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}

      {open && (showResults || showRecents) && (
        <div className="absolute left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 overflow-hidden">
          {showRecents && (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b text-xs text-muted-foreground">
                <span className="font-medium uppercase tracking-wide">Recent searches</span>
                <button
                  type="button"
                  onClick={clearRecents}
                  className="hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              </div>
              <ul className="max-h-72 overflow-y-auto py-1">
                {recents.map((r, idx) => (
                  <li key={r}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => {
                        setQuery(r);
                        runSearch(r);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent",
                        activeIdx === idx && "bg-accent",
                      )}
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{r}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {showResults && (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b text-xs text-muted-foreground">
                {isLoading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                  </span>
                ) : (
                  <span>
                    {totalMatches === 0
                      ? "No matches"
                      : totalMatches === 1
                      ? "1 match"
                      : `${totalMatches} matches`}
                    {totalMatches > (results?.length ?? 0) && results && results.length > 0 && (
                      <span className="ml-1">(showing top {results.length})</span>
                    )}
                  </span>
                )}
                {!isLoading && totalMatches > 0 && (
                  <span className="font-medium uppercase tracking-wide">↵ Open first</span>
                )}
              </div>
              {!isLoading && results && results.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No assets match &ldquo;{debounced}&rdquo;.
                </div>
              )}
              {results && results.length > 0 && (
                <ul className="max-h-72 overflow-y-auto py-1">
                  {results.map((a, idx) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => {
                          navWithSearchCtx(setLocation, a.id, debounced);
                          saveRecent(debounced);
                          setRecents(loadRecents());
                          setOpen(false);
                          setQuery("");
                          inputRef.current?.blur();
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-accent",
                          activeIdx === idx && "bg-accent",
                        )}
                      >
                        <span className="font-mono text-xs text-muted-foreground shrink-0 w-24 truncate">
                          {a.assetTag}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{a.assetName}</span>
                        {a.serialNumber && (
                          <span className="hidden lg:inline text-xs text-muted-foreground truncate max-w-[140px]">
                            {a.serialNumber}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {totalMatches > (results?.length ?? 0) && (
                <div className="px-3 py-2 border-t text-xs text-muted-foreground">
                  Press <span className="font-medium">↵</span> to open the first match — use the
                  ← / → buttons on the asset page to walk through all {totalMatches} matches.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
