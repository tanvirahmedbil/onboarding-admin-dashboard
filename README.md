# Onboarding Admin Dashboard

Read-only live reporting for the separate Digital Marketing and SEO onboarding trackers.

## What it reports

- Separate workspace cards with direct links to each tracker
- Current and prior month completed, timely, delayed, and on-time delivery metrics
- Active overdue project queue
- Searchable completed-delivery log
- Live Firestore listeners, no manual refresh required

## Data model and KPI rules

The dashboard reads `dmProjects` for Digital Marketing and `projects` for SEO. A project is timely when `completedAt` is on or before `dueDate`. Completed projects with no due date are shown as **No due date** and excluded from the on-time rate. Active projects with a past due date are shown in the attention queue.

For dependable reporting, ensure each tracker stores an immutable `dueDate` and `completedAt` value.

## Netlify deployment

Set these **Production** build environment variables in Netlify:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_DM_TOOL_URL=https://your-dm-tracker.netlify.app
NEXT_PUBLIC_SEO_TOOL_URL=https://your-seo-tracker.netlify.app
NODE_VERSION=22
```

Build command: `npm run build`  
Publish directory: `out`

The dashboard needs Firestore read access to both collections. Do not publish this dashboard publicly if those rules allow anonymous reads. Protect it with Netlify access controls before sharing it beyond administrators.
