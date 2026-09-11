# Super Admin Web App - Existing Backend Implementation Analysis

## 1. Existing Admin Endpoints

### GET `/api/admin/verifications`
- **Purpose**: Lists all pending verification requests for admin review
- **Authentication**: Requires `requireAuth` + `requireAdmin` middleware
- **Response**: Array of verification requests with user details
- **Data Includes**:
  - Request ID, user ID, verification level, document type
  - Documents (array of URLs), notes, status, admin notes
  - Timestamps and user info (name, email, phone)
- **Pagination**: Limited to 50 most recent requests

### POST `/api/admin/verifications/:id/review`
- **Purpose**: Review/approve/reject a verification request
- **Authentication**: Requires `requireAuth` + `requireAdmin` middleware
- **Request Body** (validated by `reviewVerification` schema):
  ```json
  {
    "status": "approved|rejected|more_info_needed",
    "adminNotes": "string (optional, max 1000 chars)"
  }
  ```
- **Behavior**:
  - Updates verification request status and admin notes
  - If approved: sets `is_verified = TRUE` on user record
  - Creates notification for user about verification outcome
  - Uses transaction for PostgreSQL to ensure consistency
  - Prevents reviewing already processed requests

## 2. Existing Verification Endpoints (User-Facing)

### POST `/api/verification/upload`
- **Purpose**: Upload verification document images
- **Authentication**: Requires `requireAuth`
- **Request Body**:
  ```json
  {
    "image": "base64 string",
    "filename": "string",
    "mime": "image/jpeg or image/png (optional)"
  }
  ```
- **Response**: 
  ```json
  {
    "url": "/uploads/verification/stored_filename.ext",
    "filename": "stored_filename.ext",
    "size": 12345
  }
  ```
- **Constraints**: Max 10MB file size

### POST `/api/verification/submit`
- **Purpose**: Submit a verification request
- **Authentication**: Requires `requireAuth`
- **Request Body** (validated by `submitVerification` schema):
  ```json
  {
    "level": "basic|standard|advanced",
    "documentType": "string (required, max 50 chars)",
    "documents": ["url1", "url2", ...] (array, 1-10 items),
    "notes": "string (optional, max 500 chars)"
  }
  ```
- **Behavior**:
  - Prevents submission if user already has pending/approved request
  - Sets user's `is_verified = FALSE` upon submission
  - Creates verification request with status 'pending'

### GET `/api/verification/status`
- **Purpose**: Get current user's verification status
- **Authentication**: Requires `requireAuth`
- **Response**:
  ```json
  {
    "request": { /* verification request object */ } | null,
    "status": "pending|approved|rejected|more_info_needed|unverified"
  }
  ```

## 3. Admin Authentication/Authorization Mechanism

### Middleware Chain for Admin Routes:
1. `requireAuth` - Validates JWT token, sets `req.userId`
2. `requireAdmin` - Custom middleware that:
   - Queries database for user's `is_admin` flag
   - Returns 403 Forbidden if not admin
   - Works with both PostgreSQL and SQLite

### JWT Authentication Details:
- Token format: Bearer JWT
- Secret: `JWT_SECRET` environment variable (required)
- Expiry: Configurable via `JWT_EXPIRY` (default 7d)
- Includes JTI (JWT ID) for revocation tracking
- Blocklist table: `jwt_blocklist` for logged-out tokens

### Admin Privileges:
- Determined by `is_admin` BOOLEAN field in `users` table
- Only users with `is_admin = TRUE` can access admin endpoints
- Admin status is set manually in database (no self-registration path)

## 4. Relevant Database Tables/Fields

### users table:
- `id` SERIAL PRIMARY KEY
- `is_admin` BOOLEAN DEFAULT FALSE ← **KEY FOR SUPER ADMIN**
- `is_verified` BOOLEAN DEFAULT FALSE ← **TARGET FOR VERIFICATION**
- `is_active` BOOLEAN DEFAULT TRUE
- `email`, `phone`, `name`, `role` (seeker/provider/admin)
- `fcm_token` for push notifications
- `created_at`, `updated_at` TIMESTAMPTZ

### verification_requests table:
- `id` SERIAL PRIMARY KEY
- `user_id` INTEGER REFERENCES users(id)
- `level` TEXT (basic/standard/advanced)
- `document_type` TEXT
- `documents` TEXT (JSON array of URLs)
- `notes` TEXT
- `status` TEXT (pending/approved/rejected/more_info_needed)
- `admin_notes` TEXT ← **SET BY ADMIN REVIEW**
- `created_at`, `updated_at` TIMESTAMPTZ

