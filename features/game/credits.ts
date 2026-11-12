// Match-scoped ability economy; Supabase enforces the same milestones.
export const MATCH_STARTING_CREDITS = 1;
export const MATCH_CREDIT_THRESHOLDS = [4, 8, 12] as const;

export function getMatchCreditMilestones(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return MATCH_CREDIT_THRESHOLDS.filter((threshold) => score >= threshold).length;
}
