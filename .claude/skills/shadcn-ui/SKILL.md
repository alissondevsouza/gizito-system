---
name: shadcn-ui
description: "shadcn/ui component installation and composition (forms with React Hook Form + Zod, dialogs, sheets, tables) in apps/web."
paths:
  - "apps/web/**"
allowed-tools: Read, Write, Bash, Edit, Glob
---

# shadcn/ui Component Patterns

Accessible components built on Radix UI + Tailwind, copied into the project (`src/components/ui/`) and owned by it. In Gizito the design tokens come from the design doc §4.1 and forms use React Hook Form + Zod with schemas from `@gizito/core`.

## When to use this skill

- Adding or configuring a shadcn/ui component (`bunx shadcn@latest add <component>`)
- Composing a form with React Hook Form + Zod, a dialog, sheet, select, table or toast
- Theming via CSS variables

## Constraints

- Components rely on Tailwind utilities and `@radix-ui/*` packages; install what the component needs
- Most interactive components are client components
- This project is TanStack Start, not Next.js: ignore Next-specific sections in the references

## References, read only what the task needs

- `references/patterns.md` — installation, configuration, every core component with code, customization, advanced forms
- `references/ui-reference.md`, `references/official-ui-reference.md`, `references/reference.md` — component API reference
- `references/chart.md` — charts
- `references/learn.md` — concepts
- Official docs: https://ui.shadcn.com · Radix: https://www.radix-ui.com