### notifications table:
- Used to inform users of verification outcomes
- Types: `verification_approved`, `verification_rejected`

## 5. What the New Web Frontend Needs to Call

### Essential APIs for Minimum Viable Super Admin:

#### Authentication:
- `POST /api/auth/login` - Obtain JWT token (using admin credentials)
  - Body: `{ email, password }`
  - Response: `{ token }` (JWT)

#### Core Admin Functionality:
1. **GET** `/api/admin/verifications`
   - Headers: `Authorization: Bearer <jwt_token>`
   - Response: List of pending verification requests to review

2. **POST** `/api/admin/verifications/:id/review`
   - Headers: `Authorization: Bearer <jwt_token>`
   - Body: `{ status, adminNotes }`
   - Action: Approve/reject/request more info for a verification request

#### Optional but Helpful:
- `GET /api/verification/status` - Check own verification status (if admin also needs verification)
- `GET /api/admin/verifications` with filtering/sorting (currently returns latest 50)

### Authentication Flow for Web App:
1. User enters admin credentials (email/password) on login page
2. Frontend calls `/api/auth/login` to get JWT
3. Frontend stores JWT (in memory or secure storage)
4. For subsequent API calls, frontend includes `Authorization: Bearer <jwt>` header
5. Frontend calls admin endpoints to manage verification requests

## 6. Recommended Frontend Location/Structure

### Location in Repository:
```
/admin-web-app/  (new directory at repository root)
```

### Suggested Structure:
```
admin-web-app/
├── public/                  # Static assets
├── src/                     # Source code
│   ├── components/          # React components
│   │   ├── Login.js         # Admin login form
│   │   ├── VerificationList.js # List of pending requests
│   │   ├── VerificationCard.js # Individual request review
│   │   └── AdminLayout.js   # Layout with navigation
│   ├── services/            # API service functions
│   │   ├── authService.js   # Login/logout functions
│   │   └── verificationService.js # Admin verification APIs
│   ├── App.js               # Main app component
│   ├── index.js             # Entry point
│   └── styles/              # CSS modules or similar
├── package.json             # Dependencies and scripts
├── .env                     # Environment variables (REACT_APP_API_URL)
├── README.md                # Setup instructions
└── ...                      # Config files (vite.config.js, etc.)
```

### Technology Recommendations (Consistent with Existing Stack):
- **Framework**: React 18 (matches existing web app)
- **Build Tool**: Vite (matches existing web app)
- **Styling**: CSS Modules (matches existing web app) or Tailwind
- **State Management**: React Context or useState/useContext (keep simple for MVP)
- **Routing**: React Router v6 (matches existing web app)
- **HTTP Client**: fetch API or axios

### Minimum Viable Features for V1:
1. Login page for super admin credentials
2. Dashboard showing list of pending verification requests
3. Ability to click on a request to view details
4. Form to approve/reject with optional admin notes
5. Success/error feedback after submission
6. Logout functionality

### Environment Variables Needed:
- `REACT_APP_API_URL` - Points to `https://kaarya-4qft.onrender.com` (production)
- For development: Could point to `http://localhost:5000` if running backend locally

## 7. Security Considerations for Web App

### Authentication:
- Store JWT securely (in memory, not localStorage for XSS protection)
- Implement automatic token refresh if needed (though 7d expiry is reasonable)
- Redirect to login if 401 Unauthorized received

### Authorization:
- Frontend should hide admin UI if user lacks admin privileges (though backend enforces this)
- Handle 403 Forbidden responses appropriately

### Data Protection:
- Use HTTPS in production (Render provides this automatically)
- Validate/sanitize any user input before sending to backend
- Be careful with displaying user PII (emails, phone numbers) - only show what's necessary

## 8. Dependencies on Existing Backend

The proposed frontend can be built entirely as a separate application that:
- Communicates only with existing backend APIs
- Requires zero backend modifications
- Uses the exact same authentication and authorization mechanisms
- Leverages existing validation, error handling, and transaction logic
- Works with both PostgreSQL and SQLite (through the db abstraction layer)

## Conclusion

The existing backend provides a complete, secure foundation for a Super Admin web app. All necessary APIs are already implemented and tested. The frontend would be a thin consumption layer focused on:
1. Authenticating as an admin user
2. Displaying pending verification requests
3. Allowing approval/rejection with admin notes
4. Providing appropriate user feedback

No backend changes are required to build this MVP - the verification and admin endpoints are production-ready.