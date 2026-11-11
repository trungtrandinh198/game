import { generatePlaceholders } from "./generate";
import { defaultContentRoot } from "../paths";

await generatePlaceholders();
console.log(`Đã tạo nội dung placeholder trong ${defaultContentRoot()}`);
