'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Youtube, FileText, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ChannelCard } from '@/components/youtube/channel-card';
import { createBrowserChannelHelpers } from '@/lib/supabase/channels';
import { DbChannel } from '@/lib/types/database';

export default function KnowledgeBasePage() {
  const [channels, setChannels] = useState<DbChannel[]>([]);
  const [loading, setLoading] = useState(true);

  const channelHelpers = useMemo(() => createBrowserChannelHelpers(), []);

  useEffect(() => {
    channelHelpers
      .getChannels()
      .then(setChannels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelHelpers]);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Knowledge Base</h1>
        <p className="text-muted-foreground mt-1">
          Manage and extend your knowledge base with articles and videos
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Youtube className="h-5 w-5" />
              YouTube Channel
            </CardTitle>
            <CardDescription>
              Add videos from a YouTube channel to your knowledge base
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/knowledge/youtube/add">Add YouTube Channel</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Article
            </CardTitle>
            <CardDescription>
              Add articles and documents to your knowledge base (Coming soon)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled>Add Article</Button>
          </CardContent>
        </Card>
      </div>

      {/* Scraped Channels */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Scraped Channels</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading channels...
          </div>
        ) : channels.length === 0 ? (
          <p className="text-muted-foreground">No channels scraped yet</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {channels.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
