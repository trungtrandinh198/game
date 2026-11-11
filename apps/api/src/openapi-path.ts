import { fileURLToPath } from "node:url";

export const OPENAPI_PATH = fileURLToPath(
  new URL("../../../docs/api/openapi.json", import.meta.url),
);
