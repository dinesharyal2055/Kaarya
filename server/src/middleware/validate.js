/**
 * Zod schema validation middleware.
 *
 * Import validators from this module and use them in routes:
 *   router.post('/endpoint', validate(validatorName), async (req, res) => { ... });
 *
 * If validation fails, a 400 response with { error: <message> } is sent
 * and the handler is NOT called.
 */

'use strict';

const { z } = require('zod');

// ─── Shared sub-schemas ────────────────────────────────────────────────

const emailSchema = z.string()
  .min(1, 'Email is required')
  .max(254, 'Email must be at most 254 characters')
  .email('Please enter a valid email address');

const phoneSchema = z.string()
  .min(1, 'Phone number is required')
  .max(15, 'Phone number is too long')
  .regex(/^9[89]\d{8}$/, 'Phone must be a valid Nepali number (9800000000–9899999999)');

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character');

// ─── Auth schemas ─────────────────────────────────────────────────────

const register = z.object({
  name:     z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  email:    emailSchema,
  phone:    phoneSchema,
  password: passwordSchema,
  role:    z.enum(['seeker', 'provider'], { errorMap: () => ({ message: 'Role must be "seeker" or "provider"' }) }),
});

const verifyOtp = z.object({
  email: emailSchema,
  code:  z.string().regex(/^\d{6}$/, 'Code must be a 6-digit number'),
});

const resendOtp = z.object({
  email: emailSchema,
});

const login = z.object({
  phone:    phoneSchema,
  password: z.string().min(1, 'Password is required'),
});

const forgotPassword = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
}).refine(data => data.phone || data.email, {
  message: 'Phone or email is required',
});

const verifyResetOtp = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
  code:  z.string().regex(/^\d{6}$/, 'Code must be a 6-digit number'),
}).refine(data => data.phone || data.email, {
  message: 'Phone or email is required',
});

const resetPassword = z.object({
  phone:       z.string().optional(),
  email:       z.string().optional(),
  code:        z.string().regex(/^\d{6}$/, 'Code must be a 6-digit number'),
  newPassword: passwordSchema,
}).refine(data => data.phone || data.email, {
  message: 'Phone or email is required',
});

const updateProfile = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters').optional(),
  bio:  z.string().max(500, 'Bio must be at most 500 characters').optional(),
}).refine(data => data.name !== undefined || data.bio !== undefined, {
  message: 'At least one of name or bio must be provided',
});

const uploadAvatar = z.object({
  image:    z.string().min(1, 'Image data is required'),
  filename: z.string().min(1, 'Filename is required').max(255, 'Filename must be at most 255 characters'),
});

const updateRole = z.object({
  role: z.enum(['seeker', 'provider'], { errorMap: () => ({ message: 'Role must be "seeker" or "provider"' }) }),
});

// ─── Job schemas ───────────────────────────────────────────────────────

const jobStatusEnum = z.enum(['open', 'assigned', 'in_progress', 'completed', 'cancelled']);

const createJob = z.object({
  title:           z.string().min(1, 'Title is required').max(100, 'Title must be at most 100 characters'),
  description:     z.string().min(10, 'Description must be at least 10 characters').max(2000, 'Description must be at most 2000 characters'),
  category:        z.string().min(1, 'Category is required').max(50, 'Category must be at most 50 characters'),
  location:        z.string().min(1, 'Location is required').max(200, 'Location must be at most 200 characters'),
  address:         z.string().max(300, 'Address must be at most 300 characters').optional(),
  budgetMin:       z.coerce.number().positive('Minimum budget must be positive').optional().nullable(),
  budgetMax:       z.coerce.number().positive('Maximum budget must be positive').optional().nullable(),
  negotiationMode: z.coerce.boolean().optional(),
  photoUrls:       z.array(z.string().url('Invalid photo URL')).max(5, 'At most 5 photos allowed').optional(),
  latitude:        z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude:       z.coerce.number().min(-180).max(180).optional().nullable(),
});

