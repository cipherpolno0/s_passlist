// Keep driver errors from echoing a malformed connection string into logs.
export function databaseConfig(value) {
  try {
    if (!value || value !== value.trim()) throw new Error();
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
        !url.username || !url.password || !url.pathname.slice(1) || url.hash ||
        ['postgres', 'service_role'].includes(decodeURIComponent(url.username).split('.')[0])) throw new Error();
    // TLS is controlled here, so URL parameters cannot disable verification.
    if (['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some(key => url.searchParams.has(key))) throw new Error();
    return {connectionString: value, ssl: {rejectUnauthorized: true}, max: 5,
      idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000};
  } catch {
    throw new Error('Database configuration is unavailable or invalid');
  }
}
