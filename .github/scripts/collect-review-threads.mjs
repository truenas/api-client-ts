/**
 * Write the PR's existing review threads to a file the review prompt includes,
 * so a re-run can see what it already said and what a human already answered.
 *
 * Without this the reviewer is blind to its own history. It said so itself, in
 * two consecutive reviews on #24:
 *
 *   > I could not enumerate the existing inline threads — `gh api
 *   > .../pulls/24/comments` is not permitted in this environment and `gh pr
 *   > view --comments` returns only top-level comments
 *
 * so it restated findings that already had threads rather than risk duplicates.
 * The consequence is worse than duplication: resolving a thread suppresses
 * nothing, so a finding a human considered and declined comes back every round,
 * and a bounded review loop cannot converge on anything it was told to drop.
 *
 * Resolution state is GraphQL-only — the REST `/pulls/{n}/comments` payload has
 * no `isResolved` — which is why this runs here with the job's own token rather
 * than being handed to the reviewer as a shell command. The reviewer gains no
 * new tool permissions; it just gets a file.
 */

const QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          pageInfo { hasNextPage }
          nodes {
            isResolved
            isOutdated
            path
            line
            opening: comments(first: 1) {
              nodes {
                body
                author { login }
              }
            }
            latest: comments(last: 1) {
              nodes {
                body
                author { login }
              }
            }
          }
        }
      }
    }
  }
`;

/** First line of a finding, which is where the severity label lives. */
const summarise = (body) => {
  const firstLine = (body ?? '').split('\n').find((l) => l.trim()) ?? '(empty)';
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
};

const describe = (t) => {
  // `isOutdated` is the API's own answer. A null `line` means a file-level
  // thread, which is a different thing and was being labelled as outdated.
  const at = t.line ? `${t.path}:${t.line}` : `${t.path} (whole file)`;
  const where = t.isOutdated ? `${at} — outdated` : at;

  const opening = t.opening?.nodes?.[0];
  const latest = t.latest?.nodes?.[0];
  const lines = [
    `- \`${where}\` — @${opening?.author?.login ?? 'unknown'} — ${summarise(opening?.body)}`,
  ];

  // The last comment is where a human says why they disagreed, which is the
  // half that makes a resolved thread worth reading rather than just counting.
  if (latest && latest.body !== opening?.body) {
    lines.push(`  - reply from @${latest.author?.login ?? 'unknown'}: ${summarise(latest.body)}`);
  }
  return lines.join('\n');
};

const render = (threads, truncated) => {
  const resolved = threads.filter((t) => t.isResolved);
  const open = threads.filter((t) => !t.isResolved);

  const lines = ['## Review threads already on this PR', ''];

  if (!threads.length) {
    lines.push('None. This is the first review, so nothing has been raised or answered yet.');
    return lines.join('\n');
  }

  lines.push(
    `${threads.length} thread(s): ${open.length} unresolved, ${resolved.length} resolved.`,
    ''
  );

  // Silently showing the first 100 of 140 would read as a complete history and
  // let the rest be duplicated, so say it rather than imply completeness.
  if (truncated) {
    lines.push(
      '**This list is truncated at 100 threads.** Treat anything not named here',
      'as unknown rather than absent, and prefer replying to opening a thread.',
      ''
    );
  }

  if (resolved.length) {
    lines.push(
      '### Resolved — do not raise these again',
      '',
      'Someone read each of these and closed it. That is a decision, not an',
      'oversight: treat it as settled even if you would rate it differently.',
      'Raise it again only if this push changed the code it points at, and say',
      'what changed.',
      '',
      ...resolved.map(describe),
      ''
    );
  }

  if (open.length) {
    lines.push(
      '### Unresolved — reply in the thread, do not open a second one',
      '',
      'These are still open. If a finding you are about to make is one of them,',
      'add to that thread instead of creating a new one.',
      '',
      '**It still belongs in the structured output, at its own severity.** The',
      'gate scores that list and nothing else, so omitting a live MEDIUM because',
      'it already has a thread is how an outstanding finding turns the check',
      'green. Deduplicate threads, never findings.',
      '',
      ...open.map(describe)
    );
  }

  return lines.join('\n');
};

const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '/').split('/');
const number = Number(process.env.PR_NUMBER);
const token = process.env.GH_TOKEN;
const out = process.env.OUT_FILE;

/**
 * Never fail the job, and never write a file that reads as "nothing was ever
 * raised" when the truth is "the lookup broke". A blank history is a licence to
 * repeat every previous finding, so an error has to say it is an error.
 */
const fail = (why) =>
  [
    '## Review threads already on this PR',
    '',
    `**Could not be retrieved: ${why}**`,
    '',
    'Treat this as unknown history, not as an empty one. Existing threads may',
    'carry findings that were already answered, so prefer replying over opening',
    'new threads, and say in the summary that prior threads could not be read.',
  ].join('\n');

let body;
try {
  if (!token) throw new Error('GH_TOKEN is not set');
  if (!owner || !repo) throw new Error(`GITHUB_REPOSITORY is "${process.env.GITHUB_REPOSITORY}"`);
  if (!Number.isInteger(number)) throw new Error(`PR_NUMBER is "${process.env.PR_NUMBER}"`);

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query: QUERY, variables: { owner, repo, number } }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const payload = await res.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join('; '));
  }

  const reviewThreads = payload.data?.repository?.pullRequest?.reviewThreads;
  const threads = reviewThreads?.nodes;
  if (!Array.isArray(threads)) throw new Error('no reviewThreads in the response');

  body = render(threads, Boolean(reviewThreads.pageInfo?.hasNextPage));
  console.log(`Collected ${threads.length} review thread(s) for #${number}.`);
} catch (error) {
  body = fail(error.message);
  console.log(`::warning::could not read review threads: ${error.message}`);
}

await (await import('node:fs/promises')).writeFile(out, `${body}\n`, 'utf8');
