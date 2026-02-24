"use client"

import { useCallback, useEffect, useState } from "react"
import { Brain } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"

import { DeepMemoryToggle } from "@/components/deep-memory/DeepMemoryToggle"
import { TrainingProgress } from "@/components/deep-memory/TrainingProgress"
import { TrainingMetrics } from "@/components/deep-memory/TrainingMetrics"
import { SamplePairsTable } from "@/components/deep-memory/SamplePairsTable"
import { TrainingRunHistory } from "@/components/deep-memory/TrainingRunHistory"

import {
  deleteFailedRun,
  generateTrainingData,
  getSettings,
  getTrainingRun,
  getTrainingRuns,
  proceedFailedRun,
  startTraining,
  updateSettings,
} from "@/lib/api/deep-memory"
import type {
  DeepMemoryJobUpdate,
  DeepMemorySettings,
  TrainingRunDetail,
  TrainingRunSummary,
} from "@/lib/types/deep-memory"

type WorkflowStep = "idle" | "generating" | "generated" | "training" | "completed"

export default function DeepMemoryPage() {
  const [settings, setSettings] = useState<DeepMemorySettings | null>(null)
  const [runs, setRuns] = useState<TrainingRunSummary[]>([])
  const [currentRun, setCurrentRun] = useState<TrainingRunDetail | null>(null)
  const [step, setStep] = useState<WorkflowStep>("idle")
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggleLoading, setToggleLoading] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [settingsData, runsData] = await Promise.all([
          getSettings(),
          getTrainingRuns(),
        ])
        setSettings(settingsData)
        setRuns(runsData)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleGenerate = async () => {
    setError(null)
    try {
      const res = await generateTrainingData()
      setJobId(res.job_id)
      setStep("generating")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation")
    }
  }

  const handleGenerationComplete = useCallback(async (_data: DeepMemoryJobUpdate) => {
    setStep("generated")
    setJobId(null)
    // Refresh runs and load the latest run detail
    const runsData = await getTrainingRuns()
    setRuns(runsData)
    if (runsData.length > 0) {
      const detail = await getTrainingRun(runsData[0].id)
      setCurrentRun(detail)
    }
  }, [])

  const handleTrain = async () => {
    if (!currentRun) return
    setError(null)
    try {
      const res = await startTraining(currentRun.id)
      setJobId(res.job_id)
      setStep("training")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start training")
    }
  }

  const handleTrainingComplete = useCallback(async (data: DeepMemoryJobUpdate) => {
    setStep("completed")
    setJobId(null)
    // Refresh everything
    const [settingsData, runsData] = await Promise.all([
      getSettings(),
      getTrainingRuns(),
    ])
    setSettings(settingsData)
    setRuns(runsData)
    if (runsData.length > 0 && data.metrics) {
      const detail = await getTrainingRun(runsData[0].id)
      setCurrentRun(detail)
    }
  }, [])

  const handleToggle = async (enabled: boolean) => {
    setToggleLoading(true)
    try {
      await updateSettings(enabled)
      setSettings((prev) => prev ? { ...prev, enabled } : prev)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update settings")
    } finally {
      setToggleLoading(false)
    }
  }

  const handleSelectRun = async (runId: string) => {
    try {
      const detail = await getTrainingRun(runId)
      setCurrentRun(detail)
      if (detail.status === "generated") setStep("generated")
      else if (detail.status === "completed") setStep("completed")
      else setStep("idle")
    } catch {
      // ignore
    }
  }

  const handleProceed = async (runId: string) => {
    const run = runs.find((r) => r.id === runId)
    const wasGenerating = run?.status === "generating_failed"
    setError(null)
    try {
      const res = await proceedFailedRun(runId)
      setJobId(res.job_id)
      setCurrentRun(null)
      setStep(wasGenerating ? "generating" : "training")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to proceed")
    }
  }

  const handleRemove = async (runId: string) => {
    if (!confirm("Remove this failed training run and all associated data? This cannot be undone.")) return
    setError(null)
    try {
      await deleteFailedRun(runId)
      const [settingsData, runsData] = await Promise.all([getSettings(), getTrainingRuns()])
      setSettings(settingsData)
      setRuns(runsData)
      setCurrentRun(null)
      setStep("idle")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove run")
    }
  }

  const handleRefreshRun = async (runId: string) => {
    try {
      const detail = await getTrainingRun(runId)
      setRuns((prev) =>
        prev.map((r) =>
          r.id === runId
            ? {
                ...r,
                processed_chunks: detail.processed_chunks,
                total_chunks: detail.total_chunks,
                pair_count: detail.pair_count,
                status: detail.status,
                error_message: detail.error_message,
              }
            : r,
        ),
      )
    } catch {
      // ignore refresh errors
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const newChunks = settings
    ? settings.total_chunks - settings.trained_chunk_count
    : 0
  
  return (
  
    <div className="p-8 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Brain className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Deep Memory Training</h1>
        {settings && (
          <Badge variant={settings.enabled ? "default" : "secondary"}>
            {settings.enabled ? "Enabled" : "Disabled"}
          </Badge>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Cloud-only gate */}
      {settings && !settings.is_cloud && (
        <Alert>
          <AlertDescription>
            Deep Memory is only available with DeepLake Cloud. Configure your vector store
            with a <code className="text-sm font-mono">hub://</code> path to enable this feature.
          </AlertDescription>
        </Alert>
      )}

      {(!settings || settings.is_cloud) && (
        <>
          {/* New chunks indicator */}
          {newChunks > 0 && settings?.last_trained_at && (
            <Alert>
              <AlertDescription>
                {newChunks} new chunk{newChunks !== 1 ? "s" : ""} since last training.
                Consider retraining for improved accuracy.
              </AlertDescription>
            </Alert>
          )}

          {/* Settings Card */}
          {settings && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <DeepMemoryToggle
                  settings={settings}
                  onToggle={handleToggle}
                  loading={toggleLoading}
                />
              </CardContent>
            </Card>
          )}

          {/* Training Workflow Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Training Workflow</CardTitle>
              <CardDescription>
                Generate training data from your knowledge base, review it, then train Deep Memory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Step 1: Generate */}
              {step === "idle" && (
                <>
                  <Button
                    onClick={handleGenerate}
                    disabled={!!settings?.has_blocking_run}
                  >
                    Generate Training Data
                  </Button>
                  {settings?.has_blocking_run && (
                    <p className="text-sm text-muted-foreground">
                      {settings.blocking_run_status === "generating"
                        ? "A training run is currently generating data."
                        : settings.blocking_run_status === "generated"
                          ? "A training run is awaiting review. Complete or remove it before starting a new generation."
                          : settings.blocking_run_status === "training"
                            ? "A training run is currently training Deep Memory."
                            : "A failed training run must be resolved before starting new generation. Use Proceed to resume or Delete to clean up."}
                    </p>
                  )}
                </>
              )}

              {step === "generating" && jobId && (
                <TrainingProgress
                  jobId={jobId}
                  type="generating"
                  onComplete={handleGenerationComplete}
                  onError={(err) => { setError(err); setStep("idle"); setJobId(null) }}
                />
              )}

              {/* Step 2: Review */}
              {step === "generated" && currentRun && (
                <>
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Review Training Data</h3>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>{currentRun.pair_count} pairs generated</span>
                      <span>{currentRun.statistics.avg_questions_per_chunk} avg questions/chunk</span>
                      <span>{currentRun.statistics.chunk_coverage_pct}% coverage</span>
                    </div>
                  </div>
                  <SamplePairsTable pairs={currentRun.sample_pairs} />
                  <Separator />
                  <Button onClick={handleTrain}>
                    Start Training
                  </Button>
                </>
              )}

              {/* Step 3: Training */}
              {step === "training" && jobId && (
                <TrainingProgress
                  jobId={jobId}
                  type="training"
                  onComplete={handleTrainingComplete}
                  onError={(err) => { setError(err); setStep("idle"); setJobId(null) }}
                />
              )}

              {/* Step 4: Results */}
              {step === "completed" && currentRun && (
                <>
                  <TrainingMetrics metrics={currentRun.metrics} />
                  <Button variant="outline" onClick={() => setStep("idle")}>
                    Start New Training
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Training History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Training History</CardTitle>
            </CardHeader>
            <CardContent>
              <TrainingRunHistory
                runs={runs}
                onSelectRun={handleSelectRun}
                onRefreshRun={handleRefreshRun}
                onProceedRun={handleProceed}
                onRemoveRun={handleRemove}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
