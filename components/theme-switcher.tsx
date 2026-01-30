"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
        <div className="size-8 rounded-md" />
        <div className="size-8 rounded-md" />
        <div className="size-8 rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setTheme("light")}
        className={cn(
          "rounded-md",
          theme === "light" && "bg-background shadow-sm"
        )}
        aria-label="Light mode"
      >
        <Sun className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setTheme("dark")}
        className={cn(
          "rounded-md",
          theme === "dark" && "bg-background shadow-sm"
        )}
        aria-label="Dark mode"
      >
        <Moon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setTheme("system")}
        className={cn(
          "rounded-md",
          theme === "system" && "bg-background shadow-sm"
        )}
        aria-label="System mode"
      >
        <Monitor className="size-4" />
      </Button>
    </div>
  );
}
