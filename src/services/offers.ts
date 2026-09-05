/**
 * Offers service — wraps the offers API with typed methods
 */
import { offersApi } from '@/lib/api';
import type { Offer } from '@/types';

export async function fetchOffersForJob(jobId: string): Promise<Offer[]> {
  const result = await offersApi.listForJob(jobId);
  return result.offers;
}

export async function submitOffer(data: {
  jobId: string;
  price: number;
  message?: string;
}): Promise<Offer> {
  return offersApi.submit(data);
}

export async function acceptOffer(offerId: string): Promise<Offer> {
  return offersApi.accept(offerId);
}

export async function rejectOffer(offerId: string): Promise<void> {
  await offersApi.reject(offerId);
}

export async function withdrawOffer(offerId: string): Promise<void> {
  await offersApi.withdraw(offerId);
}

export async function counterOffer(
  offerId: string,
  data: { price: number; message?: string }
): Promise<Offer> {
  return offersApi.counter(offerId, data);
}

export async function fetchOffer(id: string): Promise<Offer> {
  return offersApi.get(id);
}
