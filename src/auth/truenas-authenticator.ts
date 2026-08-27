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
   * Claimed by each login when it sends and checked when its answer lands: a
   * difference means another login or a logout was issued in between, so this
   * answer is stale and must not write session state. Responses on one socket
   * are not ordered, which is why arrival is not enough to make an answer
   * current.
   *
   * `logout()` bumps it without claiming one. It has no answer to guard —
   * it settles its own state at the call — and bumping is what invalidates the
   * logins already on the wire that a logout is meant to override.
   */
  private authEpoch = 0;

  /**
   * Caller-issued logins still awaiting an answer, keyed by the epoch each
   * claimed. The value is whether its frame has been written to a socket yet.
   *
   * The auto-relogin below defers while any entry exists. It is this class
   * retrying a cached credential, not a request anyone made, so it must never
   * outrank an explicit login — and it would: `TrueNasConnection.send` holds a
   * frame through an outage rather than dropping it, so a login submitted while
   * the socket is down is still pending when `opened` fires, and a relogin
   * claiming the newer epoch has that login answered `LoginSuperseded` while the
   * client authenticates as the previously cached account.
   *
   * Keyed rather than counted, because a count cannot say *which* login a
   * removal belongs to: a login torn down by its caller would retire a slot
   * belonging to a different login that is still waiting, and the retry would
   * overtake it again. Identity also makes a double-subscribed login harmless.
   */
  private liveCallerLogins = new Map<number, boolean>();

  /** True only while the constructor's relogin is being constructed. */
  private reloginInProgress = false;

  constructor(
    private connection: TrueNasConnection,
    private readonly version?: ApiVersion,
  ) {
    this.connection.opened.subscribe(isOpen => {
      // A login that was waiting for a socket has been written to this one, so
      // from here it dies with it like any other. Without this it would keep its
      // slot through every later drop and block reconnection permanently.
      if (!isOpen) return;
      for (const epoch of this.liveCallerLogins.keys()) {
        this.liveCallerLogins.set(epoch, true);
      }
    });

    this.connection.opened
      .pipe(
        filter(
          isOpen =>
            !!(
              isOpen &&
              this.credentials?.username &&
              (this.credentials.password || this.credentials.key) &&
              // An explicit login already on the wire outranks this retry.
              this.liveCallerLogins.size === 0
            )
        ),
        switchMap(() => {
          // Bracketed synchronously: the login methods do their claiming in the
          // call itself, not on subscribe, so the flag is only ever set across
          // that call.
          this.reloginInProgress = true;
          let relogin;
          try {
            relogin = this.credentials.password
              ? this.loginWithUserPass(
                  this.credentials.username,
                  this.credentials.password
                )
              : this.loginWithApiKey({
                  username: this.credentials.username,
                  key: this.credentials.key,
                });
          } finally {
            // Stuck true, every later caller login is misclassified as internal
            // and never tracked, silently disabling the guard above.
            this.reloginInProgress = false;
          }

          // Decided once, when the socket opens. A retry that stands down for
          // an explicit login does not re-arm if that login then fails: the
          // caller is at a prompt and is the one retrying, so the client waits
          // for the next reconnect rather than logging in behind them.
          //
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
      // A login whose frame went out on the socket that just died can never be
      // answered, so it is retired here — otherwise one that is never
      // unsubscribed would block reconnection for good. One still waiting for a
      // socket keeps its slot: `send` will deliver it on the next one, and it is
      // exactly the login the retry must not overtake.
      for (const [epoch, flushed] of this.liveCallerLogins) {
        if (flushed) this.liveCallerLogins.delete(epoch);
      }
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

  /**
   * Throws when another login or a logout was issued after this one was sent,
   * so a stale answer cannot be reported to its caller as a successful login.
   */
  private assertNotSuperseded(sentDuring: number): void {
    if (this.authEpoch === sentDuring) return;
    throw new AuthError(
      AuthErrorCode.LoginSuperseded,
      'Login was superseded by a later logout or login and was discarded.'
    );
  }

  /** Claim the next epoch for a login, and record it if a caller asked for it. */
  private beginLogin(): { sentDuring: number; callerInitiated: boolean } {
    const callerInitiated = !this.reloginInProgress;
    const sentDuring = ++this.authEpoch;
    if (callerInitiated) {
      this.liveCallerLogins.set(sentDuring, this.connection.opened.value);
    }
    return { sentDuring, callerInitiated };
  }

  private endLogin(sentDuring: number, callerInitiated: boolean): void {
    if (callerInitiated) this.liveCallerLogins.delete(sentDuring);
    this.authenticating$.next(false);
  }

  loginWithUserPass(username: string, password: string) {
    const { sentDuring, callerInitiated } = this.beginLogin();
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
          // Whole record: a field-by-field update leaves the other mechanism's
          // credential behind, and the relogin prefers `password`, so an api-key
          // login after a password login would replay the old password under the
          // new username on every reconnect.
          this.credentials = { username, password, key: '' };
          this.sessionLifetime =
            res.user_info?.attributes?.preferences?.lifetime ??
            TrueNasAuthenticator.DefaultSessionLifetime;
          this.authenticated$.next(true);
        }
      }),
      finalize(() => {
        this.endLogin(sentDuring, callerInitiated);
      }),
      take(1)
    );
  }

  loginWithOtp(code: string) {
    const { sentDuring, callerInitiated } = this.beginLogin();
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
        this.endLogin(sentDuring, callerInitiated);
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
    const { sentDuring, callerInitiated } = this.beginLogin();
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
        this.endLogin(sentDuring, callerInitiated);
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
    const { sentDuring, callerInitiated } = this.beginLogin();
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
        this.credentials = { username, password: '', key };
        this.sessionLifetime =
          res.user_info?.attributes?.preferences?.lifetime ??
          TrueNasAuthenticator.DefaultSessionLifetime;
        this.authenticated$.next(true);
      }),
      finalize(() => {
        this.endLogin(sentDuring, callerInitiated);
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
    // All of it here, at the call, rather than when the answer comes back — and
    // unconditionally, whatever the server says.
    //
    // `credentials`: auto-relogin consults nothing else, so leaving them set
    // re-authenticates a session the caller just refused on the next `opened`.
    //
    // `authenticated$`: the answer used to set it, as `next(!success)`, which
    // could only ever be wrong. It *raised* the flag on a failed logout — so a
    // logout with no session behind it reported the client as authenticated —
    // and it landed late, after any login issued in the meantime had already
    // settled. Whether the server tore its session down is a separate question
    // from whether this client still holds one, and this flag answers the
    // second: the caller asked to be logged out, and now is, whatever the
    // appliance did with its own state.
    this.credentials = { username: '', password: '', key: '' };
    this.sessionLifetime = TrueNasAuthenticator.DefaultSessionLifetime;
    this.authEpoch += 1;
    this.authenticated$.next(false);

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
      take(1)
    );
  }
}
