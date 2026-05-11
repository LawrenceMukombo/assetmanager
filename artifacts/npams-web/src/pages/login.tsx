import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { ShieldCheck, Loader2 } from "lucide-react";

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
  const [flagError, setFlagError] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    try {
      await login(values);
      toast({ title: "Login successful", description: "Welcome to NPAMS." });
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
        className="absolute inset-0 pointer-events-none opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 20% 20%, rgba(37,99,235,0.18) 0%, transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(252,209,22,0.08) 0%, transparent 50%)",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-1 flex" aria-hidden>
        <div className="flex-1" style={{ background: "#000000" }} />
        <div className="flex-1" style={{ background: "#FCD116" }} />
        <div className="flex-1" style={{ background: "#CE1126" }} />
      </div>

      <div className="relative w-full max-w-[400px]">
        <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-card">
          <div className="px-8 pt-8 pb-6 flex flex-col items-center text-center border-b">
            <div className="relative w-16 h-16 rounded-xl flex items-center justify-center mb-4 overflow-hidden bg-muted ring-1 ring-border shadow-sm">
              {flagError ? (
                <div
                  className="w-full h-full flex items-center justify-center text-sm font-bold"
                  style={{ background: "linear-gradient(135deg, #000 50%, #CE1126 50%)", color: "#FCD116" }}
                >
                  PNG
                </div>
              ) : (
                <img
                  src="/flags/png_national.svg"
                  alt="Papua New Guinea Flag"
                  className="w-full h-full object-cover"
                  onError={() => setFlagError(true)}
                />
              )}
            </div>
            <h1 className="text-xl font-semibold tracking-tight">NPAMS</h1>
            <p className="text-sm text-muted-foreground mt-1">National Public Asset Management System</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">Independent State of Papua New Guinea</p>
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
                        <Input placeholder="name@gov.pg" autoComplete="username" {...field} />
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
            <p className="text-[11px] text-muted-foreground">Papua New Guinea</p>
          </div>
        </div>

        <p className="text-center text-[11px] text-white/50 mt-4">
          © {new Date().getFullYear()} Government of Papua New Guinea
        </p>
      </div>

      <Dialog open={showForgotDialog} onOpenChange={setShowForgotDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Password reset</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Self-service password reset is not available for NPAMS accounts.</p>
                <p>To reset your password, please contact your system administrator or provincial IT support officer.</p>
                <p className="font-medium text-foreground">
                  ICT Support Desk: <span className="font-normal">ict@treasury.gov.pg</span>
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowForgotDialog(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
