import { lstat, mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const mcpUseDir = path.join(appDir, ".mcp-use");
const target = path.join(mcpUseDir, "node_modules");
const relativeSource = "../node_modules";

await mkdir(mcpUseDir, { recursive: true });

try {
  const stat = await lstat(target);
  if (stat.isSymbolicLink()) {
    process.exit(0);
  }
  await rm(target, { force: true, recursive: true });
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
    throw error;
  }
}

await symlink(relativeSource, target, "dir");
