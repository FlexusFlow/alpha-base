import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { DocumentationPage } from '@/lib/types/documentation';

interface Props {
  page: DocumentationPage;
  collectionId: string;
}

export function DocumentationPageViewer({ page, collectionId }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/dashboard/knowledge/documentation/${collectionId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to collection
        </Link>
        <h1 className="text-3xl font-bold">{page.title || 'Untitled Page'}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <a
            href={page.page_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground"
          >
            Source
            <ExternalLink className="h-3 w-3" />
          </a>
          {page.is_truncated && (
            <Badge variant="outline">Content truncated (200KB limit)</Badge>
          )}
        </div>
      </div>

      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {page.content_markdown || '*No content available*'}
        </ReactMarkdown>
      </div>
    </div>
  );
}
