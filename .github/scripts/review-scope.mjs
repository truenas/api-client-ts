/**
 * Tell the reviewer what changed since it last looked, so a re-run is bounded
 * by the size of the push rather than by the size of the PR.
 *
 * Without this, every round re-reads the whole diff and can surface something
 * new on code nobody touched. That is not the reviewer misbehaving — a large
 * PR has an effectively unlimited supply of small observations, and which ones
 * surface varies run to run. On #24 the final round raised two findings on
 * files that round did not touch; both had sat in "notes, not findings" for
 * three rounds. Scoping the re-read to the push is what makes the rounds
 * shrink as the changes shrink.
 *
 * The diff is `github.event.before..github.event.after` — the branch tips this
 * push moved between. Not `HEAD`: on a `pull_request` event that is
 * refs/pull/N/merge, so diffing to it would report every base-branch commit
 * since the branch point as part of the push.
 *
 * `before` is unusable after a force-push or rebase — it stops existing, or
 * stops being an ancestor, and both are checked. The honest answer there is a
 * full re-read, not a diff against two diverged states.
 */

import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const ZERO = '0000000000000000000000000000000000000000';

const full = (why) =>
  [
    '## What to review',
    '',
    `**The whole pull request.** ${why}`,
    '',
    'Review the full diff against the base branch.',
  ].join('\n');

const scoped = (before, after, files) =>
  [
    '## What to review',
    '',
    `**Only what changed since the last review**, which is \`${before.slice(0, 7)}..${after.slice(0, 7)}\`:`,
    '',
    ...files.map((f) => `- \`${f}\``),
    '',
    'You have already reviewed everything else on this branch. Findings outside',
    'these files are out of scope for this round — not because they would be',
    'wrong, but because raising them now means the round count never converges',
    'while the code stops changing.',
    '',
    'Two exceptions, both narrow. Raise something outside these files if the',
    'change above *makes* it wrong — a caller these edits broke, a doc these',
    'edits falsified — or if it is a BLOCKER or HIGH, which is worth breaking',
    'any scoping rule for. Say which exception you are using.',
    '',
    'This bounds where you go looking. It does not remove anything from the',
    'structured output: a finding already open on this PR stays in that list at',
    'its own severity while it is true, in scope or not, because the gate scores',
    'that list and nothing else.',
  ].join('\n');

/**
 * Was this commit reviewed *and* clean?
 *
 * Both halves are load-bearing, and the second one is the important one.
 *
 * Reviewed, because `github.event.before` is the previous *head*, not the last
 * *reviewed* head, and they diverge whenever a round did not run — an `opened`
 * event skipped because `check-team` hit an outage, a run cancelled by the job
 * timeout, a push made while a review was still in flight. Diffing from a sha
 * nobody read silently drops everything that arrived with it.
 *
 * Clean, because the gate scores only the findings of the run it belongs to.
 * If round 1 found a BLOCKER and round 2 is scoped to an unrelated one-line
 * push, round 2 reports nothing, the gate sees an empty list, and the check
 * goes green while the BLOCKER is still in the branch. Scoping would have
 * turned a red check into a merge, which is worse than any finding it saves.
 *
 * So a red review is never scoped from: while anything is outstanding, every
 * round re-reads the whole PR and has to re-find it. Scoping resumes only from
 * a state where the entire diff was reviewed and nothing blocked — which makes
 * the invariant inductive. Each scoped round starts from a green whole-PR
 * review plus a chain of green deltas.
 */
const reviewedAndGreen = async (sha) => {
  const token = process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return { ok: false, why: 'no token to check it with' };

  const res = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs`, {
    headers: { authorization: `bearer ${token}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return { ok: false, why: `check-runs lookup returned HTTP ${res.status}` };

  const runs = (await res.json()).check_runs ?? [];
  const review = runs.find((r) => r.name === 'review');
  if (!review) return { ok: false, why: 'no review ran on it' };
  if (review.status !== 'completed') return { ok: false, why: `its review is ${review.status}` };
  if (review.conclusion !== 'success') {
    return { ok: false, why: `its review ended as ${review.conclusion}, so something is outstanding` };
  }
  return { ok: true };
};

const out = process.env.OUT_FILE;
// Checked before anything else, as in the sibling script: with no path to write
// to there is nowhere to report a failure, so failing quietly is not an option.
if (!out) {
  console.log('::error::OUT_FILE is not set, so the review scope cannot be written');
  process.exit(1);
}
const action = process.env.EVENT_ACTION;
const before = process.env.EVENT_BEFORE;
const after = process.env.EVENT_AFTER;

let body;
let reviewed = { ok: true };

if (action === 'synchronize' && before && before !== ZERO) {
  reviewed = await reviewedAndGreen(before);
}

if (action !== 'synchronize') {
  body = full(`This is the first review of this pull request (\`${action}\`).`);
} else if (!before || before === ZERO) {
  body = full('The previous head of the branch was not reported for this push.');
} else if (!reviewed.ok) {
  body = full(
    `The previous head \`${before.slice(0, 7)}\` cannot be scoped from — ${reviewed.why}. ` +
      "Reviewing the whole pull request instead."
  );
  console.log(`::warning::full review: ${before.slice(0, 7)} was not reviewed (${reviewed.why})`);
} else {
  try {
    // NOT HEAD. actions/checkout resolves a pull_request event to
    // refs/pull/N/merge, so HEAD is the PR merged into the base — diffing to it
    // reports every base-branch commit since the branch point as part of this
    // push. `github.event.after` is the branch tip the push actually created.
    if (!after) throw new Error('github.event.after was not reported');

    // A shallow checkout has neither. `--depth=1` would fetch the commit but
    // none of its history, and `merge-base --is-ancestor` needs the history —
    // so the fetch would satisfy the existence check and then fail ancestry in
    // exactly the case it was there to rescue. Deepen instead.
    for (const sha of [before, after]) {
      try {
        git('cat-file', '-e', `${sha}^{commit}`);
      } catch {
        git('fetch', '--deepen=50', 'origin', sha);
        git('cat-file', '-e', `${sha}^{commit}`);
      }
    }

    // Existence is not ancestry. A rebase can leave `before` fetchable while it
    // is no longer on the branch, and `before..after` between diverged commits
    // is a diff of two unrelated states rather than of this push.
    try {
      git('merge-base', '--is-ancestor', before, after);
    } catch {
      throw new Error(`${before.slice(0, 7)} is not an ancestor of ${after.slice(0, 7)}`);
    }

    const files = git('diff', '--name-only', `${before}..${after}`).split('\n').filter(Boolean);

    body = files.length
      ? scoped(before, after, files)
      : full(`No files differ between \`${before.slice(0, 7)}\` and \`${after.slice(0, 7)}\`.`);
  } catch (error) {
    // Force-push, rebase, or a commit that is simply gone. Falling back to the
    // whole PR is the safe direction: it costs a longer review, where guessing
    // at a diff against a missing commit costs coverage.
    body = full(
      `The previous head \`${before.slice(0, 7)}\` is not reachable — a force-push ` +
        `or rebase, most likely (${error.message.split('\n')[0]}).`
    );
    console.log(`::warning::falling back to a full review: ${error.message.split('\n')[0]}`);
  }
}

await writeFile(out, `${body}\n`, 'utf8');
console.log(body.split('\n')[2]);
