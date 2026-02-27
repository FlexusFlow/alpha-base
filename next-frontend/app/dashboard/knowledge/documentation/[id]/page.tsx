import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DocumentationCollectionViewer } from '@/components/documentation/documentation-collection-viewer';

async function CollectionContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: collection, error } = await supabase
    .from('doc_collections')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !collection) {
    redirect('/dashboard/knowledge');
  }

  const { data: pages } = await supabase
    .from('doc_pages')
    .select('*')
    .eq('collection_id', id)
    .order('display_order', { ascending: true });

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <DocumentationCollectionViewer
        collection={collection}
        pages={pages || []}
      />
    </div>
  );
}

export default function DocumentationCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="p-8 max-w-4xl mx-auto">Loading collection...</div>}>
      <CollectionContent params={params} />
    </Suspense>
  );
}
