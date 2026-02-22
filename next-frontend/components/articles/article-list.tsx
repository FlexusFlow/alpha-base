'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';
import { Article } from '@/lib/types/articles';

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string } | null> = {
  pending: { variant: 'outline', label: 'Pending' },
  scraping: { variant: 'secondary', label: 'Scraping...' },
  completed: null,
  failed: { variant: 'destructive', label: 'Failed' },
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function ArticleList() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [articleToDelete, setArticleToDelete] = useState<Article | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const fetchArticles = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('articles')
      .select('id, url, title, status, is_truncated, error_message, created_at')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setArticles(data as Article[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const handleDelete = async () => {
    if (!articleToDelete) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/articles/${articleToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setArticles((prev) => prev.filter((a) => a.id !== articleToDelete.id));
        toast({ title: 'Article deleted' });
      } else {
        const data = await res.json();
        toast({ title: 'Failed to delete', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to delete', description: 'Network error', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setArticleToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading articles...
      </div>
    );
  }

  if (articles.length === 0) {
    return <p className="text-muted-foreground">No articles scraped yet</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.map((article) => {
          const badge = STATUS_BADGE[article.status];
          return (
            <Card
              key={article.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                if (article.status === 'completed') {
                  router.push(`/dashboard/knowledge/articles/${article.id}`);
                }
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-medium line-clamp-2">
                    {article.title || extractDomain(article.url)}
                  </CardTitle>
                  {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground truncate">{extractDomain(article.url)}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-muted-foreground">
                    {new Date(article.created_at).toLocaleDateString()}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setArticleToDelete(article);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {article.status === 'failed' && article.error_message && (
                  <p className="text-xs text-destructive mt-1 line-clamp-2">{article.error_message}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!articleToDelete} onOpenChange={(open) => { if (!open) setArticleToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete article?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{articleToDelete?.title || 'this article'}&quot; and
              all associated chat messages. This action cannot be undone.
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
    </>
  );
}
