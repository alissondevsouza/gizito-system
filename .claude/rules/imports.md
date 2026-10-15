---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Imports

- Dentro de um workspace: sempre `#src/...` com extensão explícita, ex. `from "#src/orders/state.ts"`. Todo workspace tem `"imports": { "#src/*": "./src/*" }` no `package.json` e `allowImportingTsExtensions: true` no tsconfig.
- Nunca imports relativos (`./`, `../`) nem sem extensão: o Bun exige a extensão e o `#src/*` só resolve dentro do próprio workspace.
- Entre workspaces: `from "@gizito/core"`, `from "@gizito/db"`. Package consumido por frontend e backend expõe entrypoints separados no `exports` (ex. `@gizito/core/client`) para o servidor não vazar no bundle.
- Libs externas: `from "zod"`, `from "elysia"`.
