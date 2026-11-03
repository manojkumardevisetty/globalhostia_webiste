// next/headers outside a request (scripts/snapshot.mjs): callers fall back to their defaults
export async function headers() { throw new Error('no request scope'); }
export async function cookies() { throw new Error('no request scope'); }
