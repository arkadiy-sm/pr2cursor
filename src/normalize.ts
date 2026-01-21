import type {
  PRView,
  IssueComment,
  InlineComment,
  NormalizedComment,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Bot detection
// ─────────────────────────────────────────────────────────────────────────────

const BOT_AUTHOR_PATTERNS = [
  "github-actions",
  "sonar",
  "sonarcloud",
  "dependabot",
  "renovate",
  "codecov",
  "vercel",
  "netlify",
  "circleci",
  "travisci",
  "sizebot",
  "[bot]",
  "-bot",
  "bot-",
];

// Authors that end with "bot" are bots
function endsWithBot(author: string): boolean {
  return author.toLowerCase().endsWith("bot");
}

export function isLikelyBot(author: string): boolean {
  const authorLower = author.toLowerCase();
  
  // Check if ends with "bot"
  if (endsWithBot(author)) return true;
  
  // Check patterns
  for (const pattern of BOT_AUTHOR_PATTERNS) {
    if (authorLower.includes(pattern)) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalize review bodies - only keep latest from each reviewer
// ─────────────────────────────────────────────────────────────────────────────

function normalizeReviews(prView: PRView): NormalizedComment[] {
  const results: NormalizedComment[] = [];
  const latestByAuthor = new Map<string, typeof prView.reviews[0]>();

  // Keep only the latest review from each author
  for (const review of prView.reviews) {
    if (!review.author) continue;
    const author = review.author.login;
    
    // Skip bots
    if (isLikelyBot(author)) continue;
    
    // Skip PR author's own reviews
    if (author === prView.author.login) continue;

    const existing = latestByAuthor.get(author);
    if (!existing || 
        (review.submittedAt && existing.submittedAt && 
         new Date(review.submittedAt) > new Date(existing.submittedAt))) {
      latestByAuthor.set(author, review);
    }
  }

  for (const [author, review] of latestByAuthor) {
    const hasBody = review.body && review.body.trim().length > 0;
    const isChangesRequested = review.state === "CHANGES_REQUESTED";
    const isApproved = review.state === "APPROVED";

    // Skip approved reviews without body (just an approval click)
    if (isApproved && !hasBody) continue;
    
    // Keep if has body OR if changes requested
    if (!hasBody && !isChangesRequested) continue;

    results.push({
      id: `review-${author}`,
      kind: "review_body",
      author,
      createdAt: review.submittedAt || undefined,
      state: review.state,
      filePath: undefined,
      line: undefined,
      isResolved: undefined,
      body: review.body || `[${review.state}]`,
      url: prView.url,
      isBot: false,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalize issue comments - filter out bots and PR author's own comments
// ─────────────────────────────────────────────────────────────────────────────

function normalizeIssueComments(
  comments: IssueComment[],
  prAuthor: string
): NormalizedComment[] {
  const results: NormalizedComment[] = [];

  for (const comment of comments) {
    if (!comment.user) continue;
    const body = comment.body || "";
    if (!body.trim()) continue;

    const author = comment.user.login;

    // Skip bots
    if (isLikelyBot(author)) continue;
    
    // Skip PR author's own comments (they don't need to respond to themselves)
    if (author === prAuthor) continue;

    results.push({
      id: `comment-${comment.id}`,
      kind: "pr_comment",
      author,
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
// Normalize inline comments - skip resolved/outdated, only latest per thread
// ─────────────────────────────────────────────────────────────────────────────

function normalizeInlineComments(
  threads: InlineComment[],
  prAuthor: string
): NormalizedComment[] {
  const results: NormalizedComment[] = [];

  for (const thread of threads) {
    // Skip resolved threads - already addressed
    if (thread.isResolved) continue;
    
    // Skip outdated threads - code has changed
    if (thread.isOutdated) continue;

    // Get the latest comment in thread that's not from PR author
    const relevantComments = thread.comments.filter(c => {
      if (isLikelyBot(c.author)) return false;
      if (c.author === prAuthor) return false;
      return true;
    });

    if (relevantComments.length === 0) continue;

    // Take the latest comment (last in array)
    const latestComment = relevantComments[relevantComments.length - 1];

    results.push({
      id: `inline-${latestComment.id}`,
      kind: "inline_comment",
      author: latestComment.author,
      createdAt: latestComment.createdAt,
      state: undefined,
      filePath: thread.path,
      line: thread.line ?? thread.originalLine ?? undefined,
      isResolved: false,
      body: latestComment.body,
      url: latestComment.url,
      isBot: false,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main normalization function
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeAll(
  prView: PRView,
  issueComments: IssueComment[],
  inlineComments: InlineComment[]
): NormalizedComment[] {
  const prAuthor = prView.author.login;

  const allComments: NormalizedComment[] = [
    ...normalizeReviews(prView),
    ...normalizeIssueComments(issueComments, prAuthor),
    ...normalizeInlineComments(inlineComments, prAuthor),
  ];

  // Sort by createdAt (oldest first)
  return allComments.sort((a, b) => {
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aDate - bDate;
  });
}
