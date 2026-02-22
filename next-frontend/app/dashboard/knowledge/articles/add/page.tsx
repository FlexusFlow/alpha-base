import { ArticleFetchForm } from '@/components/articles/article-fetch-form';

export default function AddArticlePage() {
  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Add Article</h1>
        <p className="text-muted-foreground mt-1">
          Paste an article URL to scrape and save it to your knowledge base
        </p>
      </div>
      <ArticleFetchForm />
    </div>
  );
}
