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
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: "linear-gradient(150deg, #000000 0%, #1a1a00 35%, #3d2e00 65%, #000000 100%)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 30% 60%, rgba(252,209,22,0.12) 0%, transparent 60%), radial-gradient(ellipse at 75% 20%, rgba(206,17,38,0.15) 0%, transparent 55%)",
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-4 flex justify-center gap-2">
          <div className="h-1 w-20 rounded-full" style={{ background: "#000000", border: "1px solid #FCD116" }} />
          <div className="h-1 w-8 rounded-full" style={{ background: "#FCD116" }} />
          <div className="h-1 w-20 rounded-full" style={{ background: "#CE1126" }} />
        </div>

        <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ border: "2px solid #FCD116" }}>
          <div
            className="px-8 py-7 flex flex-col items-center text-center relative overflow-hidden"
            style={{
              background: "linear-gradient(160deg, #000000 0%, #1a0d00 50%, #000000 100%)",
            }}
          >
            <div
              className="absolute inset-0 opacity-10"
              style={{
                background: "repeating-linear-gradient(45deg, #FCD116 0px, #FCD116 1px, transparent 1px, transparent 12px)",
              }}
            />

            <div
              className="relative w-24 h-24 rounded-full flex items-center justify-center mb-4 overflow-hidden"
              style={{ border: "3px solid #FCD116", boxShadow: "0 0 24px rgba(252,209,22,0.4)" }}
            >
              {flagError ? (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #000 50%, #CE1126 50%)" }}
                >
                  <span style={{ color: "#FCD116", fontSize: "2rem", fontWeight: "bold" }}>PNG</span>
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

            <div
              className="text-2xl font-extrabold tracking-widest mb-1"
              style={{ color: "#FCD116", textShadow: "0 0 16px rgba(252,209,22,0.5)" }}
            >
              NPAMS
            </div>
            <p className="text-white/85 text-sm font-medium">National Public Asset Management System</p>
            <p className="text-xs mt-0.5" style={{ color: "#FCD116", opacity: 0.7 }}>
              Independent State of Papua New Guinea
            </p>

            <div className="flex gap-2 mt-4">
              <div className="h-1 w-12 rounded-full" style={{ background: "#000000", border: "1px solid #fff" }} />
              <div className="h-1 w-6 rounded-full" style={{ background: "#FCD116" }} />
              <div className="h-1 w-12 rounded-full" style={{ background: "#CE1126" }} />
            </div>
          </div>

          <div
            className="px-8 py-7"
            style={{ background: "linear-gradient(180deg, #ffffff 0%, #fffdf0 100%)" }}
          >
            <div
              className="text-center text-xs font-semibold tracking-widest mb-5 pb-3 border-b"
              style={{ color: "#7a6000", borderColor: "#FCD116" }}
            >
              AUTHORISED ACCESS ONLY
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold" style={{ color: "#1a1a00" }}>
                        Email Address
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="name@gov.pg"
                          {...field}
                          className="border-2 focus:ring-0"
                          style={{ borderColor: "#d4b800" }}
                        />
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
                      <FormLabel className="text-xs font-semibold" style={{ color: "#1a1a00" }}>
                        Password
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          {...field}
                          className="border-2 focus:ring-0"
                          style={{ borderColor: "#d4b800" }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full font-bold text-sm py-2.5 tracking-wide"
                  style={{
                    background: isLoading
                      ? "#333"
                      : "linear-gradient(135deg, #000000 0%, #1a1a00 50%, #000000 100%)",
                    color: "#FCD116",
                    border: "2px solid #FCD116",
                    boxShadow: isLoading ? "none" : "0 0 14px rgba(252,209,22,0.3)",
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </Form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShowForgotDialog(true)}
                className="text-xs hover:underline focus:outline-none"
                style={{ color: "#7a6000" }}
              >
                Forgot your password?
              </button>
            </div>

            <div className="mt-5 pt-4 flex items-center justify-center gap-2" style={{ borderTop: "1px solid #FCD116" }}>
              <div className="flex gap-1.5">
                <div className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: "#000000" }} />
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "#FCD116" }} />
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "#CE1126" }} />
              </div>
              <p className="text-xs" style={{ color: "#7a6000" }}>Papua New Guinea</p>
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-center gap-2 opacity-60">
          <div className="h-1 w-20 rounded-full" style={{ background: "#FCD116" }} />
          <div className="h-1 w-8 rounded-full" style={{ background: "#CE1126" }} />
          <div className="h-1 w-20 rounded-full" style={{ background: "#000000", border: "1px solid #FCD116" }} />
        </div>
      </div>

      <Dialog open={showForgotDialog} onOpenChange={setShowForgotDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Password Reset</DialogTitle>
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
