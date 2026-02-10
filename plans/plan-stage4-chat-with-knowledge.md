# Tech task
On Projects Page user can create new project
Project should work as claude ai chat
Frontend application shows the chat on the Project page. When user sends the message to the chat the whole history should be sent withing this message as history property, so the backend could attach these messages as history messages to the LLM request
When User submits request to chat window POST v1/api/chat should be called
Backend application should store chat history in the supabase
Backend need implement RAG architecture, so when user message is send to the chat, backend need to find additional context in DeepLake vector data base that is already created/updated with previous functionality
After fetching and combining addition context from knowledge base with user message, application must invoke chatOpenAi to get reponse for user request
Use
from langchain_core.prompts import ChatPromptTemplate, 
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

# Claude's plan

 Stage 4: Chat with Knowledge Base

 Context

 The ZipTrader app has a populated DeepLake vector store with 74 transcripts but no way to query it. This plan adds a RAG chat feature
  where users create "projects" (chat sessions) and ask questions answered by the LLM with context retrieved from the knowledge base.
 The frontend is next-frontend/ (Next.js 15 + shadcn/ui + Supabase auth). The existing "projects" page/API is an invoice parser that
 will be replaced.

 Key decisions:
 - Frontend handles project CRUD directly via Supabase (existing auth + RLS)
 - Backend handles only RAG chat: POST /v1/api/chat with SSE streaming
 - Backend stores chat messages in Supabase after generating response
 - Replace existing invoice-based projects code entirely

 ---
 1. Database Schema (Supabase SQL Editor)

 Create new migration 002_chat_projects.sql:

 -- Drop old invoice-based projects table
 DROP TABLE IF EXISTS public.projects CASCADE;

 -- Projects table (chat sessions)
 CREATE TABLE public.projects (
   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
   name TEXT NOT NULL,
   created_at TIMESTAMPTZ DEFAULT NOW()
 );

 ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
 CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
 CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

 -- Chat messages table
 CREATE TABLE public.chat_messages (
   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
   project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
   role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
   content TEXT NOT NULL,
   sources JSONB DEFAULT '[]',
   created_at TIMESTAMPTZ DEFAULT NOW()
 );

 ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "Users can view project messages" ON public.chat_messages FOR SELECT
   USING (EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid()));
 CREATE POLICY "Users can insert project messages" ON public.chat_messages FOR INSERT
   WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid()));

 CREATE INDEX idx_chat_messages_project ON public.chat_messages(project_id, created_at);

 ---
 2. Backend Changes

 2a. Dependencies

 File: backend/pyproject.toml - add "supabase>=2.0"
 Then run: cd backend && uv sync

 2b. Config

 File: backend/app/config.py - add to Settings:
 supabase_url: str
 supabase_service_key: str
 chat_model: str = "gpt-4o"
 chat_max_tokens: int = 2048
 rag_retrieval_k: int = 5

 File: backend/.env - add SUPABASE_URL and SUPABASE_SERVICE_KEY

 2c. Dependencies injection

 File: backend/app/dependencies.py - add get_supabase() returning a cached Supabase client

 2d. Add retrieval to VectorStoreService

 File: backend/app/services/vectorstore.py - add method:
 def similarity_search(self, query: str, k: int = 5) -> list[Document]:
     db = DeeplakeVectorStore(
         dataset_path=self.deeplake_path,
         embedding_function=self.embeddings,
         read_only=True,
     )
     return db.similarity_search(query=query, k=k)

 2e. New: Chat models

 New file: backend/app/models/chat.py
 - ChatMessage(BaseModel): role, content
 - ChatRequest(BaseModel): project_id, message, history: list[ChatMessage]

 2f. New: Chat service (RAG pipeline)

 New file: backend/app/services/chat.py

 ChatService class with:
 - __init__(settings): creates VectorStoreService, ChatOpenAI(model=settings.chat_model)
 - _retrieve_context(query) -> (context_str, source_urls): calls similarity_search(query, k), formats chunks with source labels,
 extracts unique source URLs
 - _build_messages(context, history, message) -> list: builds [SystemMessage(prompt+context), ...history as HumanMessage/AIMessage,
 HumanMessage(user_message)]
 - stream(message, history) -> AsyncGenerator: retrieves context, builds messages, calls self.llm.astream(messages), yields token
 chunks

 System prompt template:
 You are a helpful AI assistant for ZipTrader knowledge base about stock market investing and trading.
 Use the provided context from transcribed YouTube videos to answer questions accurately.
 If context doesn't contain relevant info, say so and provide general knowledge.
 Cite specific sources when using context information.

 Context:
 {context}

 2g. New: Chat router (SSE streaming)

 New file: backend/app/routers/chat.py

 POST /v1/api/chat endpoint:
 1. Parse ChatRequest
 2. Create ChatService(settings)
 3. Return EventSourceResponse that:
   - Streams tokens as SSE data events (each chunk is {"token": "..."})
   - After stream completes, sends final event with {"done": true, "sources": [...]}
   - Stores user message + full assistant response in Supabase chat_messages table

 2h. Register router

 File: backend/app/main.py - import and include chat.router

 ---
 3. Frontend Changes

 3a. Clean up old invoice code

 - Delete: next-frontend/app/api/projects/route.ts (invoice parser)
 - Delete: next-frontend/app/api/projects/[id]/download/route.ts
 - Update: next-frontend/lib/types/project.ts - replace with:
 export interface Project {
   id: string
   user_id: string
   name: string
   created_at: string
 }

 3b. New: Chat types

 New file: next-frontend/lib/types/chat.ts
 export interface ChatMessage {
   role: 'user' | 'assistant'
   content: string
   sources?: string[]
 }

 export interface ChatRequest {
   project_id: string
   message: string
   history: ChatMessage[]
 }

 3c. New: Chat API client (SSE)

 New file: next-frontend/lib/api/chat.ts

 sendChatMessage(request, onToken, onDone, onError) function:
 - POST to /v1/api/chat with Accept: text/event-stream
 - Use fetch + ReadableStream to read SSE tokens
 - Call onToken(text) for each chunk
 - Call onDone(sources) when complete

 3d. Update Projects page

 File: next-frontend/app/dashboard/projects/page.tsx
 - Replace stub with project list + "New Project" button
 - Use Supabase client directly to fetch/create projects
 - Click project card → navigate to /dashboard/projects/[id]

 3e. New: Project chat page

 New file: next-frontend/app/dashboard/projects/[id]/page.tsx
 - Server component: auth check, fetch project name from Supabase
 - Load initial chat history from Supabase chat_messages table
 - Render ChatWindow component

 3f. New: ChatWindow component

 New file: next-frontend/components/chat/chat-window.tsx
 - Messages list with auto-scroll
 - Input bar with send button
 - Manages local messages state
 - On submit: append user message, call sendChatMessage() with SSE streaming
 - Show streaming assistant response as it arrives (accumulate tokens)
 - Show sources after response completes
 - Empty state: "Ask questions about your knowledge base"

 3g. New: ChatMessage component

 New file: next-frontend/components/chat/chat-message.tsx
 - User messages: right-aligned, primary color background
 - Assistant messages: left-aligned, muted background
 - Render markdown content (simple whitespace-pre-wrap initially)

 ---
 4. RAG Pipeline Flow

 User types message → ChatWindow
   ↓
 POST /v1/api/chat { project_id, message, history }
   ↓
 ChatService._retrieve_context(message)
   → OpenAIEmbeddings.embed_query(message)
   → DeepLake similarity_search(k=5)
   → Format top-5 chunks with [Source N: title] labels
   → Extract unique source URLs
   ↓
 ChatService._build_messages(context, history, message)
   → SystemMessage(prompt + context)
   → History as HumanMessage/AIMessage pairs
   → HumanMessage(current message)
   ↓
 ChatOpenAI.astream(messages)
   → Stream tokens via SSE to frontend
   → Accumulate full response
   ↓
 Store in Supabase: user message + assistant response + sources
   ↓
 Frontend: tokens appear in real-time, sources shown after completion

 ---
 5. Files Summary

 New files
 ┌────────────────────────────────────────────────────┬──────────────────────────────────────────────┐
 │                        File                        │                   Purpose                    │
 ├────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
 │ backend/app/models/chat.py                         │ ChatMessage, ChatRequest models              │
 ├────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
 │ backend/app/services/chat.py                       │ RAG pipeline: retrieve + prompt + stream LLM │
 ├────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
 │ backend/app/routers/chat.py                        │ POST /v1/api/chat with SSE streaming         │
 ├────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
 │ next-frontend/lib/types/chat.ts                    │ ChatMessage, ChatRequest types               │
 ├────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
 │ next-frontend/lib/api/chat.ts                      │ SSE chat API client                          │
 ├────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
 │ next-frontend/app/dashboard/projects/[id]/page.tsx │ Project chat page                            │
 ├────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
 │ next-frontend/components/chat/chat-window.tsx      │ Chat UI with streaming                       │
 ├────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
 │ next-frontend/components/chat/chat-message.tsx     │ Message bubble component                     │
 └────────────────────────────────────────────────────┴──────────────────────────────────────────────┘
 Modified files
 ┌───────────────────────────────────────────────┬────────────────────────────────────────┐
 │                     File                      │                 Change                 │
 ├───────────────────────────────────────────────┼────────────────────────────────────────┤
 │ backend/pyproject.toml                        │ Add supabase>=2.0                      │
 ├───────────────────────────────────────────────┼────────────────────────────────────────┤
 │ backend/.env                                  │ Add SUPABASE_URL, SUPABASE_SERVICE_KEY │
 ├───────────────────────────────────────────────┼────────────────────────────────────────┤
 │ backend/app/config.py                         │ Add supabase + chat settings           │
 ├───────────────────────────────────────────────┼────────────────────────────────────────┤
 │ backend/app/dependencies.py                   │ Add get_supabase()                     │
 ├───────────────────────────────────────────────┼────────────────────────────────────────┤
 │ backend/app/services/vectorstore.py           │ Add similarity_search() method         │
 ├───────────────────────────────────────────────┼────────────────────────────────────────┤
 │ backend/app/main.py                           │ Register chat router                   │
 ├───────────────────────────────────────────────┼────────────────────────────────────────┤
 │ next-frontend/lib/types/project.ts            │ Replace with chat project type         │
 ├───────────────────────────────────────────────┼────────────────────────────────────────┤
 │ next-frontend/app/dashboard/projects/page.tsx │ Projects list + create                 │
 └───────────────────────────────────────────────┴────────────────────────────────────────┘
 Deleted files
 ┌───────────────────────────────────────────────────────┬──────────────────────┐
 │                         File                          │        Reason        │
 ├───────────────────────────────────────────────────────┼──────────────────────┤
 │ next-frontend/app/api/projects/route.ts               │ Old invoice parser   │
 ├───────────────────────────────────────────────────────┼──────────────────────┤
 │ next-frontend/app/api/projects/[id]/download/route.ts │ Old invoice download │
 └───────────────────────────────────────────────────────┴──────────────────────┘
 ---
 6. Implementation Order

 1. Run SQL migration in Supabase (create tables)
 2. Backend: add supabase dependency + config + DI
 3. Backend: add similarity_search() to vectorstore service
 4. Backend: create chat models
 5. Backend: create chat service (RAG pipeline)
 6. Backend: create chat router with SSE streaming
 7. Backend: register router in main.py
 8. Frontend: clean up old invoice code, update project types
 9. Frontend: create chat types + API client
 10. Frontend: update projects list page
 11. Frontend: create project chat page + components
 12. End-to-end testing

 ---
 7. Verification

 1. Backend smoke test: Start backend (uv run uvicorn app.main:app --reload --port 8000), call POST /v1/api/chat with curl to verify
 SSE streaming works
 2. Frontend flow: Create project → open chat → send message → verify streaming response appears → reload page → verify history loads
 from Supabase
 3. RAG quality: Ask knowledge-base-specific questions (e.g., "What does ZipTrader think about NVDA?") and verify relevant context is
 retrieved and cited
 