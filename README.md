# MailVanta Development Documentation

## Project Overview
MailVanta is an AI-powered outreach solution built with React, TypeScript, and Supabase. The application provides campaign management, contact management, and automated email sequences with AI-driven content generation.

## Recent Implementation Success: Email Sequence Generation
The email sequence generation system is now working successfully with the following components:

### Core Components
- **Service Role Integration**: Using `supabaseAdmin` for secure email insertions
- **Campaign Ownership Verification**: Pre-generation checks ensure user owns the campaign
- **Notification System**: Real-time progress updates during generation
- **Error Handling**: Comprehensive error capture and user feedback

### Generation Flow
1. **Authentication & Verification**
   - User authentication check
   - Campaign ownership verification using service role
   - Pre-generation validation of campaign settings

2. **Content Generation**
   - GPT-4 integration for content creation
   - Stage-appropriate content based on sequence type
   - Proper metadata and CTA inclusion

3. **Email Creation**
   - Batch processing with progress tracking
   - Service role for secure database operations
   - Proper RLS policy compliance

4. **Status Updates**
   - Real-time progress notifications
   - Generation status persistence
   - Error state management

### Security Measures
- Service role for privileged operations
- RLS policies for data access control
- Proper ownership verification
- Secure metadata handling

## Current Development State

### Core Features
1. **Authentication & Security**
   - Supabase Auth integration with email/password
   - Protected routes with auth state management
   - Row Level Security (RLS) across all tables
   - Service role for system operations

2. **Campaign Management**
   - Campaign lifecycle management (draft → active → completed)
   - Sequence type support (awareness, conversion, nurture)
   - Performance analytics and tracking
   - CTA management per sequence type

3. **Contact Management**
   - Contact list view with engagement metrics
   - CSV import with field mapping
   - Smart handling of missing emails
   - Contact engagement scoring
   - List types: manual, dynamic, segment

4. **Email Infrastructure**
   - SendGrid integration with domain verification
   - Rate limiting and quota management
   - Event tracking (opens, clicks, etc.)
   - Error handling and retry logic

5. **User Experience**
   - Real-time notifications system
   - Interactive calendar interface
   - Profile management
   - Comprehensive error feedback

### Database Architecture
Key tables and their relationships:

1. **User Data**
   - `profiles`: Core user information and preferences
   - `domain_settings`: Email domain verification and configuration
   - `subscriptions`: User subscription and billing status

2. **Campaign System**
   - `campaigns`: Campaign configuration and status
   - `emails`: Email content and scheduling
   - `ai_logs`: AI generation tracking
   - `email_events`: Email delivery and engagement tracking

3. **Contact Management**
   - `contacts`: Contact information and metrics
   - `contact_lists`: List organization
   - `contact_list_members`: List membership

4. **System Management**
   - `notifications`: System notifications
   - `rate_limits`: Email sending controls
   - `function_logs`: System operation logging

All tables implement:
- Row Level Security (RLS)
- Created/Updated timestamps
- UUID primary keys
- Appropriate indexes

For detailed schema information, see `docs/database-schema.md`

## Recent Implementations

### Campaign CTA Links
- Type-specific links (awareness, conversion, nurture)
- Automatic inclusion in generated emails
- Real-time updates and validation

### Notifications System
- Real-time user notifications with action support
- Campaign generation progress tracking
- Status-based styling (success, error, info, warning)
- Clickable actions for direct navigation

### Email Sequence Improvements
- Batch processing for better performance
- Progress tracking and persistence
- Enhanced error handling and recovery
- Service role security integration

### Contact Management Updates
- Smart CSV import with field mapping
- Missing email handling improvements
- Enhanced engagement scoring
- List management optimization

## Development Setup

### Prerequisites
- Node.js 18+
- Supabase CLI
- PostgreSQL 14+
- Git

### Initial Setup
```bash
# Clone and install
git clone [repository-url]
cd mailvanta
npm install

# Environment setup
cp .env.example .env
# Edit .env with your values:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - OPENAI_API_KEY
# - SENDGRID_API_KEY

# Start Supabase
supabase start

# Run migrations
supabase migration up

# Start development
npm run dev
```

