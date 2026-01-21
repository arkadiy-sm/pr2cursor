# pr2cursor

Generate Cursor-ready prompts from GitHub Pull Request feedback.

This CLI tool collects all PR feedback (inline review comments, review bodies, and PR conversation comments) and outputs a markdown file that instructs Cursor to analyze the comments, make fixes, and provide a report with draft replies.

## Prerequisites

1. **Node.js 18+** installed
2. **GitHub CLI (`gh`)** installed and authenticated:

   ```bash
   # Install gh (macOS)
   brew install gh

   # Or see: https://cli.github.com/

   # Authenticate
   gh auth login
   ```

3. Verify authentication:
   ```bash
   gh auth status
   ```

## Installation

```bash
git clone https://github.com/arkadiy-sm/pr2cursor.git
cd pr2cursor
npm install
npm link
```

This creates a global `pr2cursor` command you can run from any directory.

To uninstall globally:
```bash
npm unlink -g pr2cursor
```

## Usage

```bash
# Run from any directory - output saved in current folder
pr2cursor <PR_NUMBER> [owner/repo]

# Examples
pr2cursor 123                      # auto-detect repo from current git directory
pr2cursor 123 facebook/react       # specify repo explicitly
```

## Output

The tool creates `pr-<PR_NUMBER>.md` in your **current directory**.

### What the prompt includes:

1. **PR metadata** — Title, URL, branches, state
2. **Instructions for Cursor** — How to analyze and classify comments
3. **All PR comments** — Numbered list with author, type, location, and full text
4. **Report Template** — For Cursor to fill out after analysis

### How Cursor should use it:

1. Analyze each comment and classify as **FIX**, **REPLY**, or **IGNORE**
2. Make code fixes for FIX items
3. Produce a report with:
   - Classification for each comment
   - What was changed (for FIX items)
   - Draft GitHub replies (for REPLY items)

## Example

```bash
$ pr2cursor 123 my-org/my-repo

🔍 pr2cursor - Generating Cursor prompt from PR feedback

1️⃣  Checking GitHub CLI authentication...
   ✅ Authenticated

2️⃣  Using provided repo: my-org/my-repo

3️⃣  Fetching PR #123 data...
   ✅ PR info: "Add new feature"
   ✅ PR comments: 5
   ✅ Inline comments: 3 threads

4️⃣  Normalizing comments...
   ✅ Total comments: 10

5️⃣  Rendering prompt...
   ✅ Written: ./pr-123.md (5432 chars)

✨ Done! Open the file in Cursor and let it analyze the PR feedback.
```

## Troubleshooting

### "reviewThreads missing" / No inline comments

The tool uses GitHub's GraphQL API to fetch inline comments. This may fail if:
- Your `gh` version is outdated (update with `brew upgrade gh`)
- Repository requires SSO authentication
- You don't have read access to the repository

The tool will continue without inline comments and still produce useful output.

### "gh command failed"

Ensure you're authenticated:

```bash
gh auth status
gh auth login
```

For enterprise GitHub or SSO:

```bash
gh auth login --hostname github.mycompany.com
```

### Permission / SSO issues

If you're accessing a repository that requires SSO:

```bash
gh auth refresh -s read:org
```

## Architecture

```
src/
├── pr2cursor.ts   # Main CLI entry point
├── gh.ts          # All GitHub CLI interactions
├── normalize.ts   # Normalize data from different sources
├── render.ts      # Markdown rendering
└── types.ts       # TypeScript types and Zod schemas
```

## License

MIT
