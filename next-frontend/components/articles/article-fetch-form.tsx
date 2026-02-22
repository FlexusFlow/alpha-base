'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { subscribeToJob } from '@/lib/api/events';
import { ArticleScrapeResponse, CookieCheckResponse } from '@/lib/types/articles';

export function ArticleFetchForm() {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cookieCheck, setCookieCheck] = useState<CookieCheckResponse | null>(null);
  const [showNoCookieWarning, setShowNoCookieWarning] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { toast } = useToast();
  const router = useRouter();

  const validateUrl = (value: string): boolean => {
    if (!value.trim()) {
      setUrlError('');
      return false;
    }
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setUrlError('URL must start with http:// or https://');
        return false;
      }
      setUrlError('');
      return true;
    } catch {
      setUrlError('Invalid URL format');
      return false;
    }
  };

  const checkCookies = async (value: string) => {
    if (!validateUrl(value)) {
      setCookieCheck(null);
      return;
    }

    try {
      const res = await fetch(`/api/articles/check-cookies?url=${encodeURIComponent(value)}`);
      if (res.ok) {
        const data: CookieCheckResponse = await res.json();
        setCookieCheck(data);
      }
    } catch {
      setCookieCheck(null);
    }
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => checkCookies(value), 500);
  };

  const handleSubmit = async (useCookies: boolean = true) => {
    if (!validateUrl(url)) return;

    // If no cookies and user hasn't been warned yet
    if (useCookies && cookieCheck && !cookieCheck.has_cookies && !showNoCookieWarning) {
      setShowNoCookieWarning(true);
      return;
    }

    setShowNoCookieWarning(false);
    setLoading(true);

    try {
      const res = await fetch('/api/articles/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, use_cookies: useCookies }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({
          title: 'Failed to start scraping',
          description: data.error || 'An unexpected error occurred',
          variant: 'destructive',
        });
        return;
      }

      const data: ArticleScrapeResponse = await res.json();

      toast({
        title: 'Article scraping started',
        description: 'You will be notified when the article is ready.',
      });

      // Subscribe to SSE for job updates
      subscribeToJob(
        data.job_id,
        (update) => {
          if (update.status === 'completed') {
            toast({
              title: 'Article ready',
              description: update.message,
            });
            router.push(`/dashboard/knowledge/articles/${data.article_id}`);
          } else if (update.status === 'failed') {
            toast({
              title: 'Scraping failed',
              description: update.message,
              variant: 'destructive',
            });
          }
        },
        () => {
          // SSE error — article may still be processing
        },
      );

      setUrl('');
      setCookieCheck(null);
    } catch {
      toast({
        title: 'Failed to start scraping',
        description: 'A network error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="article-url" className="text-sm font-medium">
          Article URL
        </label>
        <div className="flex gap-2">
          <Input
            id="article-url"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            disabled={loading}
          />
          <Button onClick={() => handleSubmit()} disabled={loading || !url.trim() || !!urlError}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scraping...
              </>
            ) : (
              'Scrape Article'
            )}
          </Button>
        </div>
        {urlError && <p className="text-sm text-destructive">{urlError}</p>}
        {cookieCheck && !cookieCheck.has_cookies && url && !urlError && (
          <p className="text-sm text-muted-foreground">
            No cookies found for {cookieCheck.domain}. Paywalled content may not be accessible.
          </p>
        )}
      </div>

      {/* No cookies warning dialog */}
      <AlertDialog open={showNoCookieWarning} onOpenChange={setShowNoCookieWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No cookies found</AlertDialogTitle>
            <AlertDialogDescription>
              No cookies are available for {cookieCheck?.domain}. If this is a paywalled site,
              the scraper may not be able to access the full content. You can upload cookies
              in the Cookie Management section.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSubmit(false)}>
              Proceed without cookies
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
