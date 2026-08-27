import {
  BehaviorSubject,
  EMPTY,
  catchError,
  filter,
  finalize,
  map,
  of,
  switchMap,
  take,
  tap,
  throwError,
} from 'rxjs';
import { TrueNasConnection } from '@/connection/truenas-connection';
import { ApiVersion } from '@/types/api-version.type';
import { legacyCutoffYear } from '@/utils/api-version.utils';
import { TrueNasAuthMechanism } from '@/enums/truenas-auth-mechanism.enum';
import { AuthError, AuthErrorCode } from '@/errors/auth.errors';
import { getApiErrorMessage } from '@/types/api-error.type';
import { ApiKeyCreate } from '@/types/api-key-create.type';
import { AuthResponse, AuthResponseType } from '@/types/auth.type';
import { createJsonRpcMessage } from '@/utils/jsonrpc.utils';
import { randomUUID, withId } from '@/utils/utils';

const throwOnAuthenticationFailure = (code: AuthErrorCode, message: string) =>
  switchMap((response: AuthResponse) => {
    if (response.response_type === AuthResponseType.AuthErr) {
      return throwError(() => new AuthError(code, message));
    }

    return of(response);
  });

/**
 * TrueNAS authenticator using the JSON-RPC 2.0 protocol.
 *
 * It handles authentication using the JSON-RPC 2.0 message format.
 *
 * Authentication only: any credential middleware accepts logs in here, whatever
 * roles it carries. No path checks privilege, and that is the design — the
 * appliance authorizes every privileged call on its own, and which roles a given
 * product requires is that product's policy, not this client's. Consumers who
 * need one read `user_info.privilege.roles` off the response and enforce it
 * themselves; embedding a rule here would impose it on every consumer at once.
 */
export class TrueNasAuthenticator {
  static readonly DefaultSessionLifetime = 300; // in seconds (5 minutes)

  /**
   * whether or not the system is currently authenticated and accessible.
   * this is a `BehaviorSubject` instead of a signal, since we use its `getValue` method
   * throughout a lot of the codebase.
   */
  authenticated$ = new BehaviorSubject(false);

  /**
   * `true` when the system is currently being authenticated to, and `false` otherwise.
   * does not indicate whatsoever if authentication is successful or not, just whether the process
   * is ongoing.
   */
  authenticating$ = new BehaviorSubject(false);

  credentials = { username: '', password: '', key: '' };
  sessionLifetime = TrueNasAuthenticator.DefaultSessionLifetime;

  /**
   * Bumped by every login and by `logout()`. Each takes the new value when it
   * sends and checks it again when its answer lands: a difference means another
   * of them was issued while this one was in flight, so this answer is stale and
   * must not write session state.
   *
   * Symmetric on purpose. Guarding only the logins leaves the mirror image — a
   * logout answer arriving after a login sent later than it, resetting
   * `authenticated$` on a session that is genuinely authenticated. Responses on
   * one socket are not ordered, which is the premise this mechanism exists for,
   * and it holds in both directions.
   */
  private authEpoch = 0;

  constructor(
    private connection: TrueNasConnection,
    private readonly version?: ApiVersion,
  ) {
    this.connection.opened
      .pipe(
        filter(
          isOpen =>
            !!(
              isOpen &&
              this.credentials?.username &&
              (this.credentials.password || this.credentials.key)
            )
        ),
        switchMap(() => {
          const relogin = this.credentials.password
            ? this.loginWithUserPass(
                this.credentials.username,
                this.credentials.password
              )
            : this.loginWithApiKey({
                username: this.credentials.username,
                key: this.credentials.key,
              });

          // This subscriber has no error handler, and an error reaching it
          // would tear down `opened` for good — no reconnect would ever log in
          // again, including after a later successful login. A relogin can fail
          // for ordinary reasons: superseded by a logout mid-flight, or refused
          // outright because the password changed server-side. Neither is a
          // reason to stop trying on the next reconnect.
          return relogin.pipe(catchError(() => EMPTY));
        })
      )
      .subscribe();
    connection.closed.subscribe(() => {
      this.sessionLifetime = TrueNasAuthenticator.DefaultSessionLifetime;
      this.authenticated$.next(false);
    });
  }

  /**
   * `login_options` asking for a reconnect token, when the server understands it.
   *
   * Omitted below v26. `AuthCommonOptions` is `additionalProperties: false`
   * there and has only `user_info`, so sending the member is a validation
   * error, not an ignored field — it would fail login outright on the oldest
   * version this client supports.
   */
  /**
   * Two things this does not do, both deliberate and both worth knowing.
   *
   * There is no way for a consumer to decline: every v26+ password login now
   * mints a single-use credential carrying that session's roles, whether or not
   * the caller wants one. And the auto-relogin in the constructor subscribes
   * with no observer, so the token it mints is dropped — a caller reconnecting
   * repeatedly holds an ageing token while the appliance mints fresh ones
   * nobody reads. Tokens are single-use with a 600s TTL, so that is the
   * reconnect case the feature is named for.
   */
  private reconnectTokenOption(): { login_options: { reconnect_token: true } } | undefined {
    if (!this.version || this.version.year <= legacyCutoffYear) return undefined;
    return { login_options: { reconnect_token: true } };
  }

