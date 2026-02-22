import { NextRequest } from 'next/server';
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
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json();
  const { message, history = [] } = body;

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch article (verify ownership via RLS)
  const { data: article, error: fetchError } = await supabase
    .from('articles')
    .select('id, content_markdown, user_id')
    .eq('id', id)
    .single();

  if (fetchError || !article) {
    return new Response(JSON.stringify({ error: 'Article not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!article.content_markdown) {
    return new Response(JSON.stringify({ error: 'Article has no content' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h: { role: string; content: string }) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user' as const, content: message },
  ];

  const encoder = new TextEncoder();
  let fullResponse = '';

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 2048,
          system: `Answer questions about the following article. Only use information from the article.\n\n${article.content_markdown}`,
          messages,
          stream: true,
        });

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const token = event.delta.text;
            fullResponse += token;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
          }
        }

        // Save messages to DB
        await supabase.from('article_chat_messages').insert([
          {
            article_id: id,
            user_id: user.id,
            role: 'user',
            content: message,
          },
          {
            article_id: id,
            user_id: user.id,
            role: 'assistant',
            content: fullResponse,
          },
        ]);

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Stream error';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: errorMessage })}\n\n`),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
