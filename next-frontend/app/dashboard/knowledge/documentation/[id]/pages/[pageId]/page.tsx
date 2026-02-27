import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DocumentationPageViewer } from '@/components/documentation/documentation-page-viewer';

async function PageContent({ params }: { params: Promise<{ id: string; pageId: string }> }) {
  const { id, pageId } = await params;
  const supabase = await createClient();

  const { data: page, error } = await supabase
    .from('doc_pages')
    .select('*')
    .eq('id', pageId)
    .single();

  if (error || !page || page.status !== 'completed') {
    redirect(`/dashboard/knowledge/documentation/${id}`);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <DocumentationPageViewer page={page} collectionId={id} />
    </div>
  );
}

export default function DocumentationPageRoute({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  return (
    <Suspense fallback={<div className="p-8 max-w-4xl mx-auto">Loading page...</div>}>
      <PageContent params={params} />
    </Suspense>
  );
}
