import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas for GitHub API responses
// ─────────────────────────────────────────────────────────────────────────────

export const ReviewSchema = z.object({
  author: z.object({ login: z.string() }).nullable(),
  state: z.string(),
  submittedAt: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
});

export const PRViewSchema = z.object({
  title: z.string(),
  url: z.string(),
  author: z.object({ login: z.string() }),
  state: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  baseRefName: z.string(),
  headRefName: z.string(),
  reviews: z.array(ReviewSchema).optional().default([]),
});

export const IssueCommentSchema = z.object({
  user: z.object({ login: z.string() }).nullable(),
  created_at: z.string(),
  body: z.string().nullable().optional(),
  html_url: z.string(),
  id: z.number(),
});

export const RepoInfoSchema = z.object({
  nameWithOwner: z.string(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Review = z.infer<typeof ReviewSchema>;
export type PRView = z.infer<typeof PRViewSchema>;
export type IssueComment = z.infer<typeof IssueCommentSchema>;
export type RepoInfo = z.infer<typeof RepoInfoSchema>;

export type CommentKind = "inline_comment" | "review_body" | "pr_comment";

export interface NormalizedComment {
  id: string;
  kind: CommentKind;
  author: string;
  createdAt: string | undefined;
  state: string | undefined;
  filePath: string | undefined;
  line: number | string | undefined;
  isResolved: boolean | undefined;
  body: string;
  url: string | undefined;
  isBot: boolean;
}

export type ActionType = "FIX" | "REPLY" | "IGNORE";

export interface Classification {
  action: ActionType;
  reason: string;
}

export interface ClassifiedComment extends NormalizedComment {
  classification: Classification;
}

export interface InlineComment {
  path: string;
  line: number | null;
  originalLine: number | null;
  isResolved: boolean;
  isOutdated: boolean;
  comments: Array<{
    id: string;
    author: string;
    createdAt: string;
    body: string;
    url: string;
  }>;
}

export interface PRData {
  prView: PRView;
  issueComments: IssueComment[];
  inlineComments: InlineComment[];
  diff: string;
}
