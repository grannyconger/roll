// Runtime config that is safe to commit.
// The assessor Worker URL. The teacher hub can override it per session without a code change.
export const ASSESSOR_URL = "https://roll-with-the-market-assessor.rollwiththemarket.workers.dev";

let override = null;
export function setAssessorUrl(url) { override = url || null; }
export function assessorUrl() { return (override || ASSESSOR_URL).replace(/\/$/, ""); }
