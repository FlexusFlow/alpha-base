'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ArticleSummaryProps {
  articleId: string;
  initialSummary: string | null;
}

export function ArticleSummary({ articleId, initialSummary }: ArticleSummaryProps) {
  const [summary, setSummary] = useState<string | null>(initialSummary);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSummarize = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/articles/${articleId}/summarize`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        toast({
          title: 'Failed to generate summary',
          description: data.error,
          variant: 'destructive',
        });
        return;
      }

      const data = await res.json();
      setSummary(data.summary);
    } catch {
      toast({
        title: 'Failed to generate summary',
        description: 'Network error. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!summary && !loading) {
    return (
      <Button variant="outline" size="sm" onClick={handleSummarize}>
        <Sparkles className="mr-2 h-4 w-4" />
        Summarize
      </Button>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Generating summary...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          AI Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed">{summary}</p>
      </CardContent>
    </Card>
  );
}
