import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ArticleViewer } from '@/components/articles/article-viewer';

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: article, error } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !article || article.status !== 'completed') {
    redirect('/dashboard/knowledge');
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <ArticleViewer article={article} />
    </div>
  );
}
