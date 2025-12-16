# Reveal SDK – AI Integration Prompt

This document provides a ready-to-use prompt for AI IDEs (Cursor, Claude, etc.) to integrate the Reveal SDK into a codebase. Copy this prompt into your AI IDE alongside your codebase and the Reveal SDK repository.

---

## AI Integration Prompt

**Copy this prompt into your AI IDE (Cursor/Claude) alongside your codebase and the Reveal SDK repository:**

```
You are an AI assistant helping to integrate the Reveal SDK into a web application.

Your goal: Integrate @reveal/client and @reveal/overlay-react into the codebase following the exact patterns from the Reveal SDK README and the harness app reference implementation.

## Context Understanding

Before starting, analyze the codebase to understand:
1. **Framework**: Is this Next.js (App Router or Pages Router), Create React App, Vite, or another React framework?
2. **Project Structure**: Where are components, providers, and layout files located?
3. **Environment Configuration**: How are environment variables and dev/prod configs handled?
4. **Package Manager**: npm, pnpm, yarn, or bun?
5. **TypeScript**: Is TypeScript used? What's the tsconfig setup?

## Hard Constraints (MUST FOLLOW)

1. **Single Initialization**: `Reveal.init()` MUST be called exactly once at app startup
2. **OverlayManager Mounting**: `OverlayManager` MUST be mounted at the root level (layout or app root)
3. **No Breaking Changes**: Do NOT modify existing functionality, only add Reveal integration
4. **Type Safety**: Maintain full TypeScript type safety if TypeScript is used
5. **Environment Awareness**: Use environment variables for dev/prod configuration
6. **Error Handling**: SDK initialization must not break the app if it fails

## Integration Steps (Execute in Order)

### Step 1: Install Dependencies

Add the Reveal packages to package.json:

```bash
npm install @reveal/client @reveal/overlay-react
```

**Verification**: Confirm both packages are added to dependencies in package.json.

### Step 2: Create RevealContextProvider Component

Create a new component file (location depends on framework):
- **Next.js App Router**: `app/reveal-context-provider.tsx` or `components/RevealContextProvider.tsx`
- **Next.js Pages Router**: `components/RevealContextProvider.tsx`
- **Create React App**: `src/components/RevealContextProvider.tsx`
- **Vite**: `src/components/RevealContextProvider.tsx`

**Template Code**:

```tsx
'use client'; // Only for Next.js App Router

import React, { useEffect } from 'react';
import { Reveal, useNudgeDecision } from '@reveal/client';
import { OverlayManager } from '@reveal/overlay-react';