### Development Commands
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm test            # Run tests
npm run lint        # Run linter
npm run typecheck   # Run type checks
```

### Common Tasks
1. **Creating Migrations**
   ```bash
   supabase migration new my_migration_name
   ```

2. **Updating Types**
   ```bash
   supabase gen types typescript --local > src/types/supabase.ts
   ```

3. **Testing Edge Functions**
   ```bash
   supabase functions serve --env-file .env
   ```

## Contributing

[Content continues...]

## Technical Stack

### Frontend
- React 18 with TypeScript
- TailwindCSS & shadcn/ui
- Vite for build tooling
- Key libraries:
  - FullCalendar: Email scheduling
  - PapaParse: CSV processing
  - Zod: Type validation

### Backend (Supabase)
- PostgreSQL 14 with RLS
- Edge Functions (Deno)
- Real-time subscriptions
- Storage for attachments

### External Services
- OpenAI GPT-4: Content generation
- SendGrid: Email delivery
- Stripe: Payment processing

### Project Structure
```
src/
├── components/        # UI components
│   ├── campaign/     # Campaign-related components
│   ├── email/        # Email-related components
│   └── common/       # Shared components
├── hooks/            # React hooks
├── lib/              # Core libraries
│   ├── supabase/     # Database client
│   ├── openai/       # AI integration
│   └── email/        # Email service
├── pages/            # Route pages
└── utils/            # Shared utilities
```

## Development Setup

[Content continues...]

## Technical Architecture

### Frontend Structure
```
src/
├── components/
│   ├── campaign/
│   │   ├── CampaignSetup.tsx
│   │   └── EmailSequencePlanner.tsx
│   ├── common/
│   │   └── Header.tsx
│   └── shadcn/
│       ├── Button.tsx
│       └── Card.tsx
├── contexts/
│   └── AuthContext.tsx
├── hooks/
│   ├── useCampaigns.ts
│   └── useProfile.ts
├── lib/
│   └── supabase/
│       ├── client.ts
│       └── hooks.ts
├── pages/
│   ├── Auth.tsx
│   ├── Campaign.tsx
│   ├── Contacts.tsx
│   ├── Dashboard.tsx
│   └── Landing.tsx
└── utils/
    └── cn.ts
```

### Key Technologies
- React 18 with TypeScript
- Supabase for backend services
- TailwindCSS for styling
- PapaParse for CSV handling
- FullCalendar for scheduling interface
- OpenAI API for content generation

### Key Database Features
1. **Row Level Security (RLS)**
   - Profile-level security policies
   - Campaign-level access control
   - Contact data protection
2. **Automatic Timestamps**
   - Created at tracking
   - Last updated tracking
3. **Database Triggers**
   - Automatic profile creation
   - Updated timestamp maintenance
   - Engagement score calculations

## Development Workflow

### Current Development Focus
1. Contact management system enhancement
2. CSV import functionality
3. Error handling and validation
4. Type safety improvements

### Recent Changes
- Added support for handling contacts without email addresses
- Implemented user choice modal for import decisions
- Fixed TypeScript errors related to null vs undefined
- Enhanced error handling in import process

### Pending Improvements
1. Contact list filtering and search
2. Bulk actions for contacts
3. Enhanced engagement metrics
4. Export functionality
5. Advanced list segmentation

### Code Style Guidelines
1. Use TypeScript interfaces for all data structures
2. Implement proper error handling with user feedback
3. Use React hooks for state management
4. Follow component composition patterns
5. Maintain consistent styling with TailwindCSS

## Testing and Validation

### Current Test Coverage
- Basic component rendering
- Authentication flows
- Data fetching and updates
- CSV import processing

### Error Handling
1. CSV parsing errors
2. Missing required fields
3. Database operation failures
4. Authentication errors
5. Network request failures

1. Profile Management
   - Authentication state validation
   - Profile creation fallbacks
   - Update conflict resolution
   - Proper error messages and user feedback

## Environment Setup

### Required Environment Variables
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_OPENAI_API_KEY=your_openai_api_key
```

### Development Commands
```bash
npm install        # Install dependencies
npm run dev       # Start development server
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # Run linter
npm run typecheck # Run TypeScript checks
```

## Current Challenges and Solutions

### 1. Contact Import Process
**Challenge**: Handling missing email addresses in CSV imports
**Solution**: Implemented a modal interface allowing users to:
- View contacts with missing emails
- Choose to import all contacts or only those with valid emails
- Preview affected records before making a decision

### 2. Type Safety
**Challenge**: Maintaining TypeScript type safety across the application
**Solution**: 
- Created comprehensive interfaces for all data structures
- Used proper type assertions and checks
- Implemented proper null/undefined handling