  /** Whether another login or logout was issued after this one was sent. */
  private superseded(sentDuring: number): boolean {
    return this.authEpoch !== sentDuring;
  }

  /**
   * Throws if this login has been superseded, so a stale answer cannot be
   * reported to its caller as a successful login.
   *
   * `logout()` does not use this — it returns quietly instead. Its caller asked
   * to end the session and that happened, whoever else intervened afterwards.
   */
  private assertNotSuperseded(sentDuring: number): void {
    if (!this.superseded(sentDuring)) return;
    throw new AuthError(
      AuthErrorCode.LoginSuperseded,
      'Login was superseded by a later logout or login and was discarded.'
    );
  }

  loginWithUserPass(username: string, password: string) {
    const sentDuring = ++this.authEpoch;
    // Versioned API uses auth.login_ex with a single object parameter
    const message = createJsonRpcMessage('auth.login_ex', [
      {
        mechanism: TrueNasAuthMechanism.Password,
        username,
        password,
        ...this.reconnectTokenOption(),
      },
    ]);

    this.authenticating$.next(true);
    this.connection.send(message);

    // createJsonRpcMessage always returns a message with an id
    const messageId = message.id ?? '';

    return this.connection.messages().pipe(
      withId(messageId),
      map(msg => {
        if (msg.error) {
          const errorMessage = getApiErrorMessage(
            msg.error,
            'Authentication failed'
          );
          throw new Error(errorMessage);
        }
        return msg.result as AuthResponse;
      }),
      throwOnAuthenticationFailure(
        AuthErrorCode.PasswordAuthFailed,
        'TrueNAS authentication failed. Please verify your TrueNAS user credentials and try again.'
      ),
      tap(res => {
        if (res.response_type === AuthResponseType.Success) {
          this.assertNotSuperseded(sentDuring);
          this.credentials.username = username;
          this.credentials.password = password;
          this.sessionLifetime =
            res.user_info?.attributes?.preferences?.lifetime ??
            TrueNasAuthenticator.DefaultSessionLifetime;
          this.authenticated$.next(true);
        }
      }),
      finalize(() => {
        this.authenticating$.next(false);
      }),
      take(1)
    );
  }

  loginWithOtp(code: string) {
    const sentDuring = ++this.authEpoch;
    // Versioned API uses auth.login_ex with a single object parameter
    const message = createJsonRpcMessage('auth.login_ex', [
      {
        mechanism: TrueNasAuthMechanism.Otp,
        otp_token: code,
      },
    ]);

    this.authenticating$.next(true);
    this.connection.send(message);

    // createJsonRpcMessage always returns a message with an id
    const messageId = message.id ?? '';

    return this.connection.messages().pipe(
      withId(messageId),
      map(msg => {
        if (msg.error) {
          const errorMessage = getApiErrorMessage(
            msg.error,
            'Authentication failed'
          );
          throw new Error(errorMessage);
        }
        return msg.result as AuthResponse;
      }),
      tap(res => {
        if (res?.response_type === AuthResponseType.Success) {
          this.assertNotSuperseded(sentDuring);
          this.sessionLifetime =
            res.user_info?.attributes?.preferences?.lifetime ??
            TrueNasAuthenticator.DefaultSessionLifetime;
          this.authenticated$.next(true);
        }
      }),
      throwOnAuthenticationFailure(
        AuthErrorCode.OtpAuthFailed,
        'TrueNAS authentication failed. Please verify your one-time passcode and try again.'
      ),
      finalize(() => {
        this.authenticating$.next(false);
      }),
      take(1)
    );
  }