export function RevealContextProvider({ children }: { children: React.ReactNode }) {
  const { decision, handlers } = useNudgeDecision();

  useEffect(() => {
    // Detect environment
    const isDevelopment = process.env.NODE_ENV === 'development';

    // Configure based on environment
    const config = {
      // Use environment variable or default
      clientKey: process.env.NEXT_PUBLIC_REVEAL_CLIENT_KEY || 'your-client-key',
      
      environment: (isDevelopment ? 'development' : 'production') as 'development' | 'production',
      
      // Events endpoint (ingest)
      ingestEndpoint: process.env.NEXT_PUBLIC_REVEAL_INGEST_ENDPOINT || 
        (isDevelopment 
          ? 'http://localhost:3000/ingest'  // Adjust if local dev server differs
          : 'https://api.reveal.io/ingest'),
      
      // Decision endpoint
      decisionEndpoint: process.env.NEXT_PUBLIC_REVEAL_DECIDE_ENDPOINT || 
        (isDevelopment 
          ? 'http://localhost:3000/decide'  // Adjust if local dev server differs
          : 'https://api.reveal.io/decide'),
      
      // Timeout: longer for dev (CORS preflight + logging), realistic for prod (network + backend processing)
      decisionTimeoutMs: isDevelopment ? 2000 : 400,
      
      // Debug logging in development only
      debug: isDevelopment,
    };

    // Initialize SDK (must be awaited)
    (async () => {
      try {
        await Reveal.init(config.clientKey, config);
      } catch (error) {
        // Fail gracefully - don't break the app
        console.error('[Reveal SDK] Initialization failed:', error);
      }
    })();
  }, []);

  // Always render OverlayManager (it handles null decisions internally)
  // This prevents React Fast Refresh issues with conditional rendering
  return (
    <>
      {children}
      <OverlayManager 
        decision={decision} 
        onDismiss={handlers.onDismiss}
        onActionClick={handlers.onActionClick}
        onTrack={handlers.onTrack}
      />
    </>
  );
}
```

**Framework-Specific Adjustments**:
- **Next.js App Router**: Keep `'use client'` directive
- **Next.js Pages Router**: Remove `'use client'` directive
- **Create React App / Vite**: Remove `'use client'` directive, use `import.meta.env` for Vite env vars

**Verification Checklist**:
- [ ] Component file created in appropriate location
- [ ] Imports are correct (`@reveal/client`, `@reveal/overlay-react`)
- [ ] `useNudgeDecision()` hook is used
- [ ] `Reveal.init()` is called with `await` inside `useEffect`
- [ ] Environment detection logic is present
- [ ] `OverlayManager` is rendered with all required props
- [ ] Error handling wraps `Reveal.init()` call

### Step 3: Mount Provider at App Root

Mount `RevealContextProvider` at the root of the application:

**Next.js App Router** (`app/layout.tsx`):
```tsx
import { RevealContextProvider } from './reveal-context-provider'; // or './components/RevealContextProvider'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <RevealContextProvider>{children}</RevealContextProvider>
      </body>
    </html>
  );
}
```

**Next.js Pages Router** (`pages/_app.tsx`):
```tsx
import { RevealContextProvider } from '../components/RevealContextProvider';

export default function App({ Component, pageProps }) {
  return (
    <RevealContextProvider>
      <Component {...pageProps} />
    </RevealContextProvider>
  );
}
```

**Create React App** (`src/index.tsx`):
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RevealContextProvider } from './components/RevealContextProvider';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RevealContextProvider>
    <App />
  </RevealContextProvider>
);
```

**Verification Checklist**:
- [ ] `RevealContextProvider` wraps the entire app
- [ ] Provider is mounted at the root level (layout or app entry point)
- [ ] No TypeScript errors
- [ ] App still renders correctly

### Step 4: Template Core Event Instrumentation

Add event tracking templates to key user actions. **Note**: Full instrumentation requires product knowledge, but these templates provide a starting point.

**Template 1: Navigation Events**

Add to navigation components (sidebar, menu, tabs):

```tsx
import { Reveal } from '@reveal/client';

// In navigation click handler
const handleNavClick = (route: string, label: string) => {
  Reveal.track('product', 'navigation_clicked', {
    action_id: `nav_${route.replace('/', '_')}`,
    flow_id: 'main_nav',
    route,
    label,
  });
  // ... existing navigation logic
};
```

**Template 2: Form Submission Events**

Add to form submit handlers:

```tsx
import { Reveal } from '@reveal/client';

const handleSubmit = async (formData: FormData) => {
  try {
    // ... existing form submission logic
    
    // Track successful form submission
    Reveal.track('product', 'form_submitted', {
      action_id: 'signup_form_submit',
      flow_id: 'onboarding',
      step: 2,
      success: true,
      formId: 'signup', // or form name
      // Add other relevant fields (avoid PII)
    });
  } catch (error) {
    // Track failed form submission
    Reveal.track('product', 'form_submitted', {
      action_id: 'signup_form_submit',
      flow_id: 'onboarding',
      step: 2,
      success: false,
      formId: 'signup',
    });
  }
};
```

**Template 3: Button/Action Click Events**

Add to important button click handlers:

```tsx
import { Reveal } from '@reveal/client';

const handleButtonClick = (buttonId: string, action: string) => {
  Reveal.track('product', 'button_clicked', {
    action_id: `${buttonId}_click`,
    flow_id: 'onboarding', // optional, adjust based on context
    buttonId,
    action,
    page: window.location.pathname, // or use router if available
  });
  
  // ... existing button logic
};
```

