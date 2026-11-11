import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { generateOpenApi } from "../src/openapi";
import { OPENAPI_PATH } from "../src/openapi-path";

await mkdir(dirname(OPENAPI_PATH), { recursive: true });
await writeFile(OPENAPI_PATH, await generateOpenApi());
console.log(`Đã ghi ${OPENAPI_PATH}`);
