import type {
  PRView,
  IssueComment,
  InlineComment,
  NormalizedComment,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Clean up comment body - remove HTML noise
// ─────────────────────────────────────────────────────────────────────────────

function cleanBody(body: string): string {
  let cleaned = body;

  // Remove Cursor "Fix in Cursor" / "Fix in Web" HTML blocks
  cleaned = cleaned.replace(/<a[^>]*cursor\.com[^>]*>[\s\S]*?<\/a>/gi, "");
  
  // Remove picture/source/img tags
  cleaned = cleaned.replace(/<picture>[\s\S]*?<\/picture>/gi, "");
  
  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
  
  // Remove empty links
  cleaned = cleaned.replace(/<a[^>]*>\s*<\/a>/gi, "");
  
  // Remove &nbsp;
  cleaned = cleaned.replace(/&nbsp;/g, " ");
  
  // Collapse multiple newlines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  
  // Trim
  cleaned = cleaned.trim();

  return cleaned;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalize all reviews
// ─────────────────────────────────────────────────────────────────────────────

function normalizeReviews(prView: PRView): NormalizedComment[] {
  const results: NormalizedComment[] = [];

  for (const review of prView.reviews) {
    if (!review.author) continue;
    
    const author = review.author.login;
    const body = cleanBody(review.body || "");
    
    // Skip if no body and not a significant state
    if (!body && review.state !== "CHANGES_REQUESTED" && review.state !== "APPROVED") {
      continue;
    }

    results.push({
      id: `review-${review.submittedAt || Date.now()}-${author}`,
      kind: "review_body",
      author,
      createdAt: review.submittedAt || undefined,
      state: review.state,
      filePath: undefined,
      line: undefined,
      isResolved: undefined,
      body: body || `[${review.state}]`,
      url: prView.url,
      isBot: false,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalize all issue comments
// ─────────────────────────────────────────────────────────────────────────────

function normalizeIssueComments(comments: IssueComment[]): NormalizedComment[] {
  const results: NormalizedComment[] = [];

  for (const comment of comments) {
    if (!comment.user) continue;
    
    const body = cleanBody(comment.body || "");
    if (!body) continue;

    results.push({
      id: `comment-${comment.id}`,
      kind: "pr_comment",
      author: comment.user.login,
      createdAt: comment.created_at,
      state: undefined,
      filePath: undefined,
      line: undefined,
      isResolved: undefined,
      body,
      url: comment.html_url,
      isBot: false,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalize all inline comments
// ─────────────────────────────────────────────────────────────────────────────

function normalizeInlineComments(threads: InlineComment[]): NormalizedComment[] {
  const results: NormalizedComment[] = [];

  for (const thread of threads) {
    for (const comment of thread.comments) {
      const body = cleanBody(comment.body);
      if (!body) continue;

      results.push({
        id: `inline-${comment.id}`,
        kind: "inline_comment",
        author: comment.author,
        createdAt: comment.createdAt,
        state: undefined,
        filePath: thread.path,
        line: thread.line ?? thread.originalLine ?? undefined,
        isResolved: thread.isResolved,
        body,
        url: comment.url,
        isBot: false,
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main normalization function - NO FILTERING, just extract all
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeAll(
  prView: PRView,
  issueComments: IssueComment[],
  inlineComments: InlineComment[]
): NormalizedComment[] {
  const allComments: NormalizedComment[] = [
    ...normalizeReviews(prView),
    ...normalizeIssueComments(issueComments),
    ...normalizeInlineComments(inlineComments),
  ];

  // Sort by createdAt (oldest first)
  return allComments.sort((a, b) => {
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aDate - bDate;
  });
}
