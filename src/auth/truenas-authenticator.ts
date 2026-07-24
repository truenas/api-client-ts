import {
  BehaviorSubject,
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
import { TrueNasAuthMechanism } from '@/enums/truenas-auth-mechanism.enum';
import { UserRole } from '@/enums/user-role.enum';
import { AuthError, AuthErrorCode } from '@/errors/auth.errors';
import { getApiErrorMessage } from '@/types/api-error.type';
import {
  ApiKeyCreateResult,
  AuthLoginParams,
  AuthResponse,
  AuthResponseType,
  isAuthSuccess,
} from '@/types/auth.type';
import { createJsonRpcMessage } from '@/utils/jsonrpc.utils';
import { randomUUID, withId } from '@/utils/utils';

/**
 * Response kinds that mean the login was refused.
 *
 * `DENIED` is v26+. Moving to the generated union widened AuthResponse to
 * admit it, and the old hand-written enum had no equivalent — so before this
 * it fell through as a non-failure and `loginWithApiKey` reported the session
 * authenticated for a login the server had denied.
 *
 * (`SCRAM_RESPONSE`, also v26+, is an intermediate handshake step rather than
 * a failure. This client never initiates SCRAM, so it cannot arrive.)
 */
const authFailureResponses = ['AUTH_ERR', 'DENIED'] as const satisfies readonly AuthResponseType[];

const throwOnAuthenticationFailure = (code: AuthErrorCode, message: string) =>
  switchMap((response: AuthResponse) => {
    if (
      (authFailureResponses as readonly string[]).includes(
        response.response_type
      )
    ) {
      return throwError(() => new AuthError(code, message));
    }

    return of(response);
  });

/**
 * Session lifetime the server reports, if it reported one.
 *
 * Every hop is optional-chained on purpose. `attributes` is declared required
 * by the generated types, but it is the opaque `{[k: string]: unknown}` dict
 * that `AuthUserInfoRefinements` flags as not described by the dump — a type,
 * not a runtime guarantee. A response without it must fall back to the
 * default lifetime, not throw and fail an otherwise successful login.
 */
const lifetimeOf = (response: AuthResponse): number | undefined =>
  isAuthSuccess(response)
    ? response.user_info?.attributes?.preferences?.lifetime
    : undefined;

/**
 * TrueNAS authenticator using the JSON-RPC 2.0 protocol.
 *
 * It handles authentication using the JSON-RPC 2.0 message format.
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

  constructor(private connection: TrueNasConnection) {
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
          if (this.credentials.password) {
            return this.loginWithUserPass(
              this.credentials.username,
              this.credentials.password
            );
          }
          return this.loginWithApiKey({
            username: this.credentials.username,
            key: this.credentials.key,
          });
        })
      )
      .subscribe();
    connection.closed.subscribe(() => {
      this.sessionLifetime = TrueNasAuthenticator.DefaultSessionLifetime;
      this.authenticated$.next(false);
    });
  }

  loginWithUserPass(username: string, password: string) {
    // Versioned API uses auth.login_ex with a single object parameter
    const message = createJsonRpcMessage('auth.login_ex', [
      {
        mechanism: TrueNasAuthMechanism.Password,
        username,
        password,
      },
    ] satisfies AuthLoginParams);

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
        if (isAuthSuccess(res)) {
          if (
            res.user_info?.privilege.roles.$set.includes(UserRole.FullAdmin)
          ) {
            this.credentials.username = username;
            this.credentials.password = password;
            this.sessionLifetime =
              lifetimeOf(res) ?? TrueNasAuthenticator.DefaultSessionLifetime;
            this.authenticated$.next(true);
          } else {
            this.logout();
            this.authenticated$.next(false);
            throw new AuthError(
              AuthErrorCode.FullAdminRequired,
              'User account must have full admin privileges'
            );
          }
        }
      }),
      finalize(() => {
        this.authenticating$.next(false);
      }),
      take(1)
    );
  }

  loginWithOtp(code: string) {
    // Versioned API uses auth.login_ex with a single object parameter
    const message = createJsonRpcMessage('auth.login_ex', [
      {
        mechanism: TrueNasAuthMechanism.Otp,
        otp_token: code,
      },
    ] satisfies AuthLoginParams);

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
        if (isAuthSuccess(res)) {
          this.sessionLifetime =
            lifetimeOf(res) ?? TrueNasAuthenticator.DefaultSessionLifetime;
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

  loginWithApiKey(credentials: { username: string; key: string }) {
    const { username, key } = credentials;
    // Versioned API uses auth.login_ex with a single object parameter
    const message = createJsonRpcMessage('auth.login_ex', [
      {
        mechanism: TrueNasAuthMechanism.ApiKey,
        username,
        api_key: key,
      },
    ] satisfies AuthLoginParams);

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
        this.credentials.username = username;
        this.credentials.key = key;
        this.sessionLifetime =
          lifetimeOf(res) ?? TrueNasAuthenticator.DefaultSessionLifetime;
        // NOTE: behavior preserved from before the typed migration — this
        // marks the session authenticated for ANY non-AUTH_ERR response,
        // including EXPIRED and REDIRECT. The typed union made that visible
        // (`res.user_info` no longer type-checks unnarrowed); gating this on
        // `isAuthSuccess(res)` is a behavior change, so it is left alone here.
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
        return msg.result as ApiKeyCreateResult;
      }),
      take(1)
    );
  }

  logout() {
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
        this.sessionLifetime = TrueNasAuthenticator.DefaultSessionLifetime;
        this.authenticated$.next(!success);
      }),
      take(1)
    );
  }
}
