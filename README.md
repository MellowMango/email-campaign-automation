# MailVanta Development Documentation

## Project Overview
MailVanta is an AI-powered outreach solution built with React, TypeScript, and Supabase. The application provides campaign management, contact management, and automated email sequences with AI-driven content generation.

## Current Development State

### Core Features Implemented
1. **Authentication System**
   - User signup/signin via Supabase Auth
   - Protected routes with authentication state management
   - Comprehensive user profile management
     - Automatic profile creation on signup
     - User details (full name, company name, role)
     - Profile settings page
     - Row Level Security (RLS) policies for data protection

2. **Campaign Management**
   - Campaign creation with customizable settings
   - Campaign status tracking (draft, active, paused, completed)
   - AI-driven content generation for email sequences
   - Campaign analytics and performance metrics

3. **Contact Management**
   - Contact list view with engagement metrics
   - Contact import via CSV with field mapping
   - Handling of contacts with missing emails (user choice to include/exclude)
   - Contact engagement scoring
   - Contact lists with different types (manual, dynamic, segment)

4. **Email Sequence Planning**
   - Visual calendar interface for email scheduling
   - AI-generated email content
   - Sequence templates for different campaign types
   - Real-time analytics tracking

### Database Schema
The Supabase database includes the following main tables:
- `profiles`: User profiles and settings
  - `id`: UUID (references auth.users)
  - `email`: User's email
  - `full_name`: User's full name
  - `company_name`: User's company
  - `role`: User's role
  - `created_at`: Timestamp
  - `updated_at`: Timestamp
  - Protected by RLS policies

- `domain_settings`: Email domain configuration
  - `id`: UUID primary key
  - `user_id`: References auth.users(id)
  - `domain`: Domain name
  - `status`: Enum ('pending', 'verified', 'failed', 'sender_pending')
  - `dns_records`: JSONB array of required DNS records
  - `sendgrid_domain_id`: SendGrid domain identifier
  - `sender_email`: Verified sender email address
  - `sender_verified`: Boolean
  - `created_at`: Timestamp
  - `updated_at`: Timestamp
  - Protected by RLS policies

- `email_events`: Email tracking and analytics
  - `id`: UUID primary key
  - `email_id`: References emails(id)
  - `campaign_id`: References campaigns(id)
  - `user_id`: References auth.users(id)
  - `event_type`: Enum ('processed', 'dropped', 'delivered', 'deferred', 'bounce', 'blocked', 'spam_report', 'unsubscribe', 'open', 'click')
  - `event_data`: JSONB for event details
  - `occurred_at`: Timestamp
  - `created_at`: Timestamp
  - Indexed for performance
  - Protected by RLS policies

- `rate_limits`: Email sending rate management
  - `id`: UUID primary key
  - `user_id`: References auth.users(id)
  - `window_count`: Current minute's request count
  - `daily_count`: Current day's email count
  - `last_window`: Timestamp of last rate limit window
  - `created_at`: Timestamp
  - `updated_at`: Timestamp
  - Protected by RLS policies

- `rate_limit_logs`: Rate limit monitoring
  - `id`: UUID primary key
  - `user_id`: References auth.users(id)
  - `event_type`: Enum ('success', 'exceeded')
  - `request_count`: Number of requests in window
  - `window_key`: Timestamp of rate limit window
  - `metadata`: JSONB for additional data
  - `created_at`: Timestamp
  - Protected by RLS policies

- `email_errors`: Error tracking and retry management
  - `id`: UUID primary key
  - `email_id`: References emails(id)
  - `campaign_id`: References campaigns(id)
  - `user_id`: References auth.users(id)
  - `error_type`: Error classification
  - `error_message`: Detailed error message
  - `error_stack`: Error stack trace
  - `context`: JSONB for error context
  - `retry_count`: Number of retry attempts
  - `last_retry_at`: Timestamp of last retry
  - `next_retry_at`: Timestamp for next retry
  - `status`: Enum ('pending', 'retrying', 'resolved', 'failed')
  - `created_at`: Timestamp
  - `updated_at`: Timestamp
  - Protected by RLS policies

- `campaigns`: Marketing campaign details
- `contacts`: Contact information and engagement metrics
- `contact_lists`: Grouped contacts for targeted campaigns
- `contact_list_members`: Junction table for contacts in lists
- `emails`: Email content and scheduling
- `analytics`: Campaign performance metrics
- `ai_logs`: AI generation tracking