### 3. Real-time Updates
**Challenge**: Keeping UI in sync with database changes
**Solution**: Implemented Supabase real-time subscriptions for:
- Contact updates
- Campaign status changes
- Analytics updates

## Next Steps

### Immediate Priorities
1. Enhance contact list management
2. Implement advanced search and filtering
3. Add bulk operations for contacts
4. Improve error handling and user feedback

### Future Enhancements
1. Advanced segmentation features
2. Enhanced analytics dashboard
3. Integration with additional email providers
4. Advanced AI-driven content optimization
5. A/B testing capabilities

## Troubleshooting Guide

### Common Issues
1. CSV Import Errors
   - Check file format
   - Verify column mappings
   - Ensure required fields are present

2. Type Errors
   - Verify interface implementations
   - Check for null/undefined handling
   - Ensure proper type assertions

3. Database Operations
   - Verify Supabase connections
   - Check RLS policies
   - Validate data structures

## Documentation Updates
Last Updated: [Current Date]
Current Version: 0.1.0

This documentation will be updated as new features are implemented and existing ones are modified. Please refer to the git history for detailed changes.

## Supabase Client Setup

The application uses Supabase for backend services. The client setup is handled in `src/lib/supabase/client.ts`:

```typescript
// Import the createClient function and Database type
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';

// Create and export the client
const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Export as both named and default export
export { client as supabase };
export default client;
```

### Important Notes

1. **Export Pattern**: The client must be exported using both named and default exports to work correctly with Vite's HMR (Hot Module Replacement) and ESM (ECMAScript Modules):
   - Named export: `export { client as supabase }`
   - Default export: `export default client`

2. **File Structure**:
   - Keep the client creation in `src/lib/supabase/client.ts`
   - Export types separately in `src/types/supabase.ts`
   - Use barrel exports through `src/lib/supabase/index.ts`

3. **Environment Variables**:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **TypeScript Integration**:
   - Define your database types in `src/types/supabase.ts`
   - Use the `Database` type when creating the client for full type safety

### Common Issues

1. **Module Resolution**: If you see the error "does not provide an export named 'supabase'", check:
   - The export pattern in `client.ts`
   - That you're not mixing `.js` and `.ts` files
   - Clear the Vite cache if needed

2. **Type Errors**: If you see Database type errors:
   - Ensure your types match your Supabase schema
   - Check that the Database type is properly exported
   - Verify the import paths are correct

## Email Sequence Generation

The email sequence generation feature is a powerful tool that automatically creates a series of targeted emails based on your campaign settings. Here's how it works:

### Prerequisites
1. Campaign must have a sequence type ('awareness', 'conversion', or 'nurture')
2. A start date must be selected
3. Campaign duration and emails per week must be set

### Sequence Types and Stages
Each sequence type follows a specific progression of stages:

- **Awareness & Education**
  1. Problem Awareness
  2. Solution Education
  3. Brand Introduction
  4. Value Proposition
  5. Social Proof

- **Direct Conversion**
  1. Value Proposition
  2. Feature Showcase
  3. Case Studies
  4. Offer Introduction
  5. Call to Action

- **Relationship Nurturing**
  1. Industry Insights
  2. Best Practices
  3. Tips & Tricks
  4. Success Stories
  5. Thought Leadership

### Generation Process
1. Calculates total number of emails based on campaign duration and emails per week
2. Distributes emails evenly across the campaign duration
3. For each email:
   - Determines the appropriate stage based on position in sequence
   - Generates content using GPT-4 with campaign context and stage requirements
   - Creates email with metadata including sequence type, topic, and stage
   - Initially sets status to 'draft'

### Email Structure
Generated emails include:
- Subject line aligned with the current stage
- Content tailored to campaign goals and target audience
- Stage-appropriate CTA placement
- Metadata for tracking sequence progression

### Database Schema
Emails are stored with:
- Basic fields: subject, content, scheduled_at, status
- Metadata including:
  - sequence_type: The campaign's sequence type
  - topic: Name, description, and current stage
  - Additional placeholders for personalization

### Status Management
- New emails start as 'draft'
- Can be updated to 'pending' when ready to send
- Must have a recipient (to_email) to be marked as 'pending'
- System tracks 'sent' and 'failed' statuses

### Calendar Integration
- Emails are displayed on an interactive calendar
- Color-coded by status (pending, sent, failed)
- Allows easy visualization of sequence progression

