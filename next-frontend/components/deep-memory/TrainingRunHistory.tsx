"use client"

import { Fragment, useState } from "react"
import { RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  onRefreshRun?: (runId: string) => Promise<void>;
  onProceedRun?: (runId: string) => Promise<void>;
  onRemoveRun?: (runId: string) => Promise<void>;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  generated: "secondary",
  generating: "outline",
  training: "outline",
  generating_failed: "destructive",
  training_failed: "destructive",
}

const EXPANDABLE_STATUSES = ["generating", "training", "generating_failed", "training_failed"]

function getProgressText(run: TrainingRunSummary): string {
  if (
    (run.status === "generating" || run.status === "generating_failed" || run.status === "training_failed") &&
    run.total_chunks > 0
  ) {
    return `${run.processed_chunks}/${run.total_chunks}`
  }
  if (run.status === "training") {
    return "In progress"
  }

  if (run.status === 'generated') {
    return "100%"
  }
  return "—"
}

export function TrainingRunHistory({
  runs,
  onSelectRun,
  onRefreshRun,
  onProceedRun,
  onRemoveRun,
}: TrainingRunHistoryProps) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No training runs yet.</p>
  }

  const handleRowClick = (run: TrainingRunSummary) => {
    if (EXPANDABLE_STATUSES.includes(run.status)) {
      setExpandedRunId((prev) => (prev === run.id ? null : run.id))
    } else {
      onSelectRun?.(run.id)
    }
  }

  const handleRefresh = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation()
    if (!onRefreshRun) return
    setRefreshingId(runId)
    try {
      await onRefreshRun(runId)
    } finally {
      setRefreshingId(null)
    }
  }

  const handleProceed = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation()
    setExpandedRunId(null)
    await onProceedRun?.(runId)
  }

  const handleRemove = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation()
    setExpandedRunId(null)
    await onRemoveRun?.(runId)
  }

  const isActive = (status: string) => status === "generating" || status === "training"
  const isFailed = (status: string) => status === "generating_failed" || status === "training_failed"

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Progress</TableHead>
          <TableHead>Pairs</TableHead>
          <TableHead>Recall@10</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <Fragment key={run.id}>
            <TableRow
              
              className={`cursor-pointer hover:bg-muted/50 ${expandedRunId === run.id ? "border-b-0" : ""}`}
              onClick={() => handleRowClick(run)}
            >
              <TableCell>
                <Badge variant={statusVariant[run.status] || "outline"}>
                  {run.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {getProgressText(run)}
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

            {expandedRunId === run.id && (
              <TableRow key={`${run.id}-expanded`} className="bg-muted/30 border-l-2 border-l-primary">
                <TableCell colSpan={5}>
                  <div className="flex items-center gap-3 py-1">
                    {isActive(run.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleRefresh(e, run.id)}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 mr-1.5 ${refreshingId === run.id ? "animate-spin" : ""}`}
                        />
                        Refresh
                      </Button>
                    )}

                    {isFailed(run.status) && (
                      <>
                        {run.error_message && (
                          <span className="text-sm text-destructive">
                            {run.status === "generating_failed" ? "Generation" : "Training"} failed
                            {`: ${run.error_message}`}
                          </span>
                        )}
                        <div className="flex gap-2 ml-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => handleRefresh(e, run.id)}
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 mr-1.5 ${refreshingId === run.id ? "animate-spin" : ""}`}
                            />
                            Refresh
                          </Button>
                          <Button size="sm" onClick={(e) => handleProceed(e, run.id)}>
                            Proceed
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => handleRemove(e, run.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  )
}
