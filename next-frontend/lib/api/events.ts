import { JobStatusUpdate } from '../types/knowledge';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL

export function subscribeToJob(
  jobId: string,
  onUpdate: (data: JobStatusUpdate) => void,
  onError?: (error: Event) => void
): EventSource {
  const eventSource = new EventSource(`${API_BASE_URL}/v1/api/events/stream/${jobId}`);

  eventSource.addEventListener('job_update', (event: MessageEvent) => {
    const data: JobStatusUpdate = JSON.parse(event.data);
    onUpdate(data);
    if (data.status === 'completed' || data.status === 'failed') {
      eventSource.close();
    }
  });

  if (onError) {
    eventSource.onerror = onError;
  }

  return eventSource;
}