### Recent Implementations

#### Campaign CTA Links System
- Sequence-specific Call-to-Action (CTA) links
  - Awareness sequence links for educational content
  - Conversion sequence links for sign-ups/purchases
  - Nurture sequence links for relationship building
- Automatic CTA inclusion in generated emails
- Links stored in campaign settings
- Real-time CTA link updates
- Proper validation and error handling

#### Notifications System
- **Database Structure**
  - `notifications` table with fields:
    - `id`: UUID primary key
    - `user_id`: References auth.users(id)
    - `title`: Notification title
    - `message`: Detailed notification message
    - `type`: Enum ('success', 'error', 'info', 'warning')
    - `status`: Enum ('read', 'unread')
    - `metadata`: JSONB for flexible data storage
      - Supports `action` object with `label` and `url` for clickable notifications
    - `created_at` and `updated_at`: Timestamps with UTC timezone

- **Security Implementation**
  - Row Level Security (RLS) policies:
    - Users can view their own notifications
    - Users can update their own notifications (e.g., marking as read)
    - Users can delete their own notifications
    - Service role has full access for system-generated notifications

- **Real-time Updates**
  - Supabase real-time subscriptions for instant UI updates
  - Handles INSERT, UPDATE, and DELETE events
  - Filters notifications by user_id for data efficiency
  - Maintains local state synchronization with database

- **Campaign Integration**
  - Automatic notifications for sequence generation:
    1. Start notification: "Generating Sequence for [Campaign Name]"
    2. Progress updates: "Generated X of Y emails (Z% complete)"
    3. Completion notification: "Sequence Generation Complete for [Campaign Name]"
       - Includes clickable action to view generated sequence
       - Direct navigation to campaign's emails tab
  - Notification types reflect operation status:
    - 'info' for generation start
    - 'success' for completion
    - 'error' for failures
    - 'warning' for important alerts

- **UI Components**
  - `NotificationsPopover`: Global notification access
    - Bell icon with unread count
    - Popover display on click
    - Real-time unread count updates
  - `NotificationsList`: Notification management
    - Displays notifications in reverse chronological order
    - Visual styling based on notification type
    - Individual and bulk actions:
      - Mark as read/unread
      - Delete individual notifications
      - Clear all notifications
    - Action buttons for notifications with metadata.action
    - Auto-dismissing success messages (6.5 seconds)

- **Hook Implementation**
  - `useNotifications` hook provides:
    - Notification state management
    - CRUD operations:
      - `createNotification`: Create new notifications
      - `markAsRead`: Update notification status
      - `deleteNotification`: Remove single notification
      - `deleteAllNotifications`: Clear all user notifications
    - Real-time subscription management
    - Loading and error states
    - Automatic cleanup on unmount

- **Performance Optimizations**
  - Limit of 50 most recent notifications
  - Indexed queries for faster retrieval
  - Memoized unread count calculation
  - Efficient state updates using React state updater functions
  - Proper cleanup of real-time subscriptions

- **Error Handling**
  - Graceful error management for all operations
  - Clear error messages in console
  - User-friendly error states in UI
  - Automatic retry mechanism for failed operations
  - Proper type safety with TypeScript

This notification system provides real-time feedback for campaign operations, enhancing user experience with immediate updates on sequence generation progress and other important events.

#### User Profile System
- Automatic profile creation on user signup via database trigger
- Profile management interface with fields:
  - Email (read-only)
  - Full Name
  - Company Name
  - Role
- Real-time profile updates
- Proper error handling and fallback mechanisms
- RLS policies for data security:
  - Users can view their own profile
  - Users can update their own profile
  - Users can insert their own profile
  - Automatic profile creation on signup

#### Contact Import System
- CSV file upload with preview
- Field mapping interface
- Handling of missing email addresses
- Batch processing for large imports
- Real-time validation and error handling

#### Contact Lists Feature
- Different list types (manual, dynamic, segment)
- List management interface
- Contact engagement tracking
- Automatic scoring system

#### SendGrid Email Integration
- **Email Service Architecture**
  - Modular provider-based design
  - Support for multiple email providers (SendGrid, Mock for testing)
  - Singleton pattern for service management
  - Comprehensive interface definitions for email operations