**Template 4: Entity Creation Events**

Add to create/update handlers (projects, tasks, items, etc.):

```tsx
import { Reveal } from '@reveal/client';

const handleCreate = async (entityType: string, entityId: string, metadata?: Record<string, any>) => {
  try {
    // ... existing creation logic
    
    // Track successful entity creation
    Reveal.track('product', `${entityType}_created`, {
      action_id: `${entityType}_created`,
      flow_id: 'entity_management', // optional, adjust based on context
      success: true,
      [`${entityType}Id`]: entityId,
      ...metadata, // Add relevant metadata (avoid PII)
    });
  } catch (error) {
    // Track failed entity creation
    Reveal.track('product', `${entityType}_created`, {
      action_id: `${entityType}_created`,
      flow_id: 'entity_management',
      success: false,
      [`${entityType}Id`]: entityId,
    });
  }
};
```

**Template 5: State Change Events**

Add to state transition handlers (status changes, moves, etc.):

```tsx
import { Reveal } from '@reveal/client';

const handleStateChange = (entityId: string, fromState: string, toState: string, step?: number) => {
  Reveal.track('product', 'state_changed', {
    action_id: 'state_changed',
    flow_id: 'workflow', // optional, adjust based on context
    step, // optional step number
    entityId,
    fromState,
    toState,
  });
  
  // ... existing state change logic
};
```

**Important Notes**:
- **DO NOT** automatically instrument all events - only add templates where they make sense
- **DO NOT** include PII in event payloads (email, phone, password, tokens, etc.)
- **DO** use descriptive event names (e.g., `task_created`, `project_updated`)
- **DO** include relevant metadata (IDs, states, types) but avoid sensitive data

**Verification Checklist**:
- [ ] Event tracking templates added to key user actions
- [ ] No PII included in event payloads
- [ ] Event names follow pattern: `{entity}_{action}` (e.g., `task_created`, `button_clicked`)
- [ ] Existing functionality unchanged

### Step 5: Environment Variables Setup

Create or update `.env.local` (or `.env`) with Reveal configuration:

```bash
# Reveal SDK Configuration
NEXT_PUBLIC_REVEAL_CLIENT_KEY=your-client-key-here
NEXT_PUBLIC_REVEAL_INGEST_ENDPOINT=https://api.reveal.io/ingest
NEXT_PUBLIC_REVEAL_DECIDE_ENDPOINT=https://api.reveal.io/decide
```

**Note**: For non-Next.js apps, use framework-specific env var patterns:
- **Vite**: `VITE_REVEAL_CLIENT_KEY`
- **Create React App**: `REACT_APP_REVEAL_CLIENT_KEY`

**Verification Checklist**:
- [ ] Environment variables file created/updated
- [ ] `.env.local` is in `.gitignore` (if it contains secrets)
- [ ] Example values provided for development

### Step 6: Self-Check Auditability

Run these verification checks:

**Check 1: SDK Initialization**
- [ ] `Reveal.init()` is called exactly once
- [ ] `Reveal.init()` is called at app startup (not in a component that re-renders)
- [ ] `Reveal.init()` is awaited (async/await)
- [ ] Error handling wraps initialization

**Check 2: OverlayManager Mounting**
- [ ] `OverlayManager` is mounted at root level
- [ ] `OverlayManager` receives `decision`, `onDismiss`, `onActionClick`, `onTrack` props
- [ ] `OverlayManager` is always rendered (not conditionally)
- [ ] No TypeScript errors related to `OverlayManager`

**Check 3: Event Tracking**
- [ ] `Reveal.track()` calls use correct signature: `Reveal.track(kind, type, payload?)`
- [ ] Event payloads are flat objects (no nested objects with PII)
- [ ] No PII in event payloads (email, phone, password, tokens, etc.)
- [ ] Event names are descriptive and follow naming conventions

**Check 4: Dependencies**
- [ ] `@reveal/client` is in dependencies
- [ ] `@reveal/overlay-react` is in dependencies
- [ ] No version conflicts with React (requires React >= 18.0.0)

