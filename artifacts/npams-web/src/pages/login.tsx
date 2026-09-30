import { useState } from "react";
import { useForm } from "react-hook-form";
import { useOrganization } from "@/context/organization-context";
import { Building2, ShieldCheck, Loader2 } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotDialog, setShowForgotDialog] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const { organization } = useOrganization();

  const openForgotDialog = (open: boolean) => {
    setShowForgotDialog(open);
    if (!open) {
      setForgotEmail("");
      setForgotSent(false);
      setForgotError(null);
      setForgotSubmitting(false);
    }
  };

  const onForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = forgotEmail.trim();
    if (!email) {
      setForgotError("Please enter your email address.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setForgotError("Please enter a valid email address.");
      return;
    }
    setForgotError(null);
    setForgotSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        throw new Error("generic");
      }
      setForgotSent(true);
    } catch {
      setForgotError("Could not submit your request right now. Please try again in a moment.");
    } finally {
      setForgotSubmitting(false);
    }
  };

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    try {
      await login(values);
      toast({ title: "Login successful", description: `Welcome to ${organization.organizationName}.` });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error instanceof Error ? error.message : "Please check your credentials and try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-80"
        style={{
          background: `radial-gradient(ellipse at 20% 20%, ${organization.primaryColor}33 0%, transparent 55%), radial-gradient(ellipse at 85% 80%, ${organization.accentColor}22 0%, transparent 50%)`,
        }}
      />
      <div className="absolute inset-x-0 top-0 h-1 flex" aria-hidden>
        <div className="flex-1" style={{ background: organization.primaryColor || "#0F4C81" }} />
        <div className="flex-1" style={{ background: organization.accentColor || "#3B82F6" }} />
      </div>

      <div className="relative w-full max-w-[420px]">
        <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-card">
          <div
            className="px-8 pt-8 pb-6 flex flex-col items-center text-center border-b"
            style={{
              background: `linear-gradient(180deg, ${organization.primaryColor}18 0%, transparent 100%)`,
            }}
          >
            <div className="relative w-24 h-24 rounded-2xl flex items-center justify-center mb-4 overflow-hidden bg-white ring-1 ring-border shadow-sm p-2">
              {organization.logoUrl && !logoError ? (
                <img
                  src={organization.logoUrl}
                  alt={organization.organizationName}
                  className="w-full h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div
                  className="w-full h-full flex flex-col items-center justify-center text-base font-bold rounded-lg p-1 text-center shadow-inner"
                  style={{ background: organization.primaryColor || "#0F4C81", color: "#FFFFFF" }}
                >
                  <Building2 className="w-6 h-6 mb-0.5 opacity-80" />
                  <span className="text-xs uppercase tracking-wider">{organization.shortCode || "AM"}</span>
                </div>
              )}
            </div>
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: organization.primaryColor || "#0F4C81" }}>
              {organization.organizationName}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 font-medium">
              {organization.systemTitle || "Asset Management System"}
            </p>
            {organization.tagline && (
              <p className="text-xs text-muted-foreground/80 mt-0.5">
                {organization.tagline}
              </p>
            )}
          </div>

          <div className="px-8 py-7">
            <div className="flex items-center justify-center gap-1.5 mb-6 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5" />
              Authorised access only
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input placeholder="name@ica.gov.pg" autoComplete="username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full mt-2" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShowForgotDialog(true)}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline focus:outline-none transition-colors"
              >
                Forgot your password?
              </button>
            </div>
          </div>

          <div className="px-8 py-3 border-t bg-muted/30 flex items-center justify-between">
            <div className="flex gap-1" aria-hidden>
              <span className="block w-3 h-3 rounded-full" style={{ background: "#000000" }} />
              <span className="block w-3 h-3 rounded-full" style={{ background: "#FCD116" }} />
              <span className="block w-3 h-3 rounded-full" style={{ background: "#CE1126" }} />
            </div>
            <p className="text-[11px] text-muted-foreground">PNG Immigration &amp; Citizenship Authority</p>
          </div>
        </div>

        <p className="text-center text-[11px] text-white/50 mt-4">
          © {new Date().getFullYear()} PNG Immigration &amp; Citizenship Authority
        </p>
      </div>

      <Dialog open={showForgotDialog} onOpenChange={openForgotDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription asChild>
              {forgotSent ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    If an account exists for that email address, a password reset link has been sent. Please check your
                    inbox and follow the instructions to set a new password.
                  </p>
                  <p>The link will expire shortly for your security.</p>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Enter the email address associated with your ICSA account and we&rsquo;ll send you a link to reset
                  your password.
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          {forgotSent ? (
            <div className="flex justify-end">
              <Button onClick={() => openForgotDialog(false)}>Close</Button>
            </div>
          ) : (
            <form onSubmit={onForgotSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="forgot-email" className="text-sm font-medium">Email address</label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="username"
                  placeholder="name@ica.gov.pg"
                  value={forgotEmail}
                  onChange={(e) => {
                    setForgotEmail(e.target.value);
                    if (forgotError) setForgotError(null);
                  }}
                  disabled={forgotSubmitting}
                  data-testid="input-forgot-email"
                />
                {forgotError && (
                  <p className="text-xs text-destructive" data-testid="text-forgot-error">{forgotError}</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Still need help? Contact ICSA ICT Support at{" "}
                <span className="font-medium text-foreground">ict@ica.gov.pg</span>.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openForgotDialog(false)}
                  disabled={forgotSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={forgotSubmitting} data-testid="button-forgot-submit">
                  {forgotSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
