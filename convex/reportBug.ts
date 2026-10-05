/**
 * Bug reports from the app, filed as GitHub issues on GITHUB_REPO using
 * GITHUB_TOKEN (PAT with public_repo scope), both set on the Convex deployment.
 *
 * Signed-in and rate-limited: the issues are public, so the reporter's name
 * comes from their profile here, not from the browser.
 */
import { ConvexError, v } from 'convex/values';
import { api } from './_generated/api';
import { action } from './_generated/server';
import { enforceLimit, requireUserId } from './rateLimits';

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;
const MAX_FIELD = 300;

const fail = (message: string) => new ConvexError({ code: 'BUG_REPORT_FAILED', message });

export const submit = action({
  args: {
    title: v.string(),
    description: v.string(),
    browserInfo: v.string(),
    appVersion: v.string(),
    pageUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ issueNumber: number; issueUrl: string }> => {
    const userId = await requireUserId(ctx);
    const title = args.title.trim();
    const description = args.description.trim();
    if (!title || !description) throw fail('Please add a title and a description.');
    if (title.length > MAX_TITLE || description.length > MAX_DESCRIPTION) {
      throw fail(
        `Please keep the title under ${MAX_TITLE} characters and the description under ${MAX_DESCRIPTION}.`,
      );
    }
    await enforceLimit(ctx, 'bugReport', userId);

    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO;
    if (!githubToken || !githubRepo) {
      console.error('reportBug: GITHUB_TOKEN or GITHUB_REPO is not set on this deployment');
      throw fail("Bug reports aren't set up yet. Please try again later.");
    }

    const profile = await ctx.runQuery(api.userProfiles.getMyProfile, {});
    const clip = (s: string) => s.slice(0, MAX_FIELD).replace(/`/g, "'");
    const issueBody = `## Bug Report

${description}

---

| Field | Value |
|-------|-------|
| **Reporter** | ${profile?.displayName ?? 'A NugNotes user'} |
| **App Version** | ${clip(args.appVersion)} |
| **Browser** | \`${clip(args.browserInfo)}\` |
| **Page** | \`${clip(args.pageUrl)}\` |
| **Reported at** | ${new Date().toISOString()} |
`;

    const response = await fetch(`https://api.github.com/repos/${githubRepo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title, body: issueBody, labels: ['bug', 'user-report'] }),
    });
    if (!response.ok) {
      console.error('reportBug: GitHub API error', response.status, await response.text());
      throw fail("Your report couldn't be filed right now. Please try again in a bit.");
    }
    const issue = (await response.json()) as { number: number; html_url: string };
    return { issueNumber: issue.number, issueUrl: issue.html_url };
  },
});
