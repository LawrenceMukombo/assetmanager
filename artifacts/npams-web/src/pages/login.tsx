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

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md bg-card border rounded-xl shadow-lg overflow-hidden">
        <div className="bg-primary px-8 py-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-white/15 rounded-full flex items-center justify-center mb-3 border-2 border-white/30">
            <svg viewBox="0 0 48 48" className="w-9 h-9 fill-white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M24 4L6 14v10c0 10.5 7.7 20.3 18 22.9C35.3 44.3 43 34.5 43 24V14L24 4zm0 4.2l15 8.6v7.2c0 8.7-6.3 16.9-15 19.3-8.7-2.4-15-10.6-15-19.3v-7.2L24 8.2z"/>
              <path d="M24 15a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z"/>
              <circle cx="24" cy="24" r="3"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white tracking-wide">NPAMS</h1>
          <p className="text-white/80 text-sm mt-1">National Public Asset Management System</p>
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

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </Form>
          <p className="text-center text-xs text-muted-foreground mt-6">
            For authorised government personnel only
          </p>
        </div>
      </div>
    </div>
  );
}
