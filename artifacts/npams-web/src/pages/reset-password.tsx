import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, CheckCircle2, AlertCircle, Check, X } from "lucide-react";

interface ValidationState {
  loading: boolean;
  valid: boolean;
  email: string | null;
  fullName: string | null;
  error: string | null;
}

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";

  const [state, setState] = useState<ValidationState>({
    loading: true,
    valid: false,
    email: null,
    fullName: null,
    error: null,
  });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const rules = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "An uppercase letter (A–Z)", ok: /[A-Z]/.test(password) },
    { label: "A lowercase letter (a–z)", ok: /[a-z]/.test(password) },
    { label: "A number (0–9)", ok: /\d/.test(password) },
    { label: "A symbol (e.g. !@#$%)", ok: /[^A-Za-z0-9]/.test(password) },
    { label: "Matches the confirmation", ok: password.length > 0 && password === confirm },
  ];
  const allRulesPass = rules.every((r) => r.ok);

  useEffect(() => {
    if (!token) {
      setState({ loading: false, valid: false, email: null, fullName: null, error: "No reset token was provided." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (cancelled) return;
        const data = json.data ?? {};
        setState({
          loading: false,
          valid: !!data.valid,
          email: data.email ?? null,
          fullName: data.full_name ?? null,
          error: data.valid ? null : "This reset link is invalid or has expired. Ask your administrator to send a new one.",
        });
      } catch {
        if (!cancelled) {
          setState({ loading: false, valid: false, email: null, fullName: null, error: "Could not validate the reset link. Please try again." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRulesPass) {
      toast({ variant: "destructive", title: "Password does not meet the requirements" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast({ variant: "destructive", title: "Reset failed", description: json.message ?? "Please try again." });
        return;
      }
      setDone(true);
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
    } catch {
      toast({ variant: "destructive", title: "Reset failed", description: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-[420px] rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-card">
        <div className="px-8 pt-8 pb-6 text-center border-b">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
          <p className="text-sm text-muted-foreground mt-1">ICSA account recovery</p>
        </div>

        <div className="px-8 py-7 space-y-5">
          {state.loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Validating reset link…
            </div>
          ) : done ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Your password has been updated. All previous sessions have been signed out.
              </p>
              <Button className="w-full" onClick={() => setLocation("/login")}>Continue to sign in</Button>
            </div>
          ) : !state.valid ? (
            <div className="space-y-4 text-center">
              <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground">{state.error}</p>
              <Button variant="outline" className="w-full" onClick={() => setLocation("/login")}>Back to sign in</Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Resetting password for</div>
                <div className="font-medium">{state.fullName}</div>
                <div className="text-xs text-muted-foreground">{state.email}</div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a strong password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2.5" data-testid="password-rules">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Password must include</div>
                <ul className="space-y-1">
                  {rules.map((rule) => (
                    <li
                      key={rule.label}
                      className={`flex items-center gap-2 text-xs ${rule.ok ? "text-green-600 dark:text-green-500" : "text-muted-foreground"}`}
                      data-testid={`rule-${rule.ok ? "pass" : "fail"}`}
                    >
                      {rule.ok ? (
                        <Check className="w-3.5 h-3.5 shrink-0" aria-label="met" />
                      ) : (
                        <X className="w-3.5 h-3.5 shrink-0" aria-label="not met" />
                      )}
                      <span>{rule.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !allRulesPass}>
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Updating…</> : "Set new password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