  /**
   * Re-authenticate with a token from a previous login's `reconnect_token`.
   *
   * This is what lets a second connection to the same appliance authenticate
   * without asking the user for a password again — middleware sessions are
   * per-connection, so a second socket has its own to establish.
   *
   * The token is single-use and short-lived. On v26+ a successful login mints
   * another on the response, so a caller keeping a session alive across
   * reconnects stores the newest each time; below v26 nothing is minted and
   * there is no chain to keep.
   *
   * Re-login is the caller's to drive. A token session is not covered by the
   * automatic reconnect this class does for password and api-key sessions,
   * which is deliberate — the token is single-use — but it means a dropped
   * socket needs the stored token spending explicitly. Middleware holds tokens
   * in memory, so a `middlewared` restart voids them, and that is a common
   * reason the socket dropped in the first place.
   */
  loginWithToken(token: string) {
    const sentDuring = ++this.authEpoch;
    const message = createJsonRpcMessage('auth.login_ex', [
      {
        mechanism: TrueNasAuthMechanism.Token,
        token,
        ...this.reconnectTokenOption(),
      },
    ]);

    this.authenticating$.next(true);
    this.connection.send(message);

    const messageId = message.id ?? '';

    return this.connection.messages().pipe(
      withId(messageId),
      map(msg => {
        if (msg.error) {
          const errorMessage = getApiErrorMessage(
            msg.error,
            'Authentication failed'
          );
          throw new Error(errorMessage);
        }
        return msg.result as AuthResponse;
      }),
      // Password login lets non-`AUTH_ERR` answers through because it has to
      // hand `OTP_REQUIRED` back to the caller. Token login has no such case:
      // middleware answers `EXPIRED` for an account locked or expired between
      // minting and spending, and `DENIED` for a permission refusal, so letting
      // those reach `next` would report a failed login as a successful one.
      map(res => {
        if (res.response_type !== AuthResponseType.Success) {
          throw new AuthError(
            AuthErrorCode.TokenAuthFailed,
            `TrueNAS token authentication failed (${res.response_type}). The ` +
              'token may have expired or been used, or the account may no longer ' +
              'be permitted to log in.'
          );
        }
        return res;
      }),
      tap(res => {
        if (res.response_type === AuthResponseType.Success) {
          this.assertNotSuperseded(sentDuring);
          this.sessionLifetime =
            res.user_info?.attributes?.preferences?.lifetime ??
            TrueNasAuthenticator.DefaultSessionLifetime;
          this.authenticated$.next(true);
        }
      }),
      finalize(() => {
        this.authenticating$.next(false);
      }),
      take(1)
    );
  }

  /**
   * No reconnect token is requested here, though v26+ would mint one: an
   * api-key session already reconnects without a prompt, since the key is held
   * and replayed. The token exists for the credential that cannot be.
   */
  loginWithApiKey(credentials: { username: string; key: string }) {
    const sentDuring = ++this.authEpoch;
    const { username, key } = credentials;
    // Versioned API uses auth.login_ex with a single object parameter
    const message = createJsonRpcMessage('auth.login_ex', [
      {
        mechanism: TrueNasAuthMechanism.ApiKey,
        username,
        api_key: key,
      },
    ]);

    this.authenticating$.next(true);
    this.connection.send(message);

    // createJsonRpcMessage always returns a message with an id
    const messageId = message.id ?? '';

    return this.connection.messages().pipe(
      withId(messageId),
      map(msg => {
        if (msg.error) {
          const errorMessage = getApiErrorMessage(
            msg.error,
            'Authentication failed'
          );
          throw new Error(errorMessage);
        }
        return msg.result as AuthResponse;
      }),
      throwOnAuthenticationFailure(
        AuthErrorCode.ApiKeyAuthFailed,
        'TrueNAS authentication failed. Has the TrueNAS Connect API key been removed from your TrueNAS server?'
      ),
      tap(res => {
        this.assertNotSuperseded(sentDuring);
        this.credentials.username = username;
        this.credentials.key = key;
        this.sessionLifetime =
          res.user_info?.attributes?.preferences?.lifetime ??
          TrueNasAuthenticator.DefaultSessionLifetime;
        this.authenticated$.next(true);
      }),
      finalize(() => {
        this.authenticating$.next(false);
      }),
      take(1)
    );
  }

  newApiKey(username: string) {
    const message = createJsonRpcMessage('api_key.create', [
      { name: `tnc-${randomUUID()}`, username },
    ]);

    this.connection.send(message);

    // createJsonRpcMessage always returns a message with an id
    const messageId = message.id ?? '';

    return this.connection.messages().pipe(
      withId(messageId),
      map(msg => {
        if (msg.error) {
          const errorMessage = getApiErrorMessage(
            msg.error,
            'Failed to create API key'
          );
          throw new Error(errorMessage);
        }
        return msg.result as ApiKeyCreate;
      }),
      take(1)
    );
  }

  logout() {
    // Cleared here, not on the response, and not conditionally on its success.
    // The constructor's auto-relogin consults nothing but `credentials`, so
    // leaving them set re-authenticates this session on the next `opened` —
    // including when the caller logged out precisely because it refused the
    // session, and including when the logout response never arrives because the
    // socket dropped. Whether the server tore the session down is a separate
    // question from whether this client should offer the credential again.
    this.credentials = { username: '', password: '', key: '' };
    const sentDuring = ++this.authEpoch;

    const message = createJsonRpcMessage('auth.logout');

    this.connection.send(message);

    // createJsonRpcMessage always returns a message with an id
    const messageId = message.id ?? '';

    return this.connection.messages().pipe(
      withId(messageId),
      map(msg => {
        if (msg.error) {
          return false;
        }
        return msg.result as boolean;
      }),
      tap(success => {
        // A silent return, unlike the logins: this caller asked to end the
        // session and that happened, whoever else intervened afterwards.
        if (this.superseded(sentDuring)) return;
        this.sessionLifetime = TrueNasAuthenticator.DefaultSessionLifetime;
        this.authenticated$.next(!success);
      }),
      take(1)
    );
  }
}
