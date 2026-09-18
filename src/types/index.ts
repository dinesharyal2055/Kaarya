/**
 * Kaarya shared TypeScript types
 * These mirror the backend API shapes
 */

export type UserRole = 'seeker' | 'provider';

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export type JobStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'countered';

export type NegotiationMode = 'fixed' | 'open_offers' | 'negotiable';

export interface User {
  id: string;
  phone: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  bio?: string;
  verificationStatus: VerificationStatus;
  rating?: number;
  reviewCount?: number;
  completionRate?: number; // 0-100
  createdAt: string;
}

export interface Job {
  id: string;
  seekerId: string;
  seekerName: string;
  seekerAvatar?: string;
  title: string;
  description: string;
  category: string;
  categoryName?: string;
  area: string;
  address?: string; // masked until offer accepted
  // Precise GPS coords — only populated for assigned provider viewing assigned job
  seekerLat?: number | null;
  seekerLng?: number | null;
  budgetMin?: number;
  budgetMax?: number;
  negotiationMode: NegotiationMode;
  status: JobStatus;
  photoUrls?: string[];
  offerCount?: number;
  // Requested job time — ISO 8601 with Nepal offset (+05:45)
  scheduledDate?: string | null;
  createdAt: string;
  updatedAt?: string;
  // Populated for ongoing/assigned jobs
  userRole?: 'seeker' | 'provider';
  offerId?: string;
  agreedAmount?: number;
  // Saved job fields
  isSaved?: boolean;
  savedAt?: string;
  acceptedOffer?: {
    id: string;
    price: number;
    message?: string;
    status: OfferStatus;
    providerName: string;
    providerAvatar?: string;
    providerId: string;
  };
}

export interface Review {
  id: string;
  jobId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAvatar?: string;
  revieweeId: string;
  revieweeName: string;
  revieweeAvatar?: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface Offer {
  id: string;
  jobId: string;
  providerId: string;
  providerName: string;
  providerAvatar?: string;
  providerRating?: number;
  providerReviewCount?: number;
  providerVerified?: boolean;
  providerCompletionRate?: number;
  price: number;
  message?: string;
  estimatedArrival?: string;
  status: OfferStatus;
  negotiations?: Negotiation[];
  createdAt: string;
  job?: {
    id: string;
    title: string;
    category: string;
    area: string;
    budgetMin?: number;
    budgetMax?: number;
    status: JobStatus;
    seekerId?: string;
    seekerName?: string;
  };
}

export interface Negotiation {
  id: string;
  offerId: string;
  fromUserId: string;
  fromUserName: string;
  price: number;
  message?: string;
  createdAt: string;
}

export interface PortfolioReview {
  id: string;
  jobId: string;
  jobTitle: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAvatar?: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface PortfolioTask {
  id: string;
  title: string;
  status: JobStatus;
  createdAt: string;
}

export interface PublicPortfolio {
  user: {
    id: string;
    name: string;
    role: UserRole;
    avatarUrl?: string;
    bio?: string;
    verified: boolean;
    rating?: number;
    reviewCount: number;
    jobsCompleted: number;
    tasksPosted: number;
  };
  reviews: PortfolioReview[];
  tasks: PortfolioTask[];
}

export interface Conversation {
  id: string;
  jobId: string;
  jobTitle: string;
  participants: ConversationParticipant[];
  lastMessage?: Message;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** Participant info returned by the /conversations API */
export interface ConversationParticipant {
  id: string | number;
  name: string;
  avatar?: string;
  role?: UserRole;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  readAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type:
    | 'new_offer'
    | 'offer_accepted'
    | 'offer_rejected'
    | 'offer_countered'
    | 'new_message'
    | 'job_started'
    | 'job_completed'
    | 'review_received'
    | 'verification_approved'
    | 'verification_rejected';
  title: string;
  body: string;
  data?: Record<string, string>;
  read: boolean;
  createdAt: string;
}

export interface VerificationRequest {
  id: string;
  userId: string;
  level: number;
  documentType: string;
  documents: string[];
  notes?: string;
  status: 'pending' | 'approved' | 'rejected' | 'more_info_needed';
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationStatusResponse {
  request: VerificationRequest | null;
  status: 'unverified' | 'pending' | 'approved' | 'rejected';
}

export interface ApiError {
  message: string;
  code?: string;
  field?: string;
}