This feature streamlines the creation of cohesive email sequences while maintaining flexibility for customization.

### Database Migrations and Testing

#### Migration System
The project uses Supabase's migration system to manage database schema changes. Migrations are located in `supabase/migrations/` and follow this naming convention:
- `YYYYMMDD_description.sql` for base migrations
- `YYYYMMDDXXX_description.sql` for more granular versioning within a day

Key migrations include:
1. `20240325_enable_extensions.sql`: Sets up required Postgres extensions
2. `20240326_consolidated_schema.sql`: Base schema with core tables
3. `20240400331_create_http_types.sql`: Custom types for HTTP operations
4. `20240400333_create_contacts.sql`: Contact management system
5. `20240400334_add_stripe_subscriptions.sql`: Stripe integration
6. `20240400335_add_usage_tracking.sql`: Usage tracking system

#### Required Functions for Billing System
The following functions need to be implemented to complete the billing system setup:

1. **HTTP Functions**
   ```sql
   -- HTTP POST function for making external requests
   CREATE OR REPLACE FUNCTION http_post(
       url text,
       headers jsonb,
       body jsonb
   ) RETURNS http_response
   ```

2. **Billing Calculation**
   ```sql
   -- Function to calculate usage-based billing
   CREATE OR REPLACE FUNCTION invoke_billing_calculation()
   RETURNS void
   ```

#### Testing System
The project includes automated tests in several migrations:

1. **Billing Setup Tests** (`20240400339_test_billing_setup.sql`)
   - Verifies required extensions (pg_net, pg_cron)
   - Validates app_settings configuration
   - Tests logging system
   - Validates HTTP functions
   - Tests auth header passing
   - Verifies billing calculation

2. **Test Running**
   ```bash
   # Run all tests
   supabase db reset

   # Run specific test
   psql "postgres://postgres:postgres@localhost:54322/postgres" -f supabase/migrations/20240400339_test_billing_setup.sql
   ```

3. **Test Results**
   Tests output results using Postgres NOTICE messages:
   ```
   NOTICE: Starting billing setup tests...
   NOTICE: ----------------------------
   NOTICE: PASS: pg_net extension is installed
   NOTICE: PASS: app_settings table exists
   NOTICE: PASS: logs table is working
   NOTICE: FAIL: Error testing HTTP function
   ...
   ```

#### Running Migrations
```bash
# Reset database and run all migrations
supabase db reset

# Create new migration
supabase migration new my_migration_name

# Verify migration status
supabase db remote changes
```

#### Migration Best Practices
1. Each migration should be atomic and self-contained
2. Include rollback logic where possible
3. Use IF NOT EXISTS clauses for idempotency
4. Add appropriate indexes for performance
5. Implement RLS policies for security
6. Test migrations locally before deployment

## User Management and Authentication

### User Types and Access Control
The system implements three distinct user types:
1. **Admin Users**
   - Full access to all features
   - Unlimited usage
   - No billing restrictions
   - Access to admin-only features

2. **Paying Users**
   - Access based on subscription plan
   - Usage limits based on plan
   - Usage-based billing

3. **Guest Users**
   - Limited access
   - Redirected to pricing page
   - No feature access until subscribed

### Database Functions
Two key functions are available for user management:

1. **Check User Status**
```sql
-- Check if a user is admin, paying, or guest
SELECT * FROM check_user_status('user-uuid-here');

-- Returns:
{
  "status": "admin|paying|guest",
  "details": {
    "user_id": "uuid",
    "subscription_id": "uuid",
    "plan_name": "string",
    "subscription_status": "string",
    "is_admin": boolean,
    "current_period_end": "timestamp"
  }
}
```

2. **Make User Admin**
```sql
-- Promote a user to admin status
SELECT make_user_admin('user-uuid-here');
```

### User Status View
A convenient view is available for checking all users' statuses:
```sql
SELECT * FROM user_status_summary;
```

### Authentication Flow
The sign-in process follows this sequence:
1. User signs in with email/password
2. System checks subscription status
3. Routes user based on status:
   - Admin → Dashboard
   - Active Subscription → Dashboard
   - No Subscription → Pricing page

### Protected Routes
All protected routes implement these checks:
1. Authentication status
2. Subscription status
3. Admin privileges

Example implementation:
```typescript
function ProtectedRoute({ children }) {
  const { user, loading: authLoading } = useAuth();
  const { subscription, loading: subLoading } = useSubscription();

  if (authLoading || subLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/auth" />;
  }

  if (!subscription?.is_admin && (!subscription || subscription.status !== 'active')) {
    return <Navigate to="/pricing" />;
  }

  return <>{children}</>;
}
```