**Check 5: Build & Runtime**
- [ ] App builds without errors
- [ ] App runs without runtime errors
- [ ] No console errors related to Reveal SDK
- [ ] OverlayManager renders (check React DevTools)

**Check 6: Framework-Specific**
- [ ] Next.js App Router: `'use client'` directive present in provider component
- [ ] Next.js Pages Router: No `'use client'` directive
- [ ] Environment variables are prefixed correctly (`NEXT_PUBLIC_`, `VITE_`, etc.)

## Output Format

After completing integration, provide:

1. **Summary**: Brief overview of what was integrated
2. **Files Modified/Created**: List of files changed
3. **Verification Results**: Pass/fail for each self-check item
4. **Next Steps**: 
   - Get client key from Reveal dashboard
   - Update environment variables
   - Test integration in development
   - Add more event tracking as needed (requires product knowledge)

## Reference Implementation

For a complete working example, see:
- `apps/harness/src/app/reveal-client-provider.tsx` - Provider implementation
- `apps/harness/src/app/layout.tsx` - Provider mounting
- `apps/harness/src/components/sidebar.tsx` - Navigation event tracking
- `apps/harness/src/context/ProjectsContext.tsx` - Entity creation tracking

## Important Notes

- **PII Scrubbing**: The SDK automatically scrubs PII from event payloads, but you should still avoid sending PII
- **Friction Detection**: Friction signals (stall, rage click, backtrack) are automatically detected - no manual tracking needed
- **Nudge Display**: Nudges are automatically displayed by `OverlayManager` when backend decides to show them
- **Debug Mode**: Enable `debug: true` in development to see SDK logs
- **Error Handling**: SDK errors never break the host application (fail-open behavior)
```

---

## Usage Instructions

1. **Open your AI IDE** (Cursor, Claude Desktop, etc.)
2. **Load your codebase** into the AI IDE context
3. **Load the Reveal SDK repository** into the AI IDE context (or provide access to `packages/README.md` and `apps/harness` reference)
4. **Copy the AI Integration Prompt above** into a chat with your AI IDE
5. **Let the AI analyze and integrate** - it will follow the step-by-step instructions
6. **Review the integration** - verify all self-check items pass
7. **Test the integration** - ensure the app builds and runs correctly

## What the AI Will Do

The AI will:
- ✅ Analyze your codebase structure and framework
- ✅ Install `@reveal/client` and `@reveal/overlay-react` packages
- ✅ Create `RevealContextProvider` component with proper configuration
- ✅ Mount the provider at app root
- ✅ Template core event instrumentation (navigation, forms, buttons, etc.)
- ✅ Set up environment variables
- ✅ Run self-check auditability verification
- ✅ Provide integration summary and next steps

## What the AI Won't Do

The AI will **NOT**:
- ❌ Automatically instrument all events (requires product knowledge)
- ❌ Add PII to event payloads (you must avoid this)
- ❌ Break existing functionality
- ❌ Make assumptions about your product's event tracking needs

## Troubleshooting

If integration fails:

1. **Check Framework Detection**: Ensure the AI correctly identified your framework
2. **Verify Dependencies**: Confirm packages are installed correctly
3. **Check Environment Variables**: Ensure env vars are set correctly
4. **Review Error Messages**: SDK errors are logged to console (enable `debug: true`)
5. **Reference Implementation**: Compare with `apps/harness` implementation

## Next Steps After Integration

1. **Get Client Key**: Obtain your Reveal client key from the Reveal dashboard
2. **Update Environment Variables**: Set `NEXT_PUBLIC_REVEAL_CLIENT_KEY` (or framework equivalent)
3. **Test in Development**: Run the app and verify SDK initializes correctly
4. **Add Event Tracking**: Instrument key user actions based on your product knowledge
5. **Monitor**: Check Reveal dashboard to see events and nudge decisions

---

For questions or issues, see:
- **SDK README** → [../README.md](../README.md)
- **API Reference** → [API.md](./API.md)
- **Event Types** → [EVENTS.md](./EVENTS.md)

