# Worktree Setup

When starting a session in a worktree (launched with `-w` flag), immediately copy environment files from the main project directory so the worktree is ready to run:

```bash
cp /Users/stanislav/personal/AI/projects/alphabase/backend/.env backend/.env
cp /Users/stanislav/personal/AI/projects/alphabase/backend/.env.dev backend/.env.dev
cp /Users/stanislav/personal/AI/projects/alphabase/next-frontend/.env.local next-frontend/.env.local
```

Do this **before** any other work — the worktree must be fully runnable from its own directory.
