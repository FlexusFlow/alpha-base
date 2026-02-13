---
paths:
  - "next-frontend/**"
---

# Frontend Rules

- Follow Next.js / React conventions
- Use TypeScript throughout
- Use shadcn/ui for components, Tailwind CSS for styling

## Common Pitfalls

### Next.js 15 Patterns
- `useSearchParams()` and `await params` must be wrapped in a `<Suspense>` boundary or the build will fail.
- Never nest `<a>` inside Next.js `<Link>` — use `onClick` + `router.push()` instead for custom clickable elements.

### Package Management
- Use **yarn** only. Do not use npm (no `package-lock.json` exists, only `yarn.lock`).

### API & Environment
- Always read the backend URL from `NEXT_PUBLIC_API_BASE_URL`. Never hardcode `localhost:8000`.
- Supabase server client: must call `await cookies()` per-request. Never cache the client globally or outside a request scope.

### State Management
- Table selection sync between frontend state and URL: skip the initial mount effect, and use separate effects for FROM (URL→state) and TO (state→URL) directions to avoid infinite update loops.
