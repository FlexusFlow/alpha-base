'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { ExternalLink, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { subscribeToJob } from '@/lib/api/events';
import { DocumentationCollection, DocumentationPage } from '@/lib/types/documentation';

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  pending: { variant: 'outline', label: 'Pending' },
  scraping: { variant: 'secondary', label: 'Scraping...' },
  completed: { variant: 'default', label: 'Completed' },
  failed: { variant: 'destructive', label: 'Failed' },
};

interface Props {
  collection: DocumentationCollection;
  pages: DocumentationPage[];
}

export function DocumentationCollectionViewer({ collection, pages }: Props) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/documentation/${collection.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Collection deleted' });
        router.push('/dashboard/knowledge');
      } else {
        const data = await res.json();
        toast({ title: 'Failed to delete', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to delete', description: 'Network error', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/documentation/${collection.id}/retry`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: 'Retry failed', description: data.error || data.detail, variant: 'destructive' });
        setIsRetrying(false);
        return;
      }

      const data = await res.json();
      toast({ title: 'Retrying failed pages', description: data.message });

      subscribeToJob(
        data.job_id,
        (update) => {
          if (update.status === 'completed') {
            toast({ title: 'Retry complete', description: update.message });
            router.refresh();
          } else if (update.status === 'failed') {
            toast({ title: 'Retry failed', description: update.message, variant: 'destructive' });
          }
        },
      );
    } catch {
      toast({ title: 'Retry failed', description: 'Network error', variant: 'destructive' });
    } finally {
      setIsRetrying(false);
    }
  };

  const failedCount = pages.filter((p) => p.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{collection.site_name || 'Documentation'}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <a
            href={collection.entry_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground"
          >
            {new URL(collection.entry_url).hostname}
            <ExternalLink className="h-3 w-3" />
          </a>
          <span>
            {collection.successful_pages} of {collection.total_pages} pages
          </span>
          <span>{new Date(collection.created_at).toLocaleDateString()}</span>
        </div>

        {/* Status banner */}
        {collection.status === 'partial' && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm">
            {failedCount} page{failedCount !== 1 ? 's' : ''} failed to scrape. You can retry them below.
          </div>
        )}
        {collection.status === 'failed' && collection.error_message && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-destructive">
            {collection.error_message}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {collection.status === 'partial' && (
            <Button variant="outline" size="sm" onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Retry failed pages
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Page list */}
      <div className="border rounded-md">
        <ul className="divide-y">
          {pages.map((page) => {
            const badge = STATUS_BADGE[page.status];
            return (
              <li
                key={page.id}
                className="px-4 py-3 flex items-center gap-3 hover:bg-muted/50 cursor-pointer"
                onClick={() => {
                  if (page.status === 'completed') {
                    router.push(`/dashboard/knowledge/documentation/${collection.id}/pages/${page.id}`);
                  }
                }}
              >
                <span className="text-sm text-muted-foreground w-6 text-right shrink-0">
                  {page.display_order + 1}.
                </span>
                <span className="text-sm flex-1 truncate">
                  {page.title || page.page_url}
                </span>
                {badge && page.status !== 'completed' && (
                  <Badge variant={badge.variant} className="shrink-0">{badge.label}</Badge>
                )}
                {page.is_truncated && (
                  <Badge variant="outline" className="shrink-0">Truncated</Badge>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Delete dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete documentation collection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{collection.site_name}&quot; and all
              {' '}{collection.total_pages} pages, including their search data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
    </div>
  );
}
