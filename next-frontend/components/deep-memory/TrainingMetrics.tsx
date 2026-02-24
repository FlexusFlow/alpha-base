"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface TrainingMetricsProps {
  metrics: Record<string, number>;
}

export function TrainingMetrics({ metrics }: TrainingMetricsProps) {
  const metricKeys = ["recall@1", "recall@3", "recall@5", "recall@10"]
  const displayMetrics = metricKeys.filter((k) => k in metrics)

  if (displayMetrics.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Training Results</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {displayMetrics.map((key) => (
            <div key={key} className="text-center">
              <p className="text-2xl font-bold">{(metrics[key] * 100).toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">{key}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
