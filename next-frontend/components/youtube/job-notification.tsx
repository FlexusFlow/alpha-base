'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { subscribeToJob } from '@/lib/api/events';
import { JobStatusUpdate } from '@/lib/types/knowledge';
import { Progress } from '@/components/ui/progress';

interface JobNotificationProps {
  jobId: string | null;
  onComplete?: (data: JobStatusUpdate) => void;
}

export function JobNotification({ jobId, onComplete }: JobNotificationProps) {
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const toastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const es = subscribeToJob(
      jobId,
      (data: JobStatusUpdate) => {
        if (data.status === 'completed') {
          // Dismiss in-progress toast if exists
          if (toastIdRef.current) {
            // Note: shadcn/ui toast doesn't have dismiss by ID, so we'll just show completion
            toastIdRef.current = null;
          }

          toast({
            title: 'Success',
            description: `${data.message} (${data.processed_videos}/${data.total_videos} videos processed)`,
          });
          onComplete?.(data);
        } else if (data.status === 'failed') {
          if (toastIdRef.current) {
            toastIdRef.current = null;
          }

          toast({
            title: 'Error',
            description: `${data.message}${data.failed_videos.length > 0 ? ` (${data.failed_videos.length} failed)` : ''}`,
            variant: 'destructive',
          });
          onComplete?.(data);
        } else if (data.status === 'in_progress') {
          // Show progress toast
          const progressPercent = Math.round(data.progress);
          toast({
            title: 'Processing',
            description: (
              <div className="space-y-2">
                <p>{data.message}</p>
                <Progress value={progressPercent} />
                <p className="text-xs">
                  {data.processed_videos}/{data.total_videos} videos ({progressPercent}%)
                </p>
              </div>
            ),
          });
        }
      },
      (error) => {
        console.error('SSE error:', error);
      }
    );

    eventSourceRef.current = es;

    return () => {
      es.close();
    };
  }, [jobId, onComplete, toast]);

  return null;
}
