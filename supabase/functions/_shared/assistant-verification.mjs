// A stored credential is not evidence of a successful provider response.
// Reconfiguration invalidates earlier evidence, including for the same model.
export function assistantVerification(account, attempt) {
  if (!account?.enabled || !attempt || attempt.provider !== account.provider || attempt.model !== account.model) return null;
  const configured = Date.parse(account.updated_at), attempted = Date.parse(attempt.created_at);
  if (!Number.isFinite(configured) || !Number.isFinite(attempted) || attempted < configured) return null;
  return { verifiedAt: attempt.state === 'completed' ? attempt.created_at : null, lastAttemptState: attempt.state };
}
