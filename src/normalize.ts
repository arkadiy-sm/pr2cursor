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
  "sonarqube",
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

function endsWithBot(author: string): boolean {
  return author.toLowerCase().endsWith("bot");
}

export function isLikelyBot(author: string): boolean {
  const authorLower = author.toLowerCase();
  if (endsWithBot(author)) return true;
  for (const pattern of BOT_AUTHOR_PATTERNS) {
    if (authorLower.includes(pattern)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Find PR author's last activity timestamp
// ─────────────────────────────────────────────────────────────────────────────

function findAuthorLastActivity(
  prAuthor: string,
  issueComments: IssueComment[],
  inlineComments: InlineComment[]
): Date | null {
  let lastActivity: Date | null = null;

  // Check issue comments
  for (const comment of issueComments) {
    if (comment.user?.login === prAuthor && comment.created_at) {
      const date = new Date(comment.created_at);
      if (!lastActivity || date > lastActivity) {
        lastActivity = date;
      }
    }
  }

  // Check inline comments
  for (const thread of inlineComments) {
    for (const comment of thread.comments) {
      if (comment.author === prAuthor && comment.createdAt) {
        const date = new Date(comment.createdAt);
        if (!lastActivity || date > lastActivity) {
          lastActivity = date;
        }
      }
    }
  }

  return lastActivity;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalize review bodies - only keep if after author's last activity
// ─────────────────────────────────────────────────────────────────────────────

function normalizeReviews(
  prView: PRView,
  authorLastActivity: Date | null
): NormalizedComment[] {
  const results: NormalizedComment[] = [];
  const latestByAuthor = new Map<string, typeof prView.reviews[0]>();

  for (const review of prView.reviews) {
    if (!review.author) continue;
    const author = review.author.login;
    
    if (isLikelyBot(author)) continue;
    if (author === prView.author.login) continue;

    // Only keep if after author's last activity
    if (authorLastActivity && review.submittedAt) {
      const reviewDate = new Date(review.submittedAt);
      if (reviewDate <= authorLastActivity) continue;
    }

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

    if (isApproved && !hasBody) continue;
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
// Normalize issue comments - only keep if after author's last activity
// ─────────────────────────────────────────────────────────────────────────────

function normalizeIssueComments(
  comments: IssueComment[],
  prAuthor: string,
  authorLastActivity: Date | null
): NormalizedComment[] {
  const results: NormalizedComment[] = [];

  for (const comment of comments) {
    if (!comment.user) continue;
    const body = comment.body || "";
    if (!body.trim()) continue;

    const author = comment.user.login;

    if (isLikelyBot(author)) continue;
    if (author === prAuthor) continue;

    // Only keep if after author's last activity
    if (authorLastActivity && comment.created_at) {
      const commentDate = new Date(comment.created_at);
      if (commentDate <= authorLastActivity) continue;
    }

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
// Normalize inline comments - skip if author replied in thread
// ─────────────────────────────────────────────────────────────────────────────

function normalizeInlineComments(
  threads: InlineComment[],
  prAuthor: string
): NormalizedComment[] {
  const results: NormalizedComment[] = [];

  for (const thread of threads) {
    // Skip resolved threads
    if (thread.isResolved) continue;
    
    // Skip outdated threads
    if (thread.isOutdated) continue;

    // Check if PR author replied in this thread
    const authorReplied = thread.comments.some(c => c.author === prAuthor);
    
    // Get comments from reviewers (not bots, not PR author)
    const reviewerComments = thread.comments.filter(c => {
      if (isLikelyBot(c.author)) return false;
      if (c.author === prAuthor) return false;
      return true;
    });

    if (reviewerComments.length === 0) continue;

    // If author replied, only include comments AFTER author's last reply
    if (authorReplied) {
      const authorComments = thread.comments.filter(c => c.author === prAuthor);
      const lastAuthorReply = authorComments[authorComments.length - 1];
      const lastAuthorDate = new Date(lastAuthorReply.createdAt);

      // Filter to only comments after author's reply
      const newComments = reviewerComments.filter(c => 
        new Date(c.createdAt) > lastAuthorDate
      );

      if (newComments.length === 0) continue;

      // Take the latest new comment
      const latestComment = newComments[newComments.length - 1];
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
    } else {
      // Author hasn't replied - include latest reviewer comment
      const latestComment = reviewerComments[reviewerComments.length - 1];
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
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main normalization function
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizeResult {
  comments: NormalizedComment[];
  authorLastActivity: Date | null;
}

export function normalizeAll(
  prView: PRView,
  issueComments: IssueComment[],
  inlineComments: InlineComment[]
): NormalizeResult {
  const prAuthor = prView.author.login;

  // Find when the PR author last responded
  const authorLastActivity = findAuthorLastActivity(
    prAuthor,
    issueComments,
    inlineComments
  );

  const allComments: NormalizedComment[] = [
    ...normalizeReviews(prView, authorLastActivity),
    ...normalizeIssueComments(issueComments, prAuthor, authorLastActivity),
    ...normalizeInlineComments(inlineComments, prAuthor),
  ];

  // Sort by createdAt (oldest first)
  const sorted = allComments.sort((a, b) => {
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aDate - bDate;
  });

  return { comments: sorted, authorLastActivity };
}
