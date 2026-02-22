import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Fetch article (verify ownership via RLS)
  const { data: article, error: fetchError } = await supabase
    .from('articles')
    .select('id, content_markdown, summary, user_id')
    .eq('id', id)
    .single();

  if (fetchError || !article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  // Return cached summary if available
  if (article.summary) {
    return NextResponse.json({ summary: article.summary });
  }

  if (!article.content_markdown) {
    return NextResponse.json({ error: 'Article has no content' }, { status: 400 });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: 'You are a summarizer. Provide a concise summary of the following article. Focus on the key points and main arguments.',
      messages: [
        { role: 'user', content: article.content_markdown },
      ],
    });

    const summary = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Cache the summary
    await supabase
      .from('articles')
      .update({ summary })
      .eq('id', id);

    return NextResponse.json({ summary });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to generate summary';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
