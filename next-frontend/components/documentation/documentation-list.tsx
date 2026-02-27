'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DocumentationCollection } from '@/lib/types/documentation';

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string } | null> = {
  discovering: { variant: 'outline', label: 'Discovering...' },
  pending_confirmation: { variant: 'outline', label: 'Pending' },
  scraping: { variant: 'secondary', label: 'Scraping...' },
  completed: null,
  partial: { variant: 'destructive', label: 'Partial' },
  failed: { variant: 'destructive', label: 'Failed' },
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function DocumentationList() {
  const [collections, setCollections] = useState<DocumentationCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchCollections = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('doc_collections')
        .select('id, entry_url, site_name, total_pages, successful_pages, status, error_message, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setCollections(data as DocumentationCollection[]);
      }
      setLoading(false);
    };

    fetchCollections();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading documentation...
      </div>
    );
  }

  if (collections.length === 0) {
    return <p className="text-muted-foreground">No documentation collections yet</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {collections.map((collection) => {
        const badge = STATUS_BADGE[collection.status];
        const pageCount = collection.status === 'completed' || collection.status === 'partial'
          ? `${collection.successful_pages} of ${collection.total_pages} pages`
          : `${collection.total_pages} pages`;

        return (
          <Card
            key={collection.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push(`/dashboard/knowledge/documentation/${collection.id}`)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-medium line-clamp-2">
                  {collection.site_name || extractDomain(collection.entry_url)}
                </CardTitle>
                {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground truncate">{extractDomain(collection.entry_url)}</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-muted-foreground">{pageCount}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(collection.created_at).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
