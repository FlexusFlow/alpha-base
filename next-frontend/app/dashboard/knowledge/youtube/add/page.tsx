'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { previewChannel } from '@/lib/api/youtube';
import { addToKnowledge } from '@/lib/api/knowledge';
import { createClient } from '@/lib/supabase/client';
import { ChannelInfo } from '@/components/youtube/channel-info';
import { VideoTable } from '@/components/youtube/video-table';
import { JobNotification } from '@/components/youtube/job-notification';
import { YTChannelPreview } from '@/lib/types/youtube';
import { JobStatusUpdate } from '@/lib/types/knowledge';

type Phase = 'idle' | 'loading' | 'ready' | 'submitting' | 'processing';

export default function AddYouTubeChannelPage() {
  return (
    <Suspense>
      <AddYouTubeChannelContent />
    </Suspense>
  );
}

function AddYouTubeChannelContent() {
  const searchParams = useSearchParams();
  const urlParam = searchParams.get('url');

  const [url, setUrl] = useState(urlParam ?? '');
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
  const autoTriggered = useRef(false);

  // Auto-trigger preview when navigating from a channel card with ?url= param
  useEffect(() => {
    if (urlParam && !autoTriggered.current) {
      autoTriggered.current = true;
      handlePreview();
    }
  }, [urlParam]);

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
      const options: { url: string; page: number; pageSize: number; category?: string } = {
        url: url.trim(),
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
      };
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

    try {
      const options: { url: string; page: number; pageSize: number; category?: string } = {
        url: url.trim(),
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
      };
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

  const handleAddToKnowledge = async () => {
    if (!preview || selectedIds.size === 0) return;
    setPhase('submitting');
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be logged in to add videos to the knowledge base');
      setPhase('ready');
      return;
    }

    const idsToTranscribe = Array.from(selectedIds);

    const videosToProcess = preview.videos
      .filter((v) => idsToTranscribe.includes(v.video_id))
      .map((v) => ({ video_id: v.video_id, title: v.title }));

    try {
      const response = await addToKnowledge({
        channel_title: preview.channel_title,
        videos: videosToProcess,
        user_id: user.id,
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
    setSelectedIds(new Set(data.failed_videos));

    // Mark succeeded videos as transcribed so checkboxes disable and rowSelection re-syncs
    const succeededSet = new Set(data.succeeded_videos);
    if (succeededSet.size > 0) {
      setPreview((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          videos: prev.videos.map((v) =>
            succeededSet.has(v.video_id) ? { ...v, is_transcribed: true } : v
          ),
        };
      });
    }
  }, []);

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