### Admin Tools
Helper functions for admin tasks:
```sql
-- Check admin configuration
SELECT * FROM verify_admin_setup();

-- Check pricing setup
SELECT * FROM verify_pricing_setup();

-- View all admin users
SELECT * FROM user_status_summary WHERE user_type = 'admin';
```

### Security Considerations
- Row Level Security (RLS) policies protect user data
- Admin status is checked at database level
- Admin privileges require elevated permissions
- Usage records are protected by RLS policies

### Troubleshooting Common Issues
1. **User redirected to pricing despite admin status**
   - Check subscription status in database
   - Verify admin plan exists
   - Ensure RLS policies are correct

2. **Admin privileges not working**
   - Verify user has admin subscription
   - Check `is_admin` flag in subscriptions table
   - Validate pricing plan configuration

## Error Handling System

The application implements a comprehensive error handling system with the following features:

### 1. Standardized Error Components
- `ErrorMessage` component provides consistent error UI across the application
- Supports error codes, descriptive messages, and recovery suggestions
- Includes optional action buttons for error recovery
- Responsive design with proper contrast and accessibility

### 2. Error Message Formatting
```typescript
// Example error with code
{
  error: "PGRST116: No rows returned",
  suggestion: "The requested resource does not exist or has been deleted."
}

// Example network error
{
  error: "Network error",
  suggestion: "Please check your internet connection and try again."
}
```

### 3. Known Error Types
The system includes pre-defined handling for common error scenarios:
- Authentication errors (AUTH001)
- Database constraints (23505, 23503)
- Network connectivity issues
- Timeout errors
- Resource not found (PGRST116)
- Database schema issues (42P01)

### 4. Error Recovery
Each error type includes:
- Clear explanation of what went wrong
- Specific suggestions for resolution
- Action buttons where applicable (e.g., retry, refresh)
- Automatic retry with exponential backoff for transient errors

### 5. Development Tools
```typescript
// Enable test delays to verify loading states
import { enableTestDelays } from '../utils/test-helpers';
enableTestDelays();

// Log loading state changes
logLoadingState('ComponentName', true/false);
```

### 6. Implementation Example
```typescript
try {
  // Your async operation
} catch (err) {
  const { error, suggestion } = getErrorMessage(err);
  return (
    <ErrorMessage 
      error={error}
      suggestion={suggestion}
      action={{
        label: 'Retry',
        onClick: handleRetry
      }}
    />
  );
}
```

### 7. Best Practices
- All errors include user-friendly messages
- Technical details are logged but not shown to users
- Consistent styling across the application
- Recovery actions are clearly indicated
- Loading states prevent premature error displays

### 8. Error Monitoring
- All errors are logged to console in development
- Network errors are tracked separately
- Authentication errors trigger automatic sign-out when needed
- Error recovery attempts are logged for debugging

## Email Analytics System

The email analytics system works through a combination of SendGrid webhooks and our Edge Functions. Here's how it works:

### Analytics Data Structure
Campaign analytics are stored in a simple, flat structure:
```typescript
{
  sent: number;     // Total emails sent
  opened: number;   // Total opens
  clicked: number;  // Total clicks
  replied: number;  // Total replies
}
```

### Event Flow
1. When an email is sent via SendGrid, it triggers webhook events for different interactions:
   - `processed`: Email has been sent
   - `delivered`: Email was successfully delivered
   - `open`: Recipient opened the email
   - `click`: Recipient clicked a link
   - `reply`: Recipient replied to the email

2. Our `email-webhooks` Edge Function receives these events and:
   - Logs the event in the `email_events` table
   - Updates the email's status in the `emails` table
   - Increments the corresponding counter in the campaign's analytics

3. The analytics page (`CampaignAnalytics.tsx`) reads these metrics and displays:
   - Total emails sent
   - Open rate (opens/sent)
   - Click rate (clicks/sent)
   - Response rate (replies/sent)

### Webhook Handler
The webhook handler (`supabase/functions/email-webhooks/index.ts`) processes events by:
1. Verifying the SendGrid signature
2. Finding the corresponding email record
3. Logging the event
4. Updating campaign analytics
5. Updating email status

This simple, event-driven architecture ensures real-time analytics updates while maintaining data consistency.
