/**
 * Jobs service — wraps the jobs API with typed methods
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jobsApi } from '@/lib/api';
import type { Job } from '@/types';

const BASE_URL = 'http://192.168.1.79:5000/api';

export interface ImagePickerResult {
  uri: string;
  base64?: string;
  mimeType?: string;
  fileName?: string;
}

export async function uploadJobImage(image: ImagePickerResult): Promise<string> {
  const token = await AsyncStorage.getItem('kaarya_token');
  if (!token) throw new Error('Not authenticated');

  if (!image.base64) throw new Error('Image must be provided as base64');

  const mimeType = image.mimeType || 'image/jpeg';
  const filename = image.fileName || 'image.jpg';
  const body = {
    image: `data:${mimeType};base64,${image.base64}`,
    filename,
    mime: mimeType,
  };

  const res = await fetch(`${BASE_URL}/jobs/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url as string;
}

export interface JobListParams {
  category?: string;
  area?: string;
  status?: string;
  budgetMin?: number;
  budgetMax?: number;
  sortBy?: 'newest' | 'oldest' | 'price_low' | 'price_high';
  page?: number;
}

export async function fetchJobs(params?: JobListParams): Promise<{ jobs: Job[]; total: number }> {
  return jobsApi.list(params);
}

export async function fetchJob(id: string): Promise<Job> {
  return jobsApi.get(id);
}

export async function createJob(data: {
  title: string;
  description: string;
  category: string;
  location: string;
  budgetMin?: number;
  budgetMax?: number;
  negotiationMode?: string;
  photoUrls?: string[];
}): Promise<Job> {
  return jobsApi.create({
    title: data.title,
    description: data.description,
    category: data.category,
    location: data.location,
    budgetMin: data.budgetMin,
    budgetMax: data.budgetMax,
    negotiationMode: data.negotiationMode as any,
    photoUrls: data.photoUrls,
  } as any);
}
