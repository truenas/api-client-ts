import { BehaviorSubject, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrueNasConnection } from '@/connection/truenas-connection';
import type { ApiVersion } from '@/types/api-version.type';
import { UserRole } from '@/enums/user-role.enum';
import { AuthError, AuthErrorCode } from '@/errors/auth.errors';
import { TrueNasAuthMechanism } from '@/enums/truenas-auth-mechanism.enum';
import { AuthResponse, AuthResponseType } from '@/types/auth.type';
import { TrueNasMessage } from '@/types/truenas-message.type';
import { TrueNasAuthenticator } from './truenas-authenticator';

function successResponse(roles: UserRole[], lifetime = 600): AuthResponse {
  return {
    response_type: AuthResponseType.Success,
    user_info: {
      privilege: { roles: { $set: roles } },
      attributes: { preferences: { lifetime } },
    },
  } as unknown as AuthResponse;
}

const authErrResponse = {
  response_type: AuthResponseType.AuthErr,
} as AuthResponse;

describe('TrueNasAuthenticator', () => {
  let authenticator: TrueNasAuthenticator;
  let messages$: Subject<TrueNasMessage>;
  let opened$: BehaviorSubject<boolean>;
  let closed$: Subject<void>;
  let sendSpy: ReturnType<typeof vi.fn>;
  let makeAuthenticator: (version?: ApiVersion) => TrueNasAuthenticator;

  const v26: ApiVersion = {
    version: 'v26.0.0', year: 26, minor: 0, patch: 0,
    websocketPath: '/api/v26.0.0',
  };
  const v25: ApiVersion = {
    version: 'v25.10.0', year: 25, minor: 10, patch: 0,
    websocketPath: '/api/v25.10.0',
  };

  beforeEach(() => {
    messages$ = new Subject<TrueNasMessage>();
    opened$ = new BehaviorSubject(false);
    closed$ = new Subject<void>();
    sendSpy = vi.fn();

    const connection = {
      opened: opened$,
      closed: closed$,
      send: sendSpy,
      messages: () => messages$,
    } as unknown as TrueNasConnection;

    makeAuthenticator = (version?: ApiVersion) =>
      new TrueNasAuthenticator(connection, version);
    authenticator = makeAuthenticator(v26);
  });

  /** Echo the id of the most recently sent message back as a response `result`. */
  function respondWith(result: unknown): void {
    const sent = sendSpy.mock.calls.at(-1)?.[0] as TrueNasMessage;
    messages$.next({ id: sent.id, result } as unknown as TrueNasMessage);
  }

  it('password login succeeds for a full admin and sets authenticated$', () =>
    new Promise<void>((resolve, reject) => {
      authenticator.loginWithUserPass('admin', 'pw').subscribe({
        next: () => {
          try {
            expect(authenticator.authenticated$.value).toBe(true);
            const sent = sendSpy.mock.calls[0][0] as TrueNasMessage;
            expect(sent.method).toBe('auth.login_ex');
            expect(sent.params).toEqual([
              {
                mechanism: TrueNasAuthMechanism.Password,
                username: 'admin',
                password: 'pw',
                login_options: { reconnect_token: true },
              },
            ]);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        error: reject,
      });

      respondWith(successResponse([UserRole.FullAdmin]));
    }));

  it('password auth failure throws AuthError(PasswordAuthFailed)', () =>
    new Promise<void>((resolve, reject) => {
      authenticator.loginWithUserPass('admin', 'bad').subscribe({
        next: () => reject(new Error('should have errored')),
        error: (err: unknown) => {
          try {
            expect(err).toBeInstanceOf(AuthError);
            expect((err as AuthError).code).toBe(
              AuthErrorCode.PasswordAuthFailed
            );
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      });

      respondWith(authErrResponse);
    }));

  it('non-admin login throws AuthError(FullAdminRequired)', () =>
    new Promise<void>((resolve, reject) => {
      authenticator.loginWithUserPass('user', 'pw').subscribe({
        next: () => reject(new Error('should have errored')),
        error: (err: unknown) => {
          try {
            expect(err).toBeInstanceOf(AuthError);
            expect((err as AuthError).code).toBe(
              AuthErrorCode.FullAdminRequired
            );
            expect(authenticator.authenticated$.value).toBe(false);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      });

      respondWith(successResponse([])); // Success but no FullAdmin role
    }));

  it('OTP auth failure throws AuthError(OtpAuthFailed)', () =>
    new Promise<void>((resolve, reject) => {
      authenticator.loginWithOtp('000000').subscribe({
        next: () => reject(new Error('should have errored')),
        error: (err: unknown) => {
          try {
            expect(err).toBeInstanceOf(AuthError);
            expect((err as AuthError).code).toBe(AuthErrorCode.OtpAuthFailed);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      });

      respondWith(authErrResponse);
    }));

  it('API-key auth failure throws AuthError(ApiKeyAuthFailed)', () =>
    new Promise<void>((resolve, reject) => {
      authenticator
        .loginWithApiKey({ username: 'admin', key: 'bad-key' })
        .subscribe({
          next: () => reject(new Error('should have errored')),
          error: (err: unknown) => {
            try {
              expect(err).toBeInstanceOf(AuthError);
              expect((err as AuthError).code).toBe(
                AuthErrorCode.ApiKeyAuthFailed
              );
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        });

      respondWith(authErrResponse);
    }));

  it('logout clears authentication', () =>
    new Promise<void>((resolve, reject) => {
      authenticator.authenticated$.next(true);

      authenticator.logout().subscribe({
        next: () => {
          try {
            expect(authenticator.authenticated$.value).toBe(false);
            const sent = sendSpy.mock.calls.at(-1)?.[0] as TrueNasMessage;
            expect(sent.method).toBe('auth.logout');
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        error: reject,
      });

      respondWith(true);
    }));

  it('re-logs in on reconnect using cached credentials (auto-login)', () =>
    new Promise<void>((resolve, reject) => {
      // First, a successful login to cache credentials.
      authenticator.loginWithUserPass('admin', 'pw').subscribe();
      respondWith(successResponse([UserRole.FullAdmin]));

      // Now simulate the socket re-opening; the authenticator should re-login.
      sendSpy.mockClear();
      opened$.next(true);

      try {
        expect(sendSpy).toHaveBeenCalled();
        const sent = sendSpy.mock.calls[0][0] as TrueNasMessage;
        expect(sent.method).toBe('auth.login_ex');
        expect(sent.params).toEqual([
          {
            mechanism: TrueNasAuthMechanism.Password,
            username: 'admin',
            password: 'pw',
            login_options: { reconnect_token: true },
          },
        ]);
        resolve();
      } catch (err) {
        reject(err);
      }
    }));

  it('OTP login succeeds and sets authenticated$ (no full-admin gate)', () =>
    new Promise<void>((resolve, reject) => {
      authenticator.loginWithOtp('123456').subscribe({
        next: () => {
          try {
            expect(authenticator.authenticated$.value).toBe(true);
            const sent = sendSpy.mock.calls[0][0] as TrueNasMessage;
            expect(sent.method).toBe('auth.login_ex');
            expect(sent.params).toEqual([
              { mechanism: TrueNasAuthMechanism.Otp, otp_token: '123456' },
            ]);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        error: reject,
      });

      // OTP success does not require the FullAdmin role.
      respondWith(successResponse([]));
    }));

  it('newApiKey creates a tnc-prefixed API key for the user', () =>
    new Promise<void>((resolve, reject) => {
      const created = { id: 1, name: 'tnc-generated', key: 'secret-key' };

      authenticator.newApiKey('admin').subscribe({
        next: result => {
          try {
            expect(result).toEqual(created);
            const sent = sendSpy.mock.calls[0][0] as TrueNasMessage;
            expect(sent.method).toBe('api_key.create');
            expect(sent.params).toEqual([
              { name: expect.stringMatching(/^tnc-/), username: 'admin' },
            ]);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        error: reject,
      });

      respondWith(created);
    }));

  it('re-logs in on reconnect using a cached API key', () =>
    new Promise<void>((resolve, reject) => {
      // First, a successful API-key login to cache the key.
      authenticator.loginWithApiKey({ username: 'admin', key: 'k1' }).subscribe();
      respondWith(successResponse([]));

      // Simulate the socket re-opening — should re-login via the API-key branch.
      sendSpy.mockClear();
      opened$.next(true);

      try {
        expect(sendSpy).toHaveBeenCalled();
        const sent = sendSpy.mock.calls[0][0] as TrueNasMessage;
        expect(sent.params).toEqual([
          { mechanism: TrueNasAuthMechanism.ApiKey, username: 'admin', api_key: 'k1' },
        ]);
        resolve();
      } catch (err) {
        reject(err);
      }
    }));

  it('logout that fails leaves authenticated$ true', () =>
    new Promise<void>((resolve, reject) => {
      // A failed logout is treated as "not logged out": logout maps an error
      // response to `success = false`, then runs `authenticated$.next(!success)`.
      authenticator.authenticated$.next(false);

      authenticator.logout().subscribe({
        next: () => {
          try {
            expect(authenticator.authenticated$.value).toBe(true);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        error: reject,
      });

      const sent = sendSpy.mock.calls.at(-1)?.[0] as TrueNasMessage;
      messages$.next({
        id: sent.id,
        error: { code: -1, message: 'logout failed' },
      } as unknown as TrueNasMessage);
    }));

  it('resets authentication when the connection closes', () => {
    authenticator.authenticated$.next(true);

    closed$.next();

    expect(authenticator.authenticated$.value).toBe(false);
  });
  /**
   * v25.10's `AuthCommonOptions` declares only `user_info` and is
   * `additionalProperties: false`, so asking it for a reconnect token is a
   * validation error rather than an ignored field — it would fail login on the
   * oldest version this client supports.
   */
  it('omits login_options against v25.10, which cannot accept it', () =>
    new Promise<void>((resolve, reject) => {
      const legacy = makeAuthenticator(v25);
      legacy.loginWithUserPass('admin', 'pw').subscribe({
        next: () => {
          try {
            const sent = sendSpy.mock.calls.at(-1)?.[0] as TrueNasMessage;
            expect(sent.params).toEqual([
              {
                mechanism: TrueNasAuthMechanism.Password,
                username: 'admin',
                password: 'pw',
              },
            ]);
            resolve();
          } catch (e) { reject(e as Error); }
        },
        error: reject,
      });
      respondWith(successResponse([UserRole.FullAdmin]));
    }));

  it('omits login_options when no version is known', () =>
    new Promise<void>((resolve, reject) => {
      // The authenticator is constructible without a version. Guessing that a
      // server supports the newer option is the guess that breaks login.
      const unknown = makeAuthenticator(undefined);
      unknown.loginWithUserPass('admin', 'pw').subscribe({
        next: () => {
          try {
            const sent = sendSpy.mock.calls.at(-1)?.[0] as TrueNasMessage;
            expect((sent.params as unknown[])[0]).not.toHaveProperty(
              'login_options'
            );
            resolve();
          } catch (e) { reject(e as Error); }
        },
        error: reject,
      });
      respondWith(successResponse([UserRole.FullAdmin]));
    }));

  it('token login sends TOKEN_PLAIN and asks for the next token', () =>
    new Promise<void>((resolve, reject) => {
      authenticator.loginWithToken('tok-1').subscribe({
        next: () => {
          try {
            const sent = sendSpy.mock.calls.at(-1)?.[0] as TrueNasMessage;
            expect(sent.method).toBe('auth.login_ex');
            expect(sent.params).toEqual([
              {
                mechanism: TrueNasAuthMechanism.Token,
                token: 'tok-1',
                login_options: { reconnect_token: true },
              },
            ]);
            expect(authenticator.authenticated$.value).toBe(true);
            resolve();
          } catch (e) { reject(e as Error); }
        },
        error: reject,
      });
      respondWith(successResponse([UserRole.FullAdmin]));
    }));

  it('surfaces the reconnect token the server returned', () =>
    new Promise<void>((resolve, reject) => {
      // The point of the whole option: a caller needs the value to open a
      // second authenticated connection later.
      authenticator.loginWithToken('tok-1').subscribe({
        next: (res) => {
          try {
            expect(res.reconnect_token).toBe('tok-2');
            resolve();
          } catch (e) { reject(e as Error); }
        },
        error: reject,
      });
      respondWith({ ...successResponse([UserRole.FullAdmin]), reconnect_token: 'tok-2' });
    }));

  it('token auth failure throws AuthError(TokenAuthFailed)', () =>
    new Promise<void>((resolve, reject) => {
      authenticator.loginWithToken('stale').subscribe({
        next: () => reject(new Error('expected a failure')),
        error: (err: AuthError) => {
          try {
            expect(err).toBeInstanceOf(AuthError);
            expect(err.code).toBe(AuthErrorCode.TokenAuthFailed);
            resolve();
          } catch (e) { reject(e as Error); }
        },
      });
      respondWith(authErrResponse);
    }));

  it('token login refuses a non-admin, as password login does', () =>
    new Promise<void>((resolve, reject) => {
      // Middleware puts no role gate on TOKEN_PLAIN and `auth.generate_token`
      // needs no role, so the client is the only place this is checked.
      authenticator.loginWithToken('tok-1').subscribe({
        next: () => reject(new Error('expected a failure')),
        error: (err: AuthError) => {
          try {
            expect(err.code).toBe(AuthErrorCode.FullAdminRequired);
            expect(authenticator.authenticated$.value).toBe(false);
            resolve();
          } catch (e) { reject(e as Error); }
        },
      });
      respondWith(successResponse([]));
    }));

  /**
   * `AUTH_ERR` is not the only way token login fails. Middleware answers
   * `EXPIRED` when the account was locked or expired between minting and
   * spending the token, and `DENIED` on a permission refusal. Password login
   * lets non-`AUTH_ERR` answers through because it must return `OTP_REQUIRED`;
   * token login has no such case, so anything but success is a failure.
   */
  it.each(['DENIED', 'EXPIRED', 'REDIRECT'])(
    'token login treats %s as a failure, not a login',
    (responseType) =>
      new Promise<void>((resolve, reject) => {
        authenticator.loginWithToken('tok-1').subscribe({
          next: () => reject(new Error(`${responseType} reached next()`)),
          error: (err: AuthError) => {
            try {
              expect(err.code).toBe(AuthErrorCode.TokenAuthFailed);
              expect(authenticator.authenticated$.value).toBe(false);
              resolve();
            } catch (e) { reject(e as Error); }
          },
        });
        respondWith({ response_type: responseType });
      })
  );

});
