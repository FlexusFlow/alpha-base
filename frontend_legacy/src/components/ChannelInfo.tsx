import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import type { YTChannelPreview } from "../types/youtube";

interface ChannelInfoProps {
  preview: YTChannelPreview;
}

export default function ChannelInfo({ preview }: ChannelInfoProps) {
  return (
    <div className="mb-4">
      <Typography variant="h5" className="mb-2">
        {preview.channel_title}
      </Typography>
      <Link
        href={preview.channel_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-3 inline-block"
      >
        {preview.channel_url}
      </Link>
      <Typography variant="body2" color="text.secondary" className="mb-2">
        {preview.total_videos} videos
      </Typography>
      <div className="flex flex-wrap gap-2">
        {Object.entries(preview.categories).map(([category, count]) => (
          <Chip
            key={category}
            label={`${category}: ${count}`}
            size="small"
            variant="outlined"
          />
        ))}
      </div>
    </div>
  );
}
