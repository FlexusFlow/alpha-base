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
import { Loader2, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { subscribeToJob } from '@/lib/api/events';
import { CookieCheckResponse } from '@/lib/types/articles';
import { DiscoveryResponse, ScrapeResponse, DiscoveredPage } from '@/lib/types/documentation';

type Phase = 'input' | 'discovering' | 'preview' | 'scraping';

export function DocumentationFetchForm() {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [cookieCheck, setCookieCheck] = useState<CookieCheckResponse | null>(null);
  const [showNoCookieWarning, setShowNoCookieWarning] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null);
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
      const res = await fetch(`/api/documentation/check-cookies?url=${encodeURIComponent(value)}`);
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

  const handleDiscover = async (useCookies: boolean = true) => {
    if (!validateUrl(url)) return;

    if (useCookies && cookieCheck && !cookieCheck.has_cookies && !showNoCookieWarning) {
      setShowNoCookieWarning(true);
      return;
    }

    setShowNoCookieWarning(false);
    setPhase('discovering');

    try {
      const res = await fetch('/api/documentation/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, use_cookies: useCookies }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({
          title: 'Discovery failed',
          description: data.detail || data.error || 'Failed to discover pages',
          variant: 'destructive',
        });
        setPhase('input');
        return;
      }

      const data: DiscoveryResponse = await res.json();
      setDiscovery(data);
      setPhase('preview');
    } catch {
      toast({
        title: 'Discovery failed',
        description: 'A network error occurred. Please try again.',
        variant: 'destructive',
      });
      setPhase('input');
    }
  };

  const handleScrape = async () => {
    if (!discovery) return;
    setPhase('scraping');

    try {
      const res = await fetch('/api/documentation/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_url: discovery.entry_url,
          site_name: discovery.site_name,
          scope_path: discovery.scope_path,
          pages: discovery.pages,
          use_cookies: discovery.has_cookies,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({
          title: 'Failed to start scraping',
          description: data.error || 'An unexpected error occurred',
          variant: 'destructive',
        });
        setPhase('preview');
        return;
      }

      const data: ScrapeResponse = await res.json();

      toast({
        title: 'Scraping started',
        description: `Scraping ${discovery.total_count} pages...`,
      });

      subscribeToJob(
        data.job_id,
        (update) => {
          if (update.status === 'completed') {
            toast({
              title: 'Documentation scraped',
              description: update.message,
            });
            router.push(`/dashboard/knowledge/documentation/${data.collection_id}`);
          } else if (update.status === 'failed') {
            toast({
              title: 'Scraping failed',
              description: update.message,
              variant: 'destructive',
            });
            setPhase('input');
          }
        },
        () => {
          // SSE error
        },
      );
    } catch {
      toast({
        title: 'Failed to start scraping',
        description: 'A network error occurred. Please try again.',
        variant: 'destructive',
      });
      setPhase('preview');
    }
  };

  const handleCancel = () => {
    setDiscovery(null);
    setPhase('input');
  };

  return (
    <div className="space-y-4">
      {/* Phase 1: URL Input */}
      {(phase === 'input' || phase === 'discovering') && (
        <div className="space-y-2">
          <label htmlFor="doc-url" className="text-sm font-medium">
            Documentation URL
          </label>
          <div className="flex gap-2">
            <Input
              id="doc-url"
              placeholder="https://docs.example.com/guide/"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDiscover();
              }}
              disabled={phase === 'discovering'}
            />
            <Button
              onClick={() => handleDiscover()}
              disabled={phase === 'discovering' || !url.trim() || !!urlError}
            >
              {phase === 'discovering' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Discovering...
                </>
              ) : (
                'Discover Pages'
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
      )}

      {/* Phase 2: Preview discovered pages */}
      {phase === 'preview' && discovery && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{discovery.site_name}</h3>
            <p className="text-sm text-muted-foreground">
              Found {discovery.total_count} documentation pages
            </p>
            {discovery.truncated && (
              <p className="text-sm text-yellow-600">
                Showing first {discovery.total_count} of {discovery.original_count} pages found.
                Pages beyond the limit will not be scraped.
              </p>
            )}
          </div>

          <div className="border rounded-md max-h-80 overflow-y-auto">
            <ul className="divide-y">
              {discovery.pages.map((page: DiscoveredPage, i: number) => (
                <li key={i} className="px-3 py-2 text-sm flex items-center gap-2">
                  <span className="text-muted-foreground w-6 text-right shrink-0">
                    {i + 1}.
                  </span>
                  <span className="truncate flex-1">{page.title || page.url}</span>
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleScrape}>
              Scrape All ({discovery.total_count} pages)
            </Button>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Phase 3: Scraping in progress */}
      {phase === 'scraping' && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Scraping documentation pages... You can navigate away and come back later.</span>
        </div>
      )}

      {/* No cookies warning dialog */}
      <AlertDialog open={showNoCookieWarning} onOpenChange={setShowNoCookieWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No cookies found</AlertDialogTitle>
            <AlertDialogDescription>
              No cookies are available for {cookieCheck?.domain}. If this documentation site
              requires authentication, the scraper may not be able to access all pages.
              You can upload cookies in the Cookie Management section.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDiscover(false)}>
              Proceed without cookies
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
