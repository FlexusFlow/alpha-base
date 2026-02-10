import type { JobStatusUpdate } from "../types/knowledge";

export function subscribeToJob(
  jobId: string,
  onUpdate: (data: JobStatusUpdate) => void,
  onError?: (error: Event) => void
): EventSource {
  const baseUrl =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
  const eventSource = new EventSource(
    `${baseUrl}/v1/api/events/stream/${jobId}`
  );

  eventSource.addEventListener("job_update", (event: MessageEvent) => {
    const data: JobStatusUpdate = JSON.parse(event.data);
    onUpdate(data);
    if (data.status === "completed" || data.status === "failed") {
      eventSource.close();
    }
  });

  eventSource.onerror = (event) => {
    onError?.(event);
  };

  return eventSource;
}
