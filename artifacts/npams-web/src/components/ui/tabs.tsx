import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

// ── Colorful tab variant ─────────────────────────────────────────────────────
// Use ColorfulTabsList + ColorfulTabsTrigger with a `tone` prop ("blue" | "amber" | etc.)
// Active tab gets a saturated background per tone; inactive tabs sit on a soft tinted bg.
const TONES: Record<string, { active: string; inactive: string; bar: string }> = {
  blue:    { active: "data-[state=active]:bg-blue-600 data-[state=active]:text-white",    inactive: "text-blue-700 hover:bg-blue-100",    bar: "bg-blue-50/60" },
  amber:   { active: "data-[state=active]:bg-amber-500 data-[state=active]:text-white",   inactive: "text-amber-700 hover:bg-amber-100", bar: "bg-amber-50/60" },
  emerald: { active: "data-[state=active]:bg-emerald-600 data-[state=active]:text-white", inactive: "text-emerald-700 hover:bg-emerald-100", bar: "bg-emerald-50/60" },
  red:     { active: "data-[state=active]:bg-red-600 data-[state=active]:text-white",     inactive: "text-red-700 hover:bg-red-100",     bar: "bg-red-50/60" },
  violet:  { active: "data-[state=active]:bg-violet-600 data-[state=active]:text-white",  inactive: "text-violet-700 hover:bg-violet-100", bar: "bg-violet-50/60" },
  slate:   { active: "data-[state=active]:bg-slate-700 data-[state=active]:text-white",   inactive: "text-slate-700 hover:bg-slate-200", bar: "bg-slate-100/70" },
  indigo:  { active: "data-[state=active]:bg-indigo-600 data-[state=active]:text-white",  inactive: "text-indigo-700 hover:bg-indigo-100", bar: "bg-indigo-50/60" },
  rose:    { active: "data-[state=active]:bg-rose-600 data-[state=active]:text-white",    inactive: "text-rose-700 hover:bg-rose-100",   bar: "bg-rose-50/60" },
};

const ColorfulTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-start gap-1 rounded-lg border bg-gradient-to-r from-blue-50 via-violet-50 to-amber-50 p-1 shadow-sm",
      className
    )}
    {...props}
  />
))
ColorfulTabsList.displayName = "ColorfulTabsList";

interface ColorfulTabsTriggerProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  tone?: keyof typeof TONES;
}

const ColorfulTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  ColorfulTabsTriggerProps
>(({ className, tone = "blue", ...props }, ref) => {
  const t = TONES[tone] ?? TONES.blue;
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-md",
        t.inactive,
        t.active,
        className,
      )}
      {...props}
    />
  );
});
ColorfulTabsTrigger.displayName = "ColorfulTabsTrigger";

export { Tabs, TabsList, TabsTrigger, TabsContent, ColorfulTabsList, ColorfulTabsTrigger }