- **SendGrid Provider Implementation**
  - Full SendGrid API integration with TypeScript types
  - Features:
    - Email sending with HTML content
    - Domain verification and management
    - Sender verification system
    - Rate limiting and quota management
    - Comprehensive error handling
  - Security:
    - API key management
    - Domain verification records
    - Sender verification process
    - Rate limit enforcement

- **Email Service Features**
  - Daily sending limits (100 emails/day for free tier)
  - Rate limiting (1 second between emails)
  - Automatic retry mechanism
  - Error logging and monitoring
  - Domain verification status tracking
  - Sender verification workflow
  - Cache management for API responses

#### Testing Suite Implementation
- **Comprehensive Test Coverage**
  - Unit tests for all core functionality
  - Integration tests for email operations
  - Mock provider for testing without API calls
  - Proper error case coverage
  - Rate limit testing
  - Retry mechanism verification

- **Test Infrastructure**
  - Vitest test runner configuration
  - Mock implementations for external services
  - Type-safe test utilities
  - Proper test isolation
  - Automatic test environment setup/teardown

- **Mock System**
  - Mock email provider for testing
  - Simulated rate limits and quotas
  - Configurable delay simulation
  - Error scenario simulation
  - Type-safe mock implementations

- **Test Categories**
  - Service initialization tests
  - Provider switching tests
  - Email sending operation tests
  - Domain verification tests
  - Sender verification tests
  - Rate limiting tests
  - Error handling tests
  - Mock provider tests

- **CI/CD Integration**
  - Automated test runs
  - Coverage reporting
  - Test environment variables
  - Proper secret management
  - Test failure reporting

#### Scheduler Test Implementation
- **Test Suite Architecture**
  - Comprehensive test coverage for email scheduling system
  - Proper mocking of Supabase client and EmailService
  - Environment variable management for testing
  - Detailed test cases for various scenarios

- **Mock Implementation Details**
  1. **Supabase Client Mocking**
     - Proper method chaining simulation:
       ```typescript
       from().select().eq().lte() // for fetching emails
       from().update().eq()       // for updating status
       ```
     - Accurate response structure matching:
       - Mock email data with all required fields
       - Proper error handling simulation
       - Correct status codes and responses

  2. **Environment Variables**
     - Test-specific environment setup:
       - Supabase URL and service role key
       - SendGrid API key
       - Test mode indicators
     - Proper cleanup between tests

  3. **EmailService Mocking**
     - Simulated email sending functionality
     - Error case handling
     - Success/failure scenarios

- **Test Cases**
  1. **Successful Email Sending**
     - Verifies proper email processing
     - Checks status updates
     - Validates response format
     - Ensures correct sent count

  2. **No Due Emails Scenario**
     - Tests empty response handling
     - Validates appropriate message
     - Checks zero sent count
     - Ensures proper status code

  3. **Email Sending Failures**
     - Tests error handling
     - Verifies status updates
     - Checks error logging
     - Validates response format

- **Implementation Improvements**
  1. **Mock Data Structure**
     - Properly structured email objects
     - Complete metadata inclusion
     - Accurate timestamp handling
     - Correct status management

  2. **Method Chaining**
     - Accurate representation of Supabase queries
     - Proper promise resolution
     - Correct error handling
     - Maintained state between calls

  3. **Response Handling**
     - Proper status code checking
     - Accurate success/failure messages
     - Correct data structure
     - Appropriate error formats

This implementation ensures reliable testing of the email scheduling system, with proper isolation of dependencies and comprehensive coverage of various scenarios.

### Testing Workflow
1. **Local Development Testing**
   - Run tests: `npm test`
   - Watch mode: `npm test -- --watch`
   - Coverage report: `npm run test:coverage`
   - UI test runner: `npm run test:ui`

2. **Test Environment Setup**
   ```bash
   # Create test environment file
   cp .env.example .env.test

   # Configure test variables
   SUPABASE_URL=http://localhost:54321
   SUPABASE_SERVICE_ROLE_KEY=test-service-role-key
   SENDGRID_API_KEY=test-sendgrid-key
   SENDGRID_WEBHOOK_KEY=test-webhook-key
   ```

3. **Running Specific Tests**
   ```bash
   # Run email service tests
   npm test src/lib/email/__tests__/email.service.test.ts

   # Run all tests in a directory
   npm test src/lib/email/__tests__/

   # Run tests matching a pattern
   npm test -- -t "should send email"
   ```

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
