/**
 * Thrown when a strict fake connection is handed a frame nothing will answer.
 *
 * A named class rather than a bare `Error` so a consumer's global test guard
 * can tell "the spec forgot a mock" from a failure the code under test
 * produced, and render it accordingly. The two are the same shape otherwise —
 * a rejected observable carrying a message — and a suite that cannot tell them
 * apart reports a missing fixture as a bug in the thing being tested.
 *
 * It cannot travel as an error *frame*: `TrueNasApi.dispatch` reduces any
 * frame's error to `new Error(getApiErrorMessage(…))`, so answering with one
 * would deliver the message and drop the class. Thrown from `send` instead,
 * which `dispatch` calls inside a `defer` — so the consumer still gets a
 * failing observable rather than an exception at call time, and still gets
 * this class.
 */
export class UnmockedCallError extends Error {
  constructor(
    readonly method: string,
    readonly params: unknown
  ) {
    super(
      `Unmocked call: nothing is scripted to answer '${method}'` +
        `${params === undefined ? '' : ` with ${JSON.stringify(params)}`}. ` +
        'Script it with mock.call / mock.query / mock.job, answer the frame ' +
        'with connection.reply, or build the client without { strict: true }.'
    );
    this.name = 'UnmockedCallError';
  }
}
