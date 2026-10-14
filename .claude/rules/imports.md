# Imports

## Subpath Imports (Node.js nativo)
SEMPRE usar `#src/*` para imports internos dentro de cada workspace. NUNCA usar imports relativos (`../`, `./`).

Todo workspace tem `"imports": { "#src/*": "./src/*" }` no `package.json`.

## Regras
- SEMPRE incluir a extensão `.ts` (ou `.tsx`) no import: `from "#src/orders/state.ts"` (Bun exige extensão explícita)
- Imports entre workspaces usam o scope: `from "@gizito/core"`, `from "@gizito/db"`
- Imports de libs externas são normais: `from "zod"`, `from "elysia"`
- `#src/*` só resolve arquivos dentro do mesmo workspace

## Exemplos

```ts
import { orderStatusList } from "#src/orders/status.ts";
import { studyKitSchema } from "#src/pedagogy/study-kit.ts";
import type { Order } from "#src/orders/types.ts";

import { transitionOrder, type OrderStatus } from "@gizito/core";
import { db } from "@gizito/db";

import { plans } from "../enums";
import { plans } from "#src/enums";
```

Os dois últimos são ERRADOS (relativo e sem extensão).

## TSConfig
`allowImportingTsExtensions: true` no tsconfig base para suportar a extensão nos imports.
