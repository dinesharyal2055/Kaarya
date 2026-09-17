/**
 * Display-only negotiation mode inference + labels.
 * The mode is inferred from the job's budget fields using the same logic used
 * across the app (post-job / edit-job / make-offer):
 *   budgetMin < budgetMax  -> Negotiable
 *   budgetMin only         -> Open Offers
 *   budgetMin === budgetMax -> Fixed Price
 * IMPORTANT: display-only — the underlying budget/negotiation data is never
 * changed here, and job.negotiationMode is not read or relied upon.
 */
import type { Job } from '@/types';

export type NegotiationMode = 'negotiable' | 'open_offers' | 'fixed';

export function inferNegotiationMode(job: Pick<Job, 'budgetMin' | 'budgetMax'>): NegotiationMode {
  const min = Number(job.budgetMin ?? NaN);
  const max = Number(job.budgetMax ?? NaN);
  const hasMin = !isNaN(min) && min > 0;
  const hasMax = !isNaN(max) && max > 0;
  if (hasMin && hasMax && max > min) return 'negotiable';
  if (hasMin && hasMax && max === min) return 'fixed';
  if (hasMin) return 'open_offers';
  return 'negotiable';
}

export function negotiationLabel(t: (key: string) => string, mode: NegotiationMode): string {
  switch (mode) {
    case 'fixed':
      return t('postJob.fixedPrice');
    case 'open_offers':
      return t('postJob.openOffers');
    case 'negotiable':
    default:
      return t('postJob.negotiable');
  }
}