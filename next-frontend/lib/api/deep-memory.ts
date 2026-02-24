import type {
  DeepMemorySettings,
  GenerateResponse,
  TrainResponse,
  TrainingRunDetail,
  TrainingRunSummary,
} from '../types/deep-memory';

export async function generateTrainingData(): Promise<GenerateResponse> {
  const res = await fetch('/api/deep-memory/generate', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to start generation');
  }
  return res.json();
}

export async function startTraining(runId: string): Promise<TrainResponse> {
  const res = await fetch('/api/deep-memory/train', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ training_run_id: runId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to start training');
  }
  return res.json();
}

export async function getTrainingRuns(): Promise<TrainingRunSummary[]> {
  const res = await fetch('/api/deep-memory/runs');
  if (!res.ok) throw new Error('Failed to fetch training runs');
  const data = await res.json();
  return data.runs;
}

export async function getTrainingRun(runId: string): Promise<TrainingRunDetail> {
  const res = await fetch(`/api/deep-memory/runs/${runId}`);
  if (!res.ok) throw new Error('Failed to fetch training run');
  return res.json();
}

export async function getSettings(): Promise<DeepMemorySettings> {
  const res = await fetch('/api/deep-memory/settings');
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function updateSettings(enabled: boolean): Promise<void> {
  const res = await fetch('/api/deep-memory/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update settings');
  }
}
