/**
 * Thrown when a strict fake connection is handed a frame nothing will answer.
 *
 * Named rather than a bare `Error` so a consumer's global guard can tell "the
 * spec forgot a mock" from a failure the code under test produced.
 *
 * It cannot travel as an error *frame* — `dispatch` reduces any frame's error
 * to `new Error(getApiErrorMessage(…))` — so it is thrown from `send`. A
 * `TrueNasApi` verb dispatches inside a `defer` and so fails its observable;
 * the authenticator sends from its own body and throws at the call site, which
 * in practice is `logout` and `newApiKey` — the two `FakeAuthenticator` does
 * not auto-reply.
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
