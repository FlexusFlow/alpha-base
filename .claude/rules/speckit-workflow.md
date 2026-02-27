# Speckit Workflow

## After Feature Completion

When a feature created and implemented with Speckit is finished and committed, suggest moving its spec directory to `./specs/done/`:

```bash
mv specs/<feature-dir> specs/done/
```

This keeps the active `specs/` directory clean and preserves completed specs for reference.
