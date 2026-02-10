import { useEffect, useRef, useState } from "react";

import Alert from "@mui/material/Alert";
import LinearProgress from "@mui/material/LinearProgress";
import Snackbar from "@mui/material/Snackbar";
import Typography from "@mui/material/Typography";

import { subscribeToJob } from "../api/events";
import type { JobStatusUpdate } from "../types/knowledge";

interface JobNotificationProps {
  jobId: string | null;
  onComplete?: () => void;
}

export default function JobNotification({
  jobId,
  onComplete,
}: JobNotificationProps) {
  const [status, setStatus] = useState<JobStatusUpdate | null>(null);
  const [open, setOpen] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    setOpen(true);
    const es = subscribeToJob(
      jobId,
      (data) => {
        setStatus(data);
        if (data.status === "completed" || data.status === "failed") {
          onComplete?.();
        }
      },
      () => {
        // SSE error - keep snackbar open, it will auto-reconnect
      }
    );
    eventSourceRef.current = es;

    return () => {
      es.close();
    };
  }, [jobId, onComplete]);

  if (!jobId || !open) return null;

  const isComplete = status?.status === "completed";
  const isFailed = status?.status === "failed";
  const isProcessing =
    status?.status === "in_progress" || status?.status === "pending";

  if (isComplete || isFailed) {
    return (
      <Snackbar
        open={open}
        autoHideDuration={8000}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={isComplete ? "success" : "error"}
          onClose={() => setOpen(false)}
          variant="filled"
        >
          {status?.message}
          {isFailed && status.failed_videos.length > 0 && (
            <Typography variant="caption" display="block">
              Failed: {status.failed_videos.length} videos
            </Typography>
          )}
        </Alert>
      </Snackbar>
    );
  }

  if (isProcessing && status) {
    return (
      <Snackbar
        open={open}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="info" variant="filled" className="w-80">
          <Typography variant="body2" className="mb-1">
            {status.message || "Starting..."}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={status.progress}
            className="mt-1"
          />
          <Typography variant="caption">
            {status.processed_videos}/{status.total_videos} videos
          </Typography>
        </Alert>
      </Snackbar>
    );
  }

  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >
      <Alert severity="info" variant="filled">
        Starting knowledge base update...
      </Alert>
    </Snackbar>
  );
}
