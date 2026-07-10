import { BehaviorSubject, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrueNasConnection } from '@/connection/truenas-connection';
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

    authenticator = new TrueNasAuthenticator(connection);
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
          },
        ]);
        resolve();
      } catch (err) {
        reject(err);
      }
    }));

  it('resets authentication when the connection closes', () => {
    authenticator.authenticated$.next(true);

    closed$.next();

    expect(authenticator.authenticated$.value).toBe(false);
  });
});
