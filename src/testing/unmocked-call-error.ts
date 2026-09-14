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
 * would deliver the message and drop the class. Thrown from `send` instead.
 *
 * **Where it surfaces depends on who sent the frame.** Every `TrueNasApi` verb
 * dispatches inside a `defer`, so the throw becomes an error notification on
 * the returned observable and a lazily composed call still behaves. The
 * authenticator sends from its method bodies — `logout` and `newApiKey` — so
 * there it throws where the call is written. Both fail, both name the method;
 * only one is catchable as a rejected observable, and a spec written as
 * `await expect(firstValueFrom(client.authenticator.logout())).rejects…` will
 * not reach its assertion.
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
