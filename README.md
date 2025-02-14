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
