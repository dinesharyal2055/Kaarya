-- Migration: Fix is_verified flag
-- Before the verification flow was enforced, new users were incorrectly created with is_verified = 1.
-- This sets unverified users (those without a pending/approved verification request) back to 0.
-- Users who have a pending or approved verification request keep their current flag.

UPDATE users
SET is_verified = 0
WHERE is_verified = 1
  AND id NOT IN (
    SELECT DISTINCT user_id
    FROM verification_requests
    WHERE status IN ('pending', 'approved')
  );
