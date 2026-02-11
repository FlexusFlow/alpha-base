'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Youtube, FileText, Loader2, CheckSquare, X } from 'lucide-react';
import Link from 'next/link';
import { ChannelCard } from '@/components/youtube/channel-card';
import { createBrowserChannelHelpers } from '@/lib/supabase/channels';
import { DbChannel } from '@/lib/types/database';
import { useToast } from '@/hooks/use-toast';

export default function KnowledgeBasePage() {
  const [channels, setChannels] = useState<DbChannel[]>([]);
  const [loading, setLoading] = useState(true);

  // Single delete state
  const [channelToDelete, setChannelToDelete] = useState<DbChannel | null>(null);
  const [transcribedCount, setTranscribedCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk delete state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());
  const [showBulkDialog, setShowBulkDialog] = useState(false);

  const channelHelpers = useMemo(() => createBrowserChannelHelpers(), []);
  const { toast } = useToast();

  useEffect(() => {
    channelHelpers
      .getChannels()
      .then(setChannels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelHelpers]);

  // --- Single delete ---
  const handleDeleteRequest = async (channel: DbChannel) => {
    try {
      const count = await channelHelpers.getTranscribedCount(channel.id);
      setTranscribedCount(count);
    } catch {
      setTranscribedCount(0);
    }
    setChannelToDelete(channel);
  };

  const handleDeleteConfirm = async () => {
    if (!channelToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/channels/${channelToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        setChannels((prev) => prev.filter((c) => c.id !== channelToDelete.id));
        toast({ title: 'Channel deleted', description: data.message });
      } else if (response.status === 404) {
        setChannels((prev) => prev.filter((c) => c.id !== channelToDelete.id));
        toast({ title: 'Channel was already deleted', description: 'The channel list has been refreshed.' });
      } else {
        toast({ title: 'Failed to delete channel', description: data.detail || data.error || 'An unexpected error occurred', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to delete channel', description: 'A network error occurred. Please try again.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setChannelToDelete(null);
    }
  };

  // --- Bulk delete ---
  const toggleSelection = (channelId: string) => {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  };

  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedChannelIds(new Set());
  };

  const selectedChannels = channels.filter((c) => selectedChannelIds.has(c.id));
  const totalSelectedVideos = selectedChannels.reduce((sum, c) => sum + c.total_videos, 0);

  const handleBulkDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch('/api/channels/delete-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_ids: Array.from(selectedChannelIds) }),
      });

      const data = await response.json();

      if (response.ok) {
        const succeededIds = new Set((data.succeeded || []).map((s: { channel_id: string }) => s.channel_id));
        setChannels((prev) => prev.filter((c) => !succeededIds.has(c.id)));

        if (data.failed?.length > 0) {
          toast({
            title: 'Partial deletion',
            description: data.message,
            variant: 'destructive',
          });
        } else {
          toast({ title: 'Channels deleted', description: data.message });
        }
      } else {
        toast({ title: 'Failed to delete channels', description: data.detail || data.error || 'An unexpected error occurred', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to delete channels', description: 'A network error occurred. Please try again.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setShowBulkDialog(false);
      exitSelectMode();
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 pb-24">
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
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Scraped Channels</h2>
          {channels.length > 0 && (
            isSelectMode ? (
              <Button variant="outline" size="sm" onClick={exitSelectMode}>
                <X className="mr-1 h-4 w-4" />
                Cancel
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setIsSelectMode(true)}>
                <CheckSquare className="mr-1 h-4 w-4" />
                Select
              </Button>
            )
          )}
        </div>
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
              <div key={channel.id} className="relative">
                {isSelectMode && (
                  <div
                    className="absolute top-3 left-3 z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelection(channel.id);
                    }}
                  >
                    <Checkbox
                      checked={selectedChannelIds.has(channel.id)}
                      onCheckedChange={() => toggleSelection(channel.id)}
                    />
                  </div>
                )}
                <div
                  className={isSelectMode && selectedChannelIds.has(channel.id) ? 'ring-2 ring-primary rounded-lg' : ''}
                  onClick={isSelectMode ? (e) => { e.preventDefault(); toggleSelection(channel.id); } : undefined}
                >
                  <ChannelCard
                    channel={channel}
                    onDelete={isSelectMode ? undefined : handleDeleteRequest}
                    deleting={isDeleting && channelToDelete?.id === channel.id}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Delete Floating Action Bar */}
      {isSelectMode && selectedChannelIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-4 z-50">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedChannelIds.size} channel{selectedChannelIds.size > 1 ? 's' : ''} selected
            </span>
            <Button
              variant="destructive"
              onClick={() => setShowBulkDialog(true)}
            >
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* Single Delete Confirmation Dialog */}
      <AlertDialog open={!!channelToDelete} onOpenChange={(open) => { if (!open) setChannelToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete channel?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will permanently delete <strong>{channelToDelete?.channel_title}</strong> and
                  all {channelToDelete?.total_videos} associated videos.
                </p>
                {transcribedCount > 0 && (
                  <p className="text-destructive font-medium">
                    {transcribedCount} of {channelToDelete?.total_videos} videos have been transcribed.
                    Deleting this channel will also remove their transcripts and search data from the knowledge base.
                  </p>
                )}
                <p className="text-sm">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDialog} onOpenChange={(open) => { if (!open) setShowBulkDialog(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedChannelIds.size} channels?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will permanently delete <strong>{selectedChannelIds.size} channels</strong> and
                  all {totalSelectedVideos} associated videos.
                </p>
                <p className="text-sm">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedChannelIds.size} Channels`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
