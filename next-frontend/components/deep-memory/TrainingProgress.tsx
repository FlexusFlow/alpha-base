"use client"

import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { subscribeToJob } from "@/lib/api/events"
import type { DeepMemoryJobUpdate } from "@/lib/types/deep-memory"

interface TrainingProgressProps {
  jobId: string;
  type: "generating" | "training";
  onComplete?: (data: DeepMemoryJobUpdate) => void;
  onError?: (error: string) => void;
}

export function TrainingProgress({ jobId, type, onComplete, onError }: TrainingProgressProps) {
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState(
    type === "generating" ? "Starting generation..." : "Starting training..."
  )
  const [status, setStatus] = useState<string>(type)

  useEffect(() => {
    const es = subscribeToJob(
      jobId,
      (data) => {
        const update = data as unknown as DeepMemoryJobUpdate
        setProgress(update.progress || 0)
        setStatus(update.status || type)

        if (type === "generating" && update.processed_chunks !== undefined) {
          setMessage(
            `Generating... ${update.processed_chunks}/${update.total_chunks} chunks (${update.pair_count || 0} pairs)`
          )
        } else if (update.message) {
          setMessage(update.message)
        }

        if (update.status === "completed" || update.status === "generated") {
          onComplete?.(update)
        } else if (update.status === "generating_failed" || update.status === "training_failed") {
          onError?.(update.error_message || "Unknown error")
        }
      },
      () => {
        onError?.("Connection lost")
      },
    )

    return () => es.close()
  }, [jobId, type, onComplete, onError])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{message}</span>
        <span className="font-medium">{progress}%</span>
      </div>
      <Progress value={progress} />
      {(status === "generating_failed" || status === "training_failed") && (
        <p className="text-sm text-destructive">
          {status === "generating_failed" ? "Generation" : "Training"} failed. Check logs for details.
        </p>
      )}
    </div>
  )
}
