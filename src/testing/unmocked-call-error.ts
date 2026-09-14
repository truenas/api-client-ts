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
 * the returned observable and a lazily composed call still behaves. Every
 * authenticator method sends from its own body instead, so an unanswered frame
 * there throws where the call is written.
 *
 * In practice that is `logout` and `newApiKey`, and the reason is the fake's
 * scripting rather than the shape of the sends: `FakeAuthenticator` installs
 * an auto-reply for `auth.login_ex` and none for `auth.logout` or
 * `api_key.create`, so the four login methods are answered and those two are
 * not. Script either one and it stops throwing; the pair moves if the fake
 * ever answers one more method.
 *
 * Both kinds fail and both name the method. Only the verbs are catchable as a
 * rejected observable, so a spec written as
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
