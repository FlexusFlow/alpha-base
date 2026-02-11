'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, Youtube, Clock, Trash2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DbChannel } from '@/lib/types/database';

interface ChannelCardProps {
  channel: DbChannel;
  onDelete?: (channel: DbChannel) => void;
  deleting?: boolean;
}

export function ChannelCard({ channel, onDelete, deleting }: ChannelCardProps) {
  const router = useRouter();
  const lastScraped = channel.last_scraped_at
    ? new Date(channel.last_scraped_at).toLocaleDateString()
    : 'Never';

  return (
    <Card
      className="hover:bg-accent/50 transition-colors cursor-pointer h-full"
      onClick={() => router.push(`/dashboard/knowledge/youtube/add?url=${encodeURIComponent(channel.channel_url)}`)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 truncate">
            <Youtube className="h-4 w-4 shrink-0" />
            <span className="truncate">{channel.channel_title}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                disabled={deleting}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(channel);
                }}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
            <a
              href={channel.channel_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{channel.total_videos} videos</span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {lastScraped}
        </span>
      </CardContent>
    </Card>
  );
}
