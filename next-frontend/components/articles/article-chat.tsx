'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ArticleChatProps {
  articleId: string;
}

export function ArticleChat({ articleId }: ArticleChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/articles/${articleId}/chat/history`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages.map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })));
        }
      } catch {
        // Silently fail — empty chat is fine
      }
    };
    loadHistory();
  }, [articleId]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setStreaming(true);

    // Add empty assistant message to stream into
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`/api/articles/${articleId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error('Failed to start chat stream');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            if (data.done) break;
            if (data.error) {
              toast({ title: 'Chat error', description: data.error, variant: 'destructive' });
              break;
            }
            if (data.token) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + data.token };
                }
                return updated;
              });
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch {
      toast({ title: 'Failed to send message', description: 'Network error', variant: 'destructive' });
      // Remove empty assistant message on error
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setStreaming(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      const res = await fetch(`/api/articles/${articleId}/chat/history`, { method: 'DELETE' });
      if (res.ok) {
        setMessages([]);
        toast({ title: 'Chat history cleared' });
      }
    } catch {
      toast({ title: 'Failed to clear history', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Ask Questions</CardTitle>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearHistory} disabled={streaming}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Messages */}
        {messages.length > 0 && (
          <div ref={scrollRef} className="max-h-80 overflow-y-auto space-y-2">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted',
                  )}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
            {streaming && messages[messages.length - 1]?.content === '' && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Ask a question about this article..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={streaming}
          />
          <Button size="icon" onClick={handleSend} disabled={streaming || !input.trim()}>
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
