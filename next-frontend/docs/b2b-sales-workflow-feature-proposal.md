# B2B Sales Workflow Analysis & Feature Proposal

## Current State
The project has:
- ✅ Invoice management with AI parsing
- ✅ User authentication
- ✅ File upload infrastructure
- ✅ Claude AI integration
- ❌ No proposal generation
- ❌ No meeting/call capture
- ❌ No client management

---

## Business Flow Vision

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        B2B SALES WORKFLOW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. DISCOVERY CALL          2. PROPOSAL              3. DEAL CLOSED     │
│  ┌─────────────────┐       ┌─────────────────┐      ┌─────────────────┐ │
│  │ • Record audio  │       │ • AI generates  │      │ • Convert to    │ │
│  │ • Fill Q&A form │  ───► │   draft proposal│ ───► │   invoice       │ │
│  │ • Upload notes  │       │ • Edit & send   │      │ • Track payment │ │
│  └─────────────────┘       └─────────────────┘      └─────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Proposed Feature: Sales Call → Proposal Generator

### Core Idea
Sales managers capture call information via **3 flexible input methods**, and the system generates a **professional proposal draft** using AI.

### Input Methods

| Method | Use Case | How It Works |
|--------|----------|--------------|
| **1. Audio Recording** | During/after call | Record via browser, transcribe with AI, extract key points |
| **2. Sales Q&A Form** | During call | Structured form with common sales questions, fill in real-time |
| **3. Text Summary** | After call | Paste meeting notes or CRM export, AI extracts details |

### Data Captured

```typescript
interface SalesCallData {
  // Client Info
  client_name: string
  company_name: string
  industry: string
  company_size: string

  // Needs Assessment
  current_challenges: string[]
  desired_outcomes: string[]
  timeline: string
  budget_range: string

  // Solution Fit
  products_discussed: string[]
  customization_needs: string
  integration_requirements: string

  // Next Steps
  decision_makers: string[]
  buying_process: string
  competitors_considered: string[]

  // Raw Input
  audio_transcript?: string
  meeting_notes?: string
}
```

### Output: Generated Proposal

```
┌────────────────────────────────────────┐
│         COMMERCIAL PROPOSAL            │
├────────────────────────────────────────┤
│ Client: Acme Corp                      │
│ Date: January 24, 2026                 │
├────────────────────────────────────────┤
│ 1. Executive Summary                   │
│    [AI-generated from call data]       │
│                                        │
│ 2. Understanding Your Needs            │
│    [Challenges & outcomes discussed]   │
│                                        │
│ 3. Proposed Solution                   │
│    [Products + customization]          │
│                                        │
│ 4. Investment                          │
│    [Pricing based on scope]            │
│                                        │
│ 5. Timeline & Next Steps               │
│    [Based on client timeline]          │
└────────────────────────────────────────┘
```

---

## Database Schema

```sql
-- Clients/Leads
CREATE TABLE public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  industry TEXT,
  company_size TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sales Calls
CREATE TABLE public.sales_calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  call_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  input_type TEXT NOT NULL, -- 'audio' | 'form' | 'text'
  audio_file_path TEXT,
  transcript TEXT,
  form_data JSONB,
  raw_notes TEXT,
  ai_summary TEXT,
  status TEXT DEFAULT 'draft', -- 'draft' | 'proposal_generated' | 'sent' | 'won' | 'lost'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Proposals
CREATE TABLE public.proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  sales_call_id UUID REFERENCES public.sales_calls(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL, -- Structured proposal sections
  total_amount DECIMAL(12,2),
  valid_until DATE,
  status TEXT DEFAULT 'draft', -- 'draft' | 'sent' | 'accepted' | 'rejected'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Link proposals to invoices when deal closes
ALTER TABLE public.invoices
ADD COLUMN proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL;
```

---

## UI Flow

### New Sidebar Items
```
📊 Dashboard
📞 Sales Calls      ← NEW
📄 Proposals        ← NEW
📁 Invoices         (existing)
👥 Clients          ← NEW
```

### Sales Call Page (`/dashboard/sales-calls/new`)

```
┌─────────────────────────────────────────────────────────────────┐
│  New Sales Call                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Choose Input Method:                                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ 🎤 Record   │ │ 📝 Q&A Form │ │ 📋 Paste    │               │
│  │   Audio     │ │             │ │   Notes     │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
│                                                                 │
│  [Selected: Q&A Form]                                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Client Information                                          ││
│  │ Company Name: [________________]                            ││
│  │ Contact Name: [________________]                            ││
│  │ Industry:     [▼ Select_______]                            ││
│  │                                                             ││
│  │ Needs Assessment                                            ││
│  │ What challenges are they facing?                            ││
│  │ [_______________________________________________]           ││
│  │                                                             ││
│  │ What outcomes do they want?                                 ││
│  │ [_______________________________________________]           ││
│  │                                                             ││
│  │ Budget range: [▼ Select_______]                            ││
│  │ Timeline:     [▼ Select_______]                            ││
│  │                                                             ││
│  │ Products Discussed                                          ││
│  │ ☑ Product A  ☐ Product B  ☑ Product C                      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  [Save Draft]  [Generate Proposal →]                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Clients table + CRUD
- [ ] Sales Calls table + basic form input
- [ ] Proposals table + editor

### Phase 2: AI Proposal Generation
- [ ] Q&A form → AI prompt → proposal draft
- [ ] Text notes → AI extraction → proposal draft
- [ ] Proposal template system

### Phase 3: Audio Recording
- [ ] Browser audio recording (MediaRecorder API)
- [ ] Upload to Supabase Storage
- [ ] Transcription via Claude or Whisper API
- [ ] Transcript → AI extraction → proposal draft

### Phase 4: Workflow Integration
- [ ] Proposal → Invoice conversion
- [ ] Email proposal to client
- [ ] Status tracking (sent, viewed, accepted)

---

## Recommended Starting Point

**Start with Phase 1 + 2 (Q&A Form → Proposal)**

This provides immediate value with:
- Lowest technical complexity (no audio handling)
- Clear user workflow
- Demonstrates AI value proposition
- Foundation for audio feature later
