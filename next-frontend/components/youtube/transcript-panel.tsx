'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, AlertCircle, Copy, Check } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { getVideoTranscript, TranscriptResponse } from '@/lib/api/knowledge';

interface TranscriptPanelProps {
  videoId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TranscriptPanel({ videoId, open, onOpenChange }: TranscriptPanelProps) {
  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyAll = async () => {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!open || !videoId) {
      return;
    }
    setCopied(false);

    let cancelled = false;
    setLoading(true);
    setError(null);
    setTranscript(null);

    getVideoTranscript(videoId)
      .then((data) => {
        if (!cancelled) {
          setTranscript(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load transcript');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [videoId, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{transcript?.title ?? 'Transcript'}</SheetTitle>
          {transcript && (
            <SheetDescription asChild>
              <div className="flex items-center justify-between">
                <a
                  href={transcript.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  Watch on YouTube <ExternalLink className="h-3 w-3" />
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyAll}
                  className="gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy all
                    </>
                  )}
                </Button>
              </div>
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">Unable to load transcript</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          {transcript && (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {transcript.content}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
