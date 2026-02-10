'use client';

import { Badge } from '@/components/ui/badge';
import { YTChannelPreview } from '@/lib/types/youtube';
import { ExternalLink } from 'lucide-react';
import { ReactElement } from 'react';

interface ChannelInfoProps {
  loading: ReactElement | null;
  preview: YTChannelPreview;
  onCategoryClick?: (category: string) => void;
  selectedCategory?: string | null;
}

export function ChannelInfo({ preview, onCategoryClick, selectedCategory, loading }: ChannelInfoProps) {
  return (
    <div className="relative space-y-3 p-4 border rounded-lg bg-card">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/5 backdrop-blur-sm  transition-opacity duration-300 rounded-lg">
          {loading}
        </div>)}
      <h3 className="text-xl font-semibold">{preview.channel_title}</h3>
      <a
        href={preview.channel_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
      >
        {preview.channel_url}
        <ExternalLink className="h-3 w-3" />
      </a>
      <p className="text-sm text-muted-foreground">{preview.total_videos} videos</p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(preview.categories).map(([category, count]) => {
          const isSelected = selectedCategory === category;
          return (
            <Badge
              key={category}
              variant={isSelected ? "default" : "outline"}
              className={onCategoryClick ? "cursor-pointer hover:bg-primary/80" : ""}
              onClick={() => onCategoryClick?.(category)}
            >
              {category}: {count}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
