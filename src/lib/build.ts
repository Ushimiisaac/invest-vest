/** Visible build stamp so a user (or support) can tell which deployment they are on. */
export const BUILD_ID =
  process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "ss-2026.01";

export function buildLabel() {
  return `${BUILD_ID}`;
}
