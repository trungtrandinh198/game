import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTENT_KINDS, contentIdSchema, type ContentKind } from "@dnw/schemas";
import { exists, KIND_LAYOUT } from "./paths";

/** Tạo thư mục mục mới từ `_templates/<kind>`, điền `id`. */
export async function newContent(root: string, kind: string, id: string): Promise<string> {
  if (!(CONTENT_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Loại không hợp lệ "${kind}"; chọn một trong: ${CONTENT_KINDS.join(", ")}`);
  }
  const idCheck = contentIdSchema.safeParse(id);
  if (!idCheck.success)
    throw new Error(`id "${id}" không hợp lệ: ${idCheck.error.issues[0]?.message}`);

  const k = kind as ContentKind;
  const template = join(root, "_templates", k);
  if (!(await exists(template))) throw new Error(`Không có mẫu content/_templates/${k}`);
  const target = join(root, KIND_LAYOUT[k].dir, id);
  if (await exists(target)) throw new Error(`${KIND_LAYOUT[k].dir}/${id} đã tồn tại`);

  await cp(template, target, { recursive: true });
  const manifest = join(target, KIND_LAYOUT[k].manifest);
  await writeFile(manifest, (await readFile(manifest, "utf8")).replaceAll("__ID__", id));
  await writeFile(
    join(target, "LICENSE.md"),
    "# Giấy phép\n\nGhi tác giả, giấy phép và nguồn của mọi file trong thư mục này.\n",
  );
  return target;
}
