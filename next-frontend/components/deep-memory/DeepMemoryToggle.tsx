"use client"

import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import type { DeepMemorySettings } from "@/lib/types/deep-memory"

interface DeepMemoryToggleProps {
  settings: DeepMemorySettings;
  onToggle: (enabled: boolean) => void;
  loading?: boolean;
}

export function DeepMemoryToggle({ settings, onToggle, loading }: DeepMemoryToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <Label htmlFor="deep-memory-toggle" className="text-sm font-medium">
          Enable Deep Memory
        </Label>
        <p className="text-xs text-muted-foreground">
          {settings.can_enable
            ? "Use trained model for improved search accuracy"
            : "Complete a training run to enable"}
        </p>
        {settings.last_trained_at && (
          <p className="text-xs text-muted-foreground">
            Last trained: {new Date(settings.last_trained_at).toLocaleDateString()}
          </p>
        )}
      </div>
      <Switch
        id="deep-memory-toggle"
        checked={settings.enabled}
        onCheckedChange={onToggle}
        disabled={!settings.can_enable || loading}
      />
    </div>
  )
}
