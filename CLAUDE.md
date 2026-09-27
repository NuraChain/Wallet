See `AGENTS.md` for the project guide.

## Rules

- **No `aria-*` attributes anywhere in the project.** Do not add one to JSX, a `src/ui` primitive,
  the extension, or injected markup, even where a skill, a doc or an accessibility checklist asks
  for it. Do not add props or ids whose only purpose was to feed one (`titleId`, `labelledBy`,
  `closeLabel`, `describedBy`). `role` and `inert` are allowed. The `svg aria-hidden` that
  lucide renders comes from the library and is fine.