const updateJob = z.object({
  title:           z.string().min(1, 'Title is required').max(100, 'Title must be at most 100 characters').optional(),
  description:     z.string().min(10, 'Description must be at least 10 characters').max(2000, 'Description must be at most 2000 characters').optional(),
  location:        z.string().min(1, 'Location is required').max(200, 'Location must be at most 200 characters').optional(),
  budgetMin:       z.coerce.number().positive('Minimum budget must be positive').optional().nullable(),
  budgetMax:       z.coerce.number().positive('Maximum budget must be positive').optional().nullable(),
  negotiationMode: z.coerce.boolean().optional().nullable(),
  photoUrls:       z.array(z.string().url('Invalid photo URL')).max(5, 'At most 5 photos allowed').optional(),
  latitude:        z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude:       z.coerce.number().min(-180).max(180).optional().nullable(),
}).refine(data => {
  // At least one field must be provided
  return Object.values(data).some(v => v !== undefined);
}, {
  message: 'At least one field must be provided',
});

const updateJobStatus = z.object({
  status: jobStatusEnum,
});

// ─── Offer schemas ─────────────────────────────────────────────────────

const createOffer = z.object({
  jobId:  z.string().min(1, 'Job ID is required'),
  price:  z.coerce.number().positive('Price must be positive'),
  message: z.string().max(500, 'Message must be at most 500 characters').optional(),
});

const updateOffer = z.object({
  price:   z.coerce.number().positive('Price must be positive'),
  message: z.string().max(500, 'Message must be at most 500 characters').optional(),
});

// ─── Review schemas ────────────────────────────────────────────────────

const createReview = z.object({
  jobId:      z.string().min(1, 'Job ID is required'),
  revieweeId: z.string().min(1, 'Reviewee ID is required'),
  rating:     z.coerce.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating must be at most 5'),
  comment:    z.string().max(1000, 'Comment must be at most 1000 characters').optional(),
});

// ─── Conversation schemas ──────────────────────────────────────────────

const sendMessage = z.object({
  text: z.string().min(1, 'Message text is required').max(1000, 'Message must be at most 1000 characters'),
});

// ─── Verification schemas ──────────────────────────────────────────────

const submitVerification = z.object({
  level:       z.enum(['basic', 'standard', 'advanced']),
  documentType: z.string().min(1, 'Document type is required').max(50),
  documents:   z.array(z.string().min(1)).min(1, 'At least one document is required').max(10),
  notes:       z.string().max(500, 'Notes must be at most 500 characters').optional(),
});

// ─── Push notification schemas ────────────────────────────────────────

const registerToken = z.object({
  token: z.string().min(1, 'Push token is required'),
});

// Token is optional — if omitted, all tokens for the user are removed
const unregisterToken = z.object({
  token: z.string().min(1, 'Push token is required').optional(),
});

// ─── Admin schemas ────────────────────────────────────────────────────

const reviewVerification = z.object({
  status:      z.enum(['approved', 'rejected', 'more_info_needed']),
  adminNotes:  z.string().max(1000, 'Admin notes must be at most 1000 characters').optional(),
});

const updateUserRole = z.object({
  role: z.enum(['seeker', 'provider', 'admin'], {
    errorMap: () => ({ message: 'Role must be "seeker", "provider", or "admin"' }),
  }),
});

// ─── Middleware factory ───────────────────────────────────────────────

/**
 * Creates Express middleware that validates req.body against a Zod schema.
 * On success: calls next() with validated data available at res.locals.parsedBody
 * On failure: sends 400 with the first error message.
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      // Return the first validation error message for clarity
      const errors = result.error?.errors;
      const message = (errors && errors.length > 0) ? errors[0].message : 'Invalid request body';
      return res.status(400).json({ error: message });
    }
    // Attach parsed + coerced data for downstream handlers
    res.locals.parsedBody = result.data;
    next();
  };
}

module.exports = {
  validate,
  // Auth
  register,
  verifyOtp,
  resendOtp,
  login,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  updateProfile,
  uploadAvatar,
  updateRole,
  // Jobs
  createJob,
  updateJob,
  updateJobStatus,
  // Offers
  createOffer,
  updateOffer,
  // Reviews
  createReview,
  // Conversations
  sendMessage,
  // Verification
  submitVerification,
  // Push
  registerToken,
  unregisterToken,
  // Admin
  reviewVerification,
  updateUserRole,
};
