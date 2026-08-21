export function validateDatabaseVersion(
  version: number,
  migrationCount: number,
): number {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error(`Invalid database version: ${version}`);
  }
  if (version > migrationCount) {
    throw new Error(
      `Database version ${version} is newer than this application supports (${migrationCount})`,
    );
  }
  return version;
}
