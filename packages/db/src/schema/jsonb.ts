import { customType } from "drizzle-orm/pg-core";

export const jsonb = customType<{ data: unknown; driverData: unknown }>({
  dataType: () => "jsonb",
  toDriver: (value) => value,
});
