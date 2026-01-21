#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");
const srcFile = join(projectRoot, "src", "pr2cursor.ts");
const tsxBin = join(projectRoot, "node_modules", ".bin", "tsx");

// Run tsx from local node_modules with the TypeScript source file
const child = spawn(
  tsxBin,
  [srcFile, ...process.argv.slice(2)],
  {
    stdio: "inherit",
    cwd: process.cwd(),
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
