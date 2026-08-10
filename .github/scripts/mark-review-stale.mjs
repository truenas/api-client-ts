/**
 * Mark the existing review summary as stale before a new review starts.
 *
 * One sticky comment edited in place is easier to read than one per round, but
 * it buys that with a window: from the moment a push lands until the new review
 * finishes, the comment describes code that is no longer there while looking
 * exactly as current as it did a minute earlier.
 *
 * Which way that misleads depends on luck. A stale "one BLOCKER" over a push
 * that fixed it is merely annoying. A stale "nothing blocking" over a push that
 * broke something is the direction worth spending a step on.
 *
 * The banner is removed by the reviewer itself: it rewrites the whole comment
 * body on success. So if the run is cancelled or dies, the banner stays — which
 * is correct, because the comment really is describing an older commit.
 */

import { writeFile } from 'node:fs/promises';

const MARKER = /<!--\s*reviewed-sha:\s*([0-9a-f]{7,40})\s*-->/;
const BANNER = '> [!WARNING]';

const token = process.env.GH_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const number = Number(process.env.PR_NUMBER);
const head = process.env.HEAD_SHA;

const api = async (path, init) => {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: {
      authorization: `bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} -> HTTP ${res.status}`);
  return res.json();
};

try {
  if (!token || !repo || !Number.isInteger(number) || !head) {
    throw new Error('missing GH_TOKEN, GITHUB_REPOSITORY, PR_NUMBER or HEAD_SHA');
  }

  const comments = await api(`/issues/${number}/comments?per_page=100`);
  const summary = [...comments].reverse().find((c) => MARKER.test(c.body ?? ''));

  if (!summary) {
    console.log('No previous review summary to mark; nothing to do.');
  } else if (summary.body.startsWith(BANNER)) {
    console.log('Already marked stale.');
  } else {
    const reviewed = MARKER.exec(summary.body)[1];

    if (head.startsWith(reviewed) || reviewed.startsWith(head.slice(0, 7))) {
      console.log(`Summary already describes ${head.slice(0, 7)}; not marking.`);
    } else {
      const banner = [
        BANNER,
        `> **Superseded.** This describes \`${reviewed.slice(0, 7)}\`. The branch is now`,
        `> at \`${head.slice(0, 7)}\` and a review of it is running — findings below may`,
        '> already be fixed, and problems introduced by the newer commits are not here yet.',
        '',
        '',
      ].join('\n');

      await api(`/issues/comments/${summary.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: banner + summary.body }),
      });
      console.log(`Marked the summary for ${reviewed.slice(0, 7)} as superseded by ${head.slice(0, 7)}.`);
    }
  }
} catch (error) {
  // Cosmetic. A review that runs with an unmarked stale comment is a great deal
  // better than a review that does not run.
  console.log(`::warning::could not mark the previous review stale: ${error.message}`);
}

// Written unconditionally so the prompt include never dangles.
if (process.env.OUT_FILE) {
  await writeFile(
    process.env.OUT_FILE,
    [
      '## Marking your summary',
      '',
      `End the top-level summary with this line exactly, on its own:`,
      '',
      `<!-- reviewed-sha: ${head ?? 'unknown'} -->`,
      '',
      'It is invisible in rendered markdown. It records which commit the summary',
      'describes, so the next run can mark it superseded rather than leaving a',
      'reader to assume a comment written four commits ago still applies.',
      '',
    ].join('\n'),
    'utf8'
  );
}
