#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  checkGhAuth,
  getCurrentRepo,
  getPRView,
  getIssueComments,
  getInlineComments,
} from "./gh.js";
import { normalizeAll } from "./normalize.js";
import { renderPrompt } from "./render.js";

// ─────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ─────────────────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.log(`
pr2cursor - Generate Cursor-ready prompts from GitHub PR feedback

USAGE:
  pr2cursor <PR_NUMBER> [owner/repo]

ARGUMENTS:
  PR_NUMBER     The pull request number (required)
  owner/repo    Repository in format "owner/repo" (optional, auto-detected from git)

EXAMPLES:
  pr2cursor 123
  pr2cursor 123 facebook/react

OUTPUT:
  Creates pr-<PR_NUMBER>.md in the current directory
`);
}

function parseArgs(): { prNumber: number; repo: string | null } {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const prNumber = parseInt(args[0], 10);
  if (isNaN(prNumber) || prNumber <= 0) {
    console.error(`Error: Invalid PR number: ${args[0]}`);
    printUsage();
    process.exit(1);
  }

  const repo = args[1] || null;
  if (repo && !repo.includes("/")) {
    console.error(`Error: Repository must be in format "owner/repo", got: ${repo}`);
    process.exit(1);
  }

  return { prNumber, repo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main function
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { prNumber, repo: repoArg } = parseArgs();

  console.log("🔍 pr2cursor - Generating Cursor prompt from PR feedback\n");

  // Step 1: Check gh authentication
  console.log("1️⃣  Checking GitHub CLI authentication...");
  await checkGhAuth();
  console.log("   ✅ Authenticated\n");

  // Step 2: Get repo
  let repo: string;
  if (repoArg) {
    repo = repoArg;
    console.log(`2️⃣  Using provided repo: ${repo}\n`);
  } else {
    console.log("2️⃣  Detecting repository from git context...");
    repo = await getCurrentRepo();
    console.log(`   ✅ Detected: ${repo}\n`);
  }

  // Step 3: Fetch PR data
  console.log(`3️⃣  Fetching PR #${prNumber} data...`);

  const [prView, issueComments, inlineComments] = await Promise.all([
    getPRView(prNumber, repo).then((r) => {
      console.log(`   ✅ PR info: "${r.title}"`);
      return r;
    }),
    getIssueComments(prNumber, repo).then((r) => {
      console.log(`   ✅ PR comments: ${r.length}`);
      return r;
    }),
    getInlineComments(prNumber, repo).then((r) => {
      console.log(`   ✅ Inline comments: ${r.length} threads`);
      return r;
    }),
  ]);

  console.log("");

  // Step 4: Normalize comments
  console.log("4️⃣  Extracting all comments...");
  const normalized = normalizeAll(prView, issueComments, inlineComments);
  console.log(`   ✅ ${normalized.length} comments extracted\n`);

  // Step 5: Render prompt
  console.log("5️⃣  Rendering prompt...");
  const promptMd = renderPrompt(prView, normalized);

  // Step 6: Write output file to current directory
  const outputFile = join(process.cwd(), `pr-${prNumber}.md`);
  await writeFile(outputFile, promptMd, "utf-8");

  console.log(`   ✅ Written: ${outputFile} (${promptMd.length} chars)`);
  console.log("\n✨ Done! Open the file in Cursor and let it analyze the PR feedback.\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

main().catch((error) => {
  console.error("\n❌ Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
