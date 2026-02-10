import { useCallback, useState } from "react";

import Alert from "@mui/material/Alert";
import Backdrop from "@mui/material/Backdrop";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { GridRowSelectionModel } from "@mui/x-data-grid";

import { addToKnowledge } from "../api/knowledge";
import { previewChannel } from "../api/youtube";
import ChannelInfo from "../components/ChannelInfo";
import JobNotification from "../components/JobNotification";
import VideoTable from "../components/VideoTable";
import type { YTChannelPreview } from "../types/youtube";

type Phase = "idle" | "loading" | "ready" | "submitting" | "processing";

const EMPTY_SELECTION: GridRowSelectionModel = { type: "include", ids: new Set() };

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<YTChannelPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<GridRowSelectionModel>(EMPTY_SELECTION);
  const [jobId, setJobId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const selectedCount = selectedIds.ids.size;

  const handlePreview = async () => {
    if (!url.trim()) return;
    setPhase("loading");
    setError(null);
    setPreview(null);
    setSelectedIds(EMPTY_SELECTION);
    setJobId(null);

    try {
      const result = await previewChannel(url.trim());
      setPreview(result);
      setPhase("ready");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to preview channel";
      setError(message);
      setPhase("idle");
    }
  };

  const handleAddToKnowledge = async () => {
    if (!preview || selectedCount === 0) return;
    setPhase("submitting");
    setError(null);

    const selectedSet = selectedIds.ids;
    const selectedVideos = preview.videos
      .filter((v) => selectedSet.has(v.video_id))
      .map((v) => ({ video_id: v.video_id, title: v.title }));

    try {
      const response = await addToKnowledge({
        channel_title: preview.channel_title,
        videos: selectedVideos,
      });
      setJobId(response.job_id);
      setPhase("processing");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to start processing";
      setError(message);
      setPhase("ready");
    }
  };

  const handleJobComplete = useCallback(() => {
    setPhase("ready");
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handlePreview();
  };

  return (
    <div>
      <Typography variant="h4" className="mb-4">
        Add YouTube Channel to Knowledge Base
      </Typography>

      {/* URL Input */}
      <div className="flex gap-3 mb-6">
        <TextField
          fullWidth
          label="YouTube Channel URL"
          placeholder="https://youtube.com/@ChannelName"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={phase === "loading"}
          size="small"
        />
        <Button
          variant="contained"
          onClick={handlePreview}
          disabled={!url.trim() || phase === "loading"}
          className="whitespace-nowrap"
        >
          Preview
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Alert severity="error" className="mb-4" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Channel Preview */}
      {preview && (
        <>
          <ChannelInfo preview={preview} />

          <VideoTable
            videos={preview.videos}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />

          <div className="mt-4 flex items-center gap-4">
            <Button
              variant="contained"
              color="secondary"
              onClick={handleAddToKnowledge}
              disabled={
                selectedCount === 0 ||
                phase === "submitting" ||
                phase === "processing"
              }
            >
              Add to My Knowledge ({selectedCount} videos)
            </Button>
            {phase === "processing" && (
              <Typography variant="body2" color="text.secondary">
                Processing in background...
              </Typography>
            )}
          </div>
        </>
      )}

      {/* Loading Overlay */}
      <Backdrop open={phase === "loading"} className="z-50">
        <div className="flex flex-col items-center gap-3">
          <CircularProgress color="inherit" />
          <Typography color="white">Loading channel preview...</Typography>
        </div>
      </Backdrop>

      {/* Job Notification */}
      <JobNotification jobId={jobId} onComplete={handleJobComplete} />
    </div>
  );
}
