import type { PRView, NormalizedComment } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Render Markdown prompt
// ─────────────────────────────────────────────────────────────────────────────

export function renderPrompt(
  prView: PRView,
  comments: NormalizedComment[]
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# PR Review Analysis: ${prView.title}`);
  lines.push("");
  lines.push(`**PR URL:** ${prView.url}`);
  lines.push(`**Author:** @${prView.author.login}`);
  lines.push(`**Branch:** \`${prView.headRefName}\` → \`${prView.baseRefName}\``);
  lines.push(`**State:** ${prView.state}`);
  lines.push("");

  // Instructions for Cursor
  lines.push("---");
  lines.push("");
  lines.push("## Instructions");
  lines.push("");
  lines.push("Analyze all the PR review comments below. For each comment, decide:");
  lines.push("");
  lines.push("1. **FIX** — The comment points to a real issue that needs code changes");
  lines.push("2. **REPLY** — The comment is a question, suggestion, or needs clarification");
  lines.push("3. **IGNORE** — Bot/automated comment or not actionable");
  lines.push("");
  lines.push("Then:");
  lines.push("");
  lines.push("1. **Make all necessary code fixes** for FIX items (minimal, safe changes)");
  lines.push("2. **At the end, provide a Report** with:");
  lines.push("   - List of all comments with your classification (FIX/REPLY/IGNORE)");
  lines.push("   - For FIX items: what you changed and why");
  lines.push("   - For REPLY items: draft a short, professional reply to post on GitHub");
  lines.push("   - For IGNORE items: brief reason why ignored");
  lines.push("");

  // All comments section
  lines.push("---");
  lines.push("");
  lines.push("## PR Review Comments");
  lines.push("");
  lines.push(`Total: **${comments.length}** comments`);
  lines.push("");

  // Filter out empty bot comments
  const relevantComments = comments.filter(c => c.body.trim().length > 0);

  for (let i = 0; i < relevantComments.length; i++) {
    const comment = relevantComments[i];
    const num = i + 1;

    lines.push(`### Comment #${num}`);
    lines.push("");
    lines.push(`- **Author:** @${comment.author}${comment.isBot ? " 🤖 (bot)" : ""}`);
    lines.push(`- **Type:** ${formatKind(comment.kind)}`);
    
    if (comment.filePath) {
      const location = comment.line ? `${comment.filePath}:${comment.line}` : comment.filePath;
      lines.push(`- **Location:** \`${location}\``);
    }
    
    if (comment.state) {
      lines.push(`- **Review State:** ${comment.state}`);
    }
    
    if (comment.url) {
      lines.push(`- **Link:** ${comment.url}`);
    }
    
    lines.push("");
    lines.push("**Comment:**");
    lines.push("");
    lines.push("```");
    lines.push(comment.body);
    lines.push("```");
    lines.push("");
  }

  // Report template
  lines.push("---");
  lines.push("");
  lines.push("## Report Template");
  lines.push("");
  lines.push("After making fixes, fill out this report:");
  lines.push("");
  lines.push("```markdown");
  lines.push("# PR Review Response Report");
  lines.push("");
  lines.push("## Summary");
  lines.push("- FIX: X items");
  lines.push("- REPLY: X items");
  lines.push("- IGNORE: X items");
  lines.push("");
  lines.push("## Details");
  lines.push("");
  lines.push("### Comment #1");
  lines.push("- **Classification:** FIX / REPLY / IGNORE");
  lines.push("- **Action taken:** [describe changes or reply]");
  lines.push("- **GitHub Reply:** (if needed)");
  lines.push("> Your reply text here");
  lines.push("");
  lines.push("### Comment #2");
  lines.push("...");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Format comment kind
// ─────────────────────────────────────────────────────────────────────────────

function formatKind(kind: string): string {
  switch (kind) {
    case "inline_comment":
      return "Inline code comment";
    case "review_body":
      return "Review summary";
    case "pr_comment":
      return "PR conversation";
    default:
      return kind;
  }
}
