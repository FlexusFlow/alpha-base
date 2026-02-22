'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
import { ExternalLink, Download, Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Article } from '@/lib/types/articles';
import { ArticleSummary } from './article-summary';
import { ArticleChat } from './article-chat';
import { generateArticlePdf } from '@/lib/pdf';

interface ArticleViewerProps {
  article: Article;
}

export function ArticleViewer({ article }: ArticleViewerProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/articles/${article.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Article deleted' });
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{article.title || 'Untitled Article'}</h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {new URL(article.url).hostname}
          </a>
          <span>{new Date(article.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {article.is_truncated && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
          This article was truncated to fit the 200KB size limit.
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => generateArticlePdf(article.title || 'article', article.content_markdown || '')}
        >
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowChat(!showChat)}
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          {showChat ? 'Hide Chat' : 'Ask Questions'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setShowDeleteDialog(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>

      {/* AI Summary */}
      <ArticleSummary articleId={article.id} initialSummary={article.summary} />

      {/* Chat */}
      {showChat && <ArticleChat articleId={article.id} />}

      {/* Article content */}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {article.content_markdown || ''}
        </ReactMarkdown>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete article?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this article and all associated chat messages.
              This action cannot be undone.
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
