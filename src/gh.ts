import { execa } from "execa";
import { z } from "zod";
import {
  PRViewSchema,
  IssueCommentSchema,
  RepoInfoSchema,
  type PRView,
  type IssueComment,
  type RepoInfo,
  type InlineComment,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Run gh command
// ─────────────────────────────────────────────────────────────────────────────

async function runGh(args: string[]): Promise<string> {
  const result = await execa("gh", args, {
    reject: false,
    timeout: 60000,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `gh command failed: gh ${args.join(" ")}\n${result.stderr || result.stdout}`
    );
  }

  return result.stdout;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check gh is installed and authenticated
// ─────────────────────────────────────────────────────────────────────────────

export async function checkGhAuth(): Promise<void> {
  try {
    await runGh(["auth", "status"]);
  } catch (error) {
    throw new Error(
      "GitHub CLI (gh) is not installed or not authenticated.\n" +
        "Please install gh and run `gh auth login` first.\n" +
        "See: https://cli.github.com/"
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Get current repo from git context
// ─────────────────────────────────────────────────────────────────────────────

export async function getCurrentRepo(): Promise<string> {
  const stdout = await runGh(["repo", "view", "--json", "nameWithOwner"]);
  const data: RepoInfo = RepoInfoSchema.parse(JSON.parse(stdout));
  return data.nameWithOwner;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get PR view data (title, url, reviews, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export async function getPRView(
  prNumber: number,
  repo: string
): Promise<PRView> {
  const fields = [
    "title",
    "url",
    "author",
    "state",
    "createdAt",
    "updatedAt",
    "baseRefName",
    "headRefName",
    "reviews",
  ].join(",");

  const stdout = await runGh([
    "pr",
    "view",
    String(prNumber),
    "--repo",
    repo,
    "--json",
    fields,
  ]);

  return PRViewSchema.parse(JSON.parse(stdout));
}

// ─────────────────────────────────────────────────────────────────────────────
// Get PR conversation comments (issue comments)
// ─────────────────────────────────────────────────────────────────────────────

export async function getIssueComments(
  prNumber: number,
  repo: string
): Promise<IssueComment[]> {
  const stdout = await runGh([
    "api",
    `repos/${repo}/issues/${prNumber}/comments`,
    "--paginate",
  ]);

  // Handle empty response
  if (!stdout.trim()) {
    return [];
  }

  // gh api --paginate may return multiple JSON arrays concatenated
  // We need to handle both single array and concatenated arrays
  const parsed = parseGhPaginatedJson(stdout);
  return z.array(IssueCommentSchema).parse(parsed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Get inline code comments via GraphQL
// ─────────────────────────────────────────────────────────────────────────────

const REVIEW_THREADS_QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      reviewThreads(first: 100) {
        nodes {
          path
          line
          originalLine
          isResolved
          isOutdated
          comments(first: 100) {
            nodes {
              id
              author { login }
              createdAt
              body
              url
            }
          }
        }
      }
    }
  }
}
`;

export async function getInlineComments(
  prNumber: number,
  repo: string
): Promise<InlineComment[]> {
  const [owner, repoName] = repo.split("/");

  try {
    const stdout = await runGh([
      "api",
      "graphql",
      "-f",
      `query=${REVIEW_THREADS_QUERY}`,
      "-F",
      `owner=${owner}`,
      "-F",
      `repo=${repoName}`,
      "-F",
      `prNumber=${prNumber}`,
    ]);

    const data = JSON.parse(stdout);

    const threads =
      data?.data?.repository?.pullRequest?.reviewThreads?.nodes || [];

    return threads.map(
      (thread: {
        path: string;
        line: number | null;
        originalLine: number | null;
        isResolved: boolean;
        isOutdated: boolean;
        comments: {
          nodes: Array<{
            id: string;
            author: { login: string } | null;
            createdAt: string;
            body: string;
            url: string;
          }>;
        };
      }) => ({
        path: thread.path,
        line: thread.line,
        originalLine: thread.originalLine,
        isResolved: thread.isResolved,
        isOutdated: thread.isOutdated,
        comments: (thread.comments?.nodes || []).map(
          (c: {
            id: string;
            author: { login: string } | null;
            createdAt: string;
            body: string;
            url: string;
          }) => ({
            id: c.id,
            author: c.author?.login || "unknown",
            createdAt: c.createdAt,
            body: c.body || "",
            url: c.url,
          })
        ),
      })
    );
  } catch (error) {
    // GraphQL may fail for various reasons (permissions, old gh version, etc.)
    // Continue gracefully
    console.warn(
      "⚠️  Could not fetch inline comments via GraphQL (continuing without them):",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Get last commit date on PR
// ─────────────────────────────────────────────────────────────────────────────

export async function getLastPushDate(
  prNumber: number,
  repo: string
): Promise<Date | null> {
  try {
    const stdout = await runGh([
      "api",
      `repos/${repo}/pulls/${prNumber}/commits`,
      "--jq",
      ".[-1].commit.committer.date",
    ]);

    const dateStr = stdout.trim();
    if (dateStr) {
      return new Date(dateStr);
    }
    return null;
  } catch (error) {
    console.warn(
      "⚠️  Could not fetch last commit date:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Get PR diff
// ─────────────────────────────────────────────────────────────────────────────

export async function getPRDiff(prNumber: number, repo: string): Promise<string> {
  try {
    const stdout = await runGh([
      "pr",
      "diff",
      String(prNumber),
      "--repo",
      repo,
    ]);
    return stdout;
  } catch (error) {
    console.warn(
      "⚠️  Could not fetch PR diff:",
      error instanceof Error ? error.message : String(error)
    );
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Parse paginated gh api output
// ─────────────────────────────────────────────────────────────────────────────

function parseGhPaginatedJson(stdout: string): unknown[] {
  // gh api --paginate can output:
  // 1. Single array: [...]
  // 2. Multiple arrays: [...][...][...]
  // 3. Newline-separated arrays: [...]\n[...]\n[...]

  const trimmed = stdout.trim();

  // Try parsing as single JSON first
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [parsed];
  } catch {
    // Not valid JSON, try splitting
  }

  // Try splitting by ][
  const results: unknown[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "[") depth++;
    if (trimmed[i] === "]") {
      depth--;
      if (depth === 0) {
        const chunk = trimmed.slice(start, i + 1);
        try {
          const parsed = JSON.parse(chunk);
          if (Array.isArray(parsed)) {
            results.push(...parsed);
          } else {
            results.push(parsed);
          }
        } catch {
          // Skip invalid chunks
        }
        start = i + 1;
      }
    }
  }

  return results;
}
