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
