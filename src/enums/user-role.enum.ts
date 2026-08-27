export enum UserRole {
  FullAdmin = 'FULL_ADMIN',
}

/**
 * A role as middleware reports it.
 *
 * `UserRole` names only the role this client itself had a use for. Middleware
 * defines many more — `SHARING_ADMIN`, `READONLY_ADMIN` and so on — and this
 * client does not enumerate them, because it no longer makes any decision from
 * a role and would only be maintaining a second copy of someone else's list.
 *
 * Widened to `string` so a consumer can compare against the roles it cares
 * about without a cast, while `UserRole` still autocompletes. Consumers are
 * where role policy lives now, so the type they are handed has to admit the
 * roles they will actually test for.
 */
export type UserRoleName = UserRole | (string & {});
