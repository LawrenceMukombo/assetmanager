import { existsSync, mkdirSync, cpSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const src = resolve(scriptDir, "../../npams-web/dist/public");
const dest = resolve(scriptDir, "../dist/frontend");

if (existsSync(src)) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log("Frontend copied to dist/frontend");
} else {
  console.log("Frontend src not found at", src, "— skipping copy");
}
