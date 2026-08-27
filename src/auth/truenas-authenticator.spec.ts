import { BehaviorSubject, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrueNasConnection } from '@/connection/truenas-connection';
import type { ApiVersion } from '@/types/api-version.type';
import { UserRole, UserRoleName } from '@/enums/user-role.enum';
import type { UserRoleName as PublicUserRoleName } from '@/index';
import { AuthError, AuthErrorCode } from '@/errors/auth.errors';
import { TrueNasAuthMechanism } from '@/enums/truenas-auth-mechanism.enum';
import { AuthResponse, AuthResponseType } from '@/types/auth.type';
import { TrueNasMessage } from '@/types/truenas-message.type';
import { TrueNasAuthenticator } from './truenas-authenticator';

function successResponse(
  roles: UserRoleName[],
  lifetime = 600
): AuthResponse {
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

  /**
   * Echo the id of a specific earlier request. `respondWith` always answers the
   * most recent send, which cannot express a response arriving out of order —
   * the shape of the logout-during-login race.
   */
  function respondToCall(index: number, result: unknown): void {
    const sent = sendSpy.mock.calls[index]?.[0] as TrueNasMessage;
    messages$.next({ id: sent.id, result } as unknown as TrueNasMessage);
  }

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

  it('password login authenticates a non-admin and reports its roles', () =>
    new Promise<void>((resolve, reject) => {
      authenticator.loginWithUserPass('user', 'pw').subscribe({
        next: res => {
          try {
            expect(authenticator.authenticated$.value).toBe(true);
            // The roles the consumer needs in order to apply its own policy.
            // Typed through the barrel rather than the enum module: the public
            // re-export is the thing consumers import, so that is what to pin.
            const roles: PublicUserRoleName[] =
              res.user_info?.privilege.roles.$set ?? [];
            expect(roles).toEqual(['SHARING_ADMIN']);
            // Stored only inside the admin branch before, so a non-admin got no
            // automatic reconnect. It reconnects like any other session now.
            expect(authenticator.credentials.username).toBe('user');
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        error: reject,
      });

      respondWith(successResponse(['SHARING_ADMIN']));
    }));

  /**
   * A compile-time assertion as much as a runtime one. `.includes('SHARING_ADMIN')`
   * does not typecheck while `$set` is `UserRole[]`, since the enum declares only
   * `FullAdmin` — which is the cast consumers were forced into when this client
   * handed them roles as their authorization hook.
   */
  it('hands back a role list a consumer can test without a cast', () => {
    const res = successResponse(['SHARING_ADMIN']);
    expect(res.user_info?.privilege.roles.$set.includes('SHARING_ADMIN')).toBe(
      true
    );
  });

  it('password login authenticates an account with no roles at all', () =>
    new Promise<void>((resolve, reject) => {
      authenticator.loginWithUserPass('user', 'pw').subscribe({
        next: () => {
          try {
            expect(authenticator.authenticated$.value).toBe(true);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        error: reject,
      });

      respondWith(successResponse([]));
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

  /**
   * The case this guards is a consumer refusing a login it does not want —
   * webui logging out an account without `webui_access`. Auto-relogin consults
   * only `credentials`, so retaining them would re-authenticate the refused
   * session on the next reconnect and re-arm its events and jobs. Storing them
   * for every successful login is what made this reachable; before that they
   * were only ever set for a full admin.
   */
  it('does not re-login after logout, even on reconnect', () => {
    authenticator.loginWithUserPass('user', 'pw').subscribe();
    respondWith(successResponse(['SHARING_ADMIN']));
    expect(authenticator.credentials.username).toBe('user');

    authenticator.logout().subscribe();
    expect(authenticator.credentials).toEqual({
      username: '',
      password: '',
      key: '',
    });

    sendSpy.mockClear();
    opened$.next(true);

    expect(sendSpy).not.toHaveBeenCalled();
  });

  /**
   * The gap a plain `logout()` clear leaves open. Clearing `credentials` is
   * undone by any login still in flight, because its `tap` writes them back on
   * arrival — so a consumer that refuses a session during a reconnect has the
   * refusal quietly reversed by the response to a request it never made.
   *
   * The earlier logout tests cannot see this: they answer the login before
   * logging out, which is the ordering where no race exists.
   */
  it('ignores a password login response that lands after logout', () => {
    let code: AuthErrorCode | undefined;
    authenticator
      .loginWithUserPass('user', 'pw')
      .subscribe({ error: (err: AuthError) => (code = err.code) });
    authenticator.logout().subscribe();

    // Only now does the login answer arrive.
    respondToCall(0, successResponse(['SHARING_ADMIN']));

    expect(code).toBe(AuthErrorCode.LoginSuperseded);
    expect(authenticator.credentials.username).toBe('');
    expect(authenticator.authenticated$.value).toBe(false);

    sendSpy.mockClear();
    opened$.next(true);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('ignores an api-key login response that lands after logout', () => {
    let code: AuthErrorCode | undefined;
    authenticator
      .loginWithApiKey({ username: 'admin', key: 'k' })
      .subscribe({ error: (err: AuthError) => (code = err.code) });
    authenticator.logout().subscribe();

    respondToCall(0, successResponse([UserRole.FullAdmin]));

    expect(code).toBe(AuthErrorCode.LoginSuperseded);
    expect(authenticator.credentials.username).toBe('');
    expect(authenticator.authenticated$.value).toBe(false);

    sendSpy.mockClear();
    opened$.next(true);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  /**
   * A token session is never auto-relogged in, so there are no credentials to
   * restore — but the response would still flip `authenticated$` true and
   * reopen the API gate on a session the caller refused.
   */
  it('ignores a token login response that lands after logout', () => {
    authenticator.loginWithToken('tok-1').subscribe({ error: () => {} });
    authenticator.logout().subscribe();

    respondToCall(0, successResponse([UserRole.FullAdmin]));

    expect(authenticator.authenticated$.value).toBe(false);
  });

  it('ignores an OTP login response that lands after logout', () => {
    authenticator.loginWithOtp('123456').subscribe({ error: () => {} });
    authenticator.logout().subscribe();

    respondToCall(0, successResponse([UserRole.FullAdmin]));

    expect(authenticator.authenticated$.value).toBe(false);
  });

  it('clears credentials even when the logout response never arrives', () => {
    authenticator.loginWithApiKey({ username: 'admin', key: 'k' }).subscribe();
    respondWith(successResponse([UserRole.FullAdmin]));

    // Subscribe but never respond: the socket dropped mid-logout.
    authenticator.logout().subscribe();

    sendSpy.mockClear();
    opened$.next(true);

    expect(sendSpy).not.toHaveBeenCalled();
  });

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

  it('a superseded login does not report success to its caller', () => {
    const seen: string[] = [];
    authenticator.loginWithUserPass('u', 'p').subscribe({
      next: () => seen.push('next'),
      error: (err: AuthError) => seen.push(`error:${err.code}`),
    });
    authenticator.logout().subscribe();

    respondToCall(0, successResponse([UserRole.FullAdmin]));

    expect(seen).toEqual([`error:${AuthErrorCode.LoginSuperseded}`]);
    expect(authenticator.authenticated$.value).toBe(false);
  });

  it('auto-relogin survives a superseded relogin', () => {
    authenticator.loginWithUserPass('u', 'p').subscribe();
    respondToCall(0, successResponse([UserRole.FullAdmin]));

    opened$.next(true);                       // auto-relogin, send 1
    authenticator.logout().subscribe();       // supersedes it, send 2
    respondToCall(1, successResponse([UserRole.FullAdmin]));

    authenticator.loginWithUserPass('u', 'p').subscribe();  // send 3
    respondToCall(3, successResponse([UserRole.FullAdmin]));

    sendSpy.mockClear();
    opened$.next(true);
    expect(sendSpy).toHaveBeenCalled();      // auto-relogin still alive
  });

  it('a late logout answer does not undo a login sent after it', () => {
    authenticator.logout().subscribe();                       // send 0
    authenticator.loginWithUserPass('u', 'p').subscribe();    // send 1

    respondToCall(1, successResponse([UserRole.FullAdmin]));  // login answers
    expect(authenticator.authenticated$.value).toBe(true);

    respondToCall(0, true);                                   // logout answers late

    expect(authenticator.authenticated$.value).toBe(true);
    expect(authenticator.credentials.username).toBe('u');
  });

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

  it('token login authenticates a non-admin, as password login does', () =>
    new Promise<void>((resolve, reject) => {
      authenticator.loginWithToken('tok-1').subscribe({
        next: res => {
          try {
            expect(authenticator.authenticated$.value).toBe(true);
            expect(res.user_info?.privilege.roles.$set).toEqual([]);
            resolve();
          } catch (e) { reject(e as Error); }
        },
        error: (err: AuthError) => reject(err),
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
