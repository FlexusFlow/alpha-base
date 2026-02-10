'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { previewChannel } from '@/lib/api/youtube';
import { addToKnowledge } from '@/lib/api/knowledge';
import { ChannelInfo } from '@/components/youtube/channel-info';
import { VideoTable } from '@/components/youtube/video-table';
import { JobNotification } from '@/components/youtube/job-notification';
import { YTChannelPreview } from '@/lib/types/youtube';
import { JobStatusUpdate } from '@/lib/types/knowledge';
import { saveChannelWithVideos, markVideosTranscribed, getTranscribedVideoIds } from '@/lib/supabase/channels';

type Phase = 'idle' | 'loading' | 'ready' | 'submitting' | 'processing';

export default function AddYouTubeChannelPage() {
  const [url, setUrl] = useState('' );
  const [preview, setPreview] = useState<YTChannelPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
    });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [transcribingVideoIds, setTranscribingVideoIds] = useState<string[]>([]);

  useEffect(() => {
    if (preview) {
      fetchPage(selectedCategory);
    }
  }, [pagination.pageIndex, pagination.pageSize])

  const fetchPage = async (category?: string | null) => {
    if (!url.trim()) return;
    setPhase('loading');
    setError(null);
    try {
      const options: any = { url: url.trim(), limit: pagination.pageSize, skip: (pagination.pageIndex * pagination.pageSize) };
      if (category) {
        options.category = category;
      }
      const result = await previewChannel(options);
      setPreview(result);
      setPhase('ready');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to preview channel';
      setError(message);
      setPhase('ready');
    }
  };

  const handlePreview = async (category?: string | null) => {
    if (!url.trim()) return;
    setPhase('loading');
    setError(null);
    if (!category) {
      setPreview(null);
      setSelectedIds(new Set());
    }
    setJobId(null);
    setSaveStatus('idle');

    try {
      const options: any = { url: url.trim(), limit: pagination.pageSize, skip: (pagination.pageIndex * pagination.pageSize) };
      if (category) {
        options.category = category;
      }
      const result = await previewChannel(options);
      setPreview(result);
      setPhase('ready');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to preview channel';
      setError(message);
      setPhase('idle');
    }
  };

  const handleCategoryClick = (category: string) => {
    if (selectedCategory === category) {
      // Clear filter - show all videos
      setSelectedCategory(null);
      fetchPage()
    } else {
      // Apply category filter
      setSelectedCategory(category);
      handlePreview(category);
    }
  };

  const handleSaveResults = async () => {
    if (!preview) return;
    setSaveStatus('saving');
    try {
      await saveChannelWithVideos(preview, preview.videos);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  };

  const handleAddToKnowledge = async () => {
    if (!preview || selectedIds.size === 0) return;
    setPhase('submitting');
    setError(null);

    // Auto-save channel + all scraped videos to Supabase (non-blocking)
    saveChannelWithVideos(preview, preview.videos)
      .then(() => setSaveStatus('saved'))
      .catch(() => {/* save failure shouldn't block transcription */});

    const selectedVideoIds = Array.from(selectedIds);

    // Filter out already-transcribed videos
    let idsToTranscribe = selectedVideoIds;
    try {
      const alreadyTranscribed = await getTranscribedVideoIds(selectedVideoIds);
      if (alreadyTranscribed.size > 0) {
        idsToTranscribe = selectedVideoIds.filter((id) => !alreadyTranscribed.has(id));
      }
    } catch {
      // If check fails, proceed with all selected videos
    }

    if (idsToTranscribe.length === 0) {
      setError('All selected videos have already been transcribed.');
      setPhase('ready');
      return;
    }

    setTranscribingVideoIds(idsToTranscribe);

    const videosToProcess = preview.videos
      .filter((v) => idsToTranscribe.includes(v.video_id))
      .map((v) => ({ video_id: v.video_id, title: v.title }));

    try {
      const response = await addToKnowledge({
        channel_title: preview.channel_title,
        videos: videosToProcess,
      });
      setJobId(response.job_id);
      setPhase('processing');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start processing';
      setError(message);
      setPhase('ready');
    }
  };

  const handleJobComplete = useCallback((data: JobStatusUpdate) => {
    setPhase('ready');
    setJobId(null);

    // Mark successfully transcribed videos in Supabase
    const failedSet = new Set(data.failed_videos);
    const succeededIds = transcribingVideoIds.filter((id) => !failedSet.has(id));
    if (succeededIds.length > 0) {
      markVideosTranscribed(succeededIds).catch(() => {/* best effort */});
    }
    setTranscribingVideoIds([]);
  }, [transcribingVideoIds]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handlePreview();
  };

  const handleSelectionChange = useCallback((ids: Set<string>) => {
    setSelectedIds(ids);
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Add YouTube Channel to Knowledge Base</h1>
        <p className="text-muted-foreground mt-1">
          Enter a YouTube channel URL to preview and select videos to add
        </p>
      </div>

      {/* URL Input */}
      <div className="flex gap-3">
        <div className="flex-1">
          <Label htmlFor="channel-url">YouTube Channel URL</Label>
          <Input
            id="channel-url"
            placeholder="https://youtube.com/@ChannelName"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={phase === 'loading'}
          />
        </div>
        <Button
          onClick={() => handlePreview()}
          disabled={!url.trim() || phase === 'loading'}
          className="self-end"
        >
          {phase === 'loading' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Preview
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Channel Preview */}
      {preview && (
        <>
          <ChannelInfo
            preview={preview}
            onCategoryClick={handleCategoryClick}
            selectedCategory={selectedCategory}
            loading={phase === 'loading' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          />

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleSaveResults}
              disabled={saveStatus === 'saving' || saveStatus === 'saved'}
            >
              {saveStatus === 'saving' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saveStatus === 'saved' ? 'Saved' : 'Save Results'}
            </Button>
            {saveStatus === 'saved' && (
              <p className="text-sm text-green-600">Channel and videos saved</p>
            )}
            {saveStatus === 'error' && (
              <p className="text-sm text-red-600">Failed to save</p>
            )}
          </div>

          <VideoTable
            videos={preview.videos}
            totalCount={preview.total_videos}
            selectedIds={selectedIds}
            onSelectionChange={handleSelectionChange}
            onPaginationChange={setPagination}
            loading={phase === 'loading' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          />

          <div className="flex items-center gap-4">
            <Button
              onClick={handleAddToKnowledge}
              disabled={selectedIds.size === 0 || phase === 'submitting' || phase === 'processing'}
              size="lg"
            >
              {phase === 'submitting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add to My Knowledge ({selectedIds.size} videos)
            </Button>
            {phase === 'processing' && (
              <p className="text-sm text-muted-foreground">Processing in background...</p>
            )}
          </div>
        </>
      )}

      {/* Job Notification */}
      <JobNotification jobId={jobId} onComplete={handleJobComplete} />
    </div>
  );
}
