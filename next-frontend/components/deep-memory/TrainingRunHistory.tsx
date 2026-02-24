"use client"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { TrainingRunSummary } from "@/lib/types/deep-memory"

interface TrainingRunHistoryProps {
  runs: TrainingRunSummary[];
  onSelectRun?: (runId: string) => void;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  generated: "secondary",
  generating: "outline",
  training: "outline",
  failed: "destructive",
}

export function TrainingRunHistory({ runs, onSelectRun }: TrainingRunHistoryProps) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No training runs yet.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Pairs</TableHead>
          <TableHead>Recall@10</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow
            key={run.id}
            className={onSelectRun ? "cursor-pointer hover:bg-muted/50" : ""}
            onClick={() => onSelectRun?.(run.id)}
          >
            <TableCell>
              <Badge variant={statusVariant[run.status] || "outline"}>
                {run.status}
              </Badge>
            </TableCell>
            <TableCell>{run.pair_count}</TableCell>
            <TableCell>
              {run.metrics?.["recall@10"]
                ? `${(run.metrics["recall@10"] * 100).toFixed(1)}%`
                : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(run.started_at).toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
