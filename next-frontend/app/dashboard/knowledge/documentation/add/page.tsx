import { DocumentationFetchForm } from '@/components/documentation/documentation-fetch-form';

export default function AddDocumentationPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Add Documentation</h1>
        <p className="text-muted-foreground mt-1">
          Enter a documentation site URL to discover and scrape all pages
        </p>
      </div>
      <DocumentationFetchForm />
    </div>
  );
}
