import type { PRView, NormalizedComment } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Render Markdown prompt - concise format
// ─────────────────────────────────────────────────────────────────────────────

export function renderPrompt(
  prView: PRView,
  comments: NormalizedComment[]
): string {
  const lines: string[] = [];

  // Minimal header
  lines.push(`# PR #${prView.url.split("/").pop()}: ${prView.title}`);
  lines.push("");
  lines.push(`${prView.url} | \`${prView.headRefName}\` → \`${prView.baseRefName}\``);
  lines.push("");

  // Concise instructions
  lines.push("## Task");
  lines.push("");
  lines.push("Review comments below. For each: **FIX** (code change needed), **REPLY** (question/suggestion), or **IGNORE**.");
  lines.push("");
  lines.push("1. Make code fixes for FIX items");
  lines.push("2. End with a report: classification + action/reply for each comment");
  lines.push("");

  // Check if no comments
  if (comments.length === 0) {
    lines.push("---");
    lines.push("");
    lines.push("**No pending review comments found.** All threads resolved or only bot comments.");
    lines.push("");
    return lines.join("\n");
  }

  // Comments section - compact format
  lines.push("---");
  lines.push("");
  lines.push(`## Comments (${comments.length})`);
  lines.push("");

  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    const num = i + 1;

    // One-line header with essential info
    const location = c.filePath 
      ? (c.line ? `\`${c.filePath}:${c.line}\`` : `\`${c.filePath}\``)
      : "";
    const stateTag = c.state ? ` [${c.state}]` : "";
    
    lines.push(`### #${num} @${c.author}${stateTag} ${location}`);
    
    // Comment body - no code fence for short comments
    if (c.body.length < 200 && !c.body.includes("\n")) {
      lines.push(`> ${c.body}`);
    } else {
      lines.push("");
      lines.push("```");
      lines.push(c.body.trim());
      lines.push("```");
    }
    lines.push("");
  }

  return lines.join("\n");
}
