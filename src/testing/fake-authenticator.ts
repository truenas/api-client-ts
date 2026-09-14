import type { Observable } from 'rxjs';
import { TrueNasAuthenticator } from '@/auth/truenas-authenticator';
import { TrueNasAuthMechanism } from '@/enums/truenas-auth-mechanism.enum';
import type { ApiVersion } from '@/types/api-version.type';
import { AuthResponseType, type AuthResponse } from '@/types/auth.type';
import type { FakeConnection } from './fake-connection';

/** One recorded login attempt. */
export interface RecordedLogin {
  mechanism: TrueNasAuthMechanism;
  /** The username, token or key the caller passed, whichever the mechanism takes. */
  credential: string;
}

/**
 * A `TrueNasAuthenticator` that records its logins and answers them without a
 * socket.
 *
 * Every override records the attempt and then calls the real method, so the
 * real code sends the frame, stores credentials and interprets the response.
 * `succeedNextLogin` / `failNextLogin` only script the connection's reply — a
 * fake that decided success itself would disagree with the real client on
 * what an answer means.
 */
export class FakeAuthenticator extends TrueNasAuthenticator {
  private readonly attempts: RecordedLogin[] = [];

  /** Armed by the scripting methods; consumed by the next login that is made. */
  private armed: AuthResponse | undefined;

  /**
   * Answers waiting for their frames, oldest first.
   *
   * Bound when the login is *made*, not when the reply goes out. Reading an
   * armed answer at reply time meant a second login armed in the meantime
   * answered the first — two logins in flight is exactly what testing
   * supersession looks like, so scripting both is the ordinary case, and it
   * produced the same wrong verdict this class was rewritten to stop
   * producing.
   */
  private readonly pending: AuthResponse[] = [];

  constructor(
    private readonly fakeConnection: FakeConnection,
    version?: ApiVersion
  ) {
    super(fakeConnection, version);

    // Unscripted logins succeed. The common unit test does not care about
    // authenticating and should not have to arrange it; the ones that do care
    // script the next attempt.
    //
    // This occupies the connection's `auth.login_ex` answer. A spec that
    // registers its own for that method takes login scripting with it.
    this.fakeConnection.autoReply('auth.login_ex', frame => {
      this.fakeConnection.receive({
        jsonrpc: '2.0',
        id: frame.id,
        result: this.pending.shift() ?? this.success(),
      });
    });
  }

  /**
   * Every login attempt, in order.
   *
   * Including the ones the base class makes itself: the auto-relogin runs
   * through these same methods, and nothing here distinguishes it from a
   * caller's login. A spec counting logins across a reconnect should expect
   * that one.
   */
  get logins(): readonly RecordedLogin[] {
    return this.attempts;
  }

  /** The next login is answered with this response. Defaults to a success. */
  succeedNextLogin(response: Partial<AuthResponse> = {}): void {
    this.armed = { response_type: AuthResponseType.Success, ...response };
  }

  /**
   * The next login is answered with a rejection.
   *
   * A `response_type` rather than an `Error`, so what the caller sees is
   * whatever the real authenticator makes of it — the `AuthError` codes
   * included, which a hand-thrown `Error` could not produce.
   */
  failNextLogin(responseType: AuthResponseType = AuthResponseType.AuthErr): void {
    this.armed = { response_type: responseType };
  }

  /**
   * Records the attempt and binds its answer, in that order, before the real
   * method puts a frame on the wire.
   */
  private record(mechanism: TrueNasAuthMechanism, credential: string): void {
    this.attempts.push({ mechanism, credential });
    this.pending.push(this.armed ?? this.success());
    this.armed = undefined;
  }

  private success(): AuthResponse {
    return { response_type: AuthResponseType.Success };
  }

  override loginWithUserPass(username: string, password: string): Observable<AuthResponse> {
    this.record(TrueNasAuthMechanism.Password, username);
    return super.loginWithUserPass(username, password);
  }

  override loginWithToken(token: string): Observable<AuthResponse> {
    this.record(TrueNasAuthMechanism.Token, token);
    return super.loginWithToken(token);
  }

  override loginWithApiKey(credentials: { username: string; key: string }): Observable<AuthResponse> {
    this.record(TrueNasAuthMechanism.ApiKey, credentials.username);
    return super.loginWithApiKey(credentials);
  }

  override loginWithOtp(code: string): Observable<AuthResponse> {
    this.record(TrueNasAuthMechanism.Otp, code);
    return super.loginWithOtp(code);
  }
}
