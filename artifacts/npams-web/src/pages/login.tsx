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
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    try {
      await login(values);
      toast({
        title: "Login successful",
        description: "Welcome to NPAMS.",
      });
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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "linear-gradient(135deg, #000000 0%, #1a0000 50%, #CE1126 100%)" }}>
      <div className="w-full max-w-md bg-card border rounded-xl shadow-2xl overflow-hidden">
        <div className="px-8 py-6 flex flex-col items-center text-center" style={{ background: "linear-gradient(135deg, #000000 0%, #CE1126 100%)" }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-3 overflow-hidden border-2 border-white/30 bg-black/20">
            {flagError ? (
              <svg viewBox="0 0 48 48" className="w-10 h-10 fill-white" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 4L6 14v10c0 10.5 7.7 20.3 18 22.9C35.3 44.3 43 34.5 43 24V14L24 4zm0 4.2l15 8.6v7.2c0 8.7-6.3 16.9-15 19.3-8.7-2.4-15-10.6-15-19.3v-7.2L24 8.2z" />
              </svg>
            ) : (
              <img
                src="/flags/png_national.svg"
                alt="Papua New Guinea Flag"
                className="w-full h-full object-cover"
                onError={() => setFlagError(true)}
              />
            )}
          </div>
          <h1 className="text-xl font-bold text-white tracking-wide">NPAMS</h1>
          <p className="text-white/90 text-sm mt-1 font-medium">National Public Asset Management System</p>
          <p className="text-white/60 text-xs mt-0.5">Independent State of Papua New Guinea</p>
        </div>

        <div className="px-8 py-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input placeholder="name@gov.pg" {...field} />
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
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full text-white font-semibold"
                style={{ background: "linear-gradient(135deg, #CE1126, #8B0000)" }}
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
              className="text-sm text-primary hover:underline focus:outline-none"
            >
              Forgot your password?
            </button>
          </div>

          <div className="flex items-center justify-center gap-3 mt-5 pt-4 border-t">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#000000" }} />
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#CE1126" }} />
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#FCD116" }} />
            <p className="text-xs text-muted-foreground">For authorised government personnel only</p>
          </div>
        </div>
      </div>

      <Dialog open={showForgotDialog} onOpenChange={setShowForgotDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Password Reset</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Self-service password reset is not available for NPAMS accounts.
                </p>
                <p>
                  To reset your password, please contact your system administrator or provincial IT support officer.
                </p>
                <p className="font-medium text-foreground">
                  ICT Support Desk: <span className="font-normal">ict@treasury.gov.pg</span>
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowForgotDialog(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
