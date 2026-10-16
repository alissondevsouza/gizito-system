import { portSchema, sharedEnvironmentSchema } from "@gizito/core";
import { z } from "zod";

export const DEFAULT_API_PORT = 3001;

export const apiConfigSchema = sharedEnvironmentSchema.extend({
  API_PORT: portSchema.default(DEFAULT_API_PORT),
  WEB_PUBLIC_URL: z.url({ protocol: /^https?$/ }),
});
export type ApiConfig = z.infer<typeof apiConfigSchema>;
