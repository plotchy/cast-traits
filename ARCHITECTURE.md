# Trait Explorer Architecture

## Overview

A dynamic data exploration tool that allows non-technical users to analyze 12,000 social media posts (casts) by creating custom traits using natural language. The entire dataset lives in the user's browser for performance and privacy.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **UI**: React 18+ with Tailwind CSS (Shadcn)
- **State Management**: Zustand or React Context
- **Charts**: Recharts or Chart.js
- **LLM Integration**: OpenRouter API (or similar)
- **Data Processing**: Client-side JavaScript
- **Deployment**: Vercel (ideal for Next.js)

## Architecture Decisions

### 1. Client-Side Data Processing

**Decision**: Load entire 9MB JSON dataset into browser memory.

**Rationale**:
- 9MB is manageable for modern browsers
- Eliminates server round-trips for filtering/analysis
- Enables instant, responsive interactions
- Preserves privacy (data never leaves browser)

**Implementation**:
```javascript
// Load data on initial page load
useEffect(() => {
  fetch('/data/casts.json')
    .then(res => res.json())
    .then(data => {
      // Initialize casts with empty traits array
      const castsWithTraits = data.casts.map(cast => ({
        ...cast,
        traits: []
      }));
      setCasts(castsWithTraits);
    });
}, []);
```

### 2. LLM-Powered Trait Generation

**Decision**: Use API routes to proxy LLM requests, keeping API key secure.

**Flow**:
1. User enters plain English trait description
2. Client sends request to `/api/generate-trait`
3. API route calls LLM with structured prompt
4. LLM returns JavaScript function as string
5. Client evaluates function and applies to all casts

**Example API Route**:
```javascript
// app/api/generate-trait/route.js
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: '<OPENROUTER_API_KEY>',
  defaultHeaders: {
    'HTTP-Referer': '<YOUR_SITE_URL>', // Optional. Site URL for rankings on openrouter.ai.
    'X-Title': '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
  },
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: 'openai/gpt-4o',
    messages: [
      {
        role: 'user',
        content: 'What is the meaning of life?',
      },
    ],
  });

  console.log(completion.choices[0].message);
}

main();

```

### 3. Dynamic Trait System

**Data Structure**:
```javascript
// Global traits registry
const traits = {
  "contains_emoji": {
    description: "Posts containing emoji",
    code: "(cast) => /[\u{1F300}-\u{1F9FF}]/u.test(cast.text)",
    created_at: "2024-03-14T10:00:00Z"
  },
  "has_image": {
    description: "Posts with image embeds",
    code: "(cast) => cast.embeds?.some(e => e.url?.match(/\.(jpg|png|gif)/i))",
    created_at: "2024-03-14T10:01:00Z"
  }
};

// Each cast maintains its trait list
cast.traits = ["contains_emoji", "has_image", "is_question"];
```

### 4. Real-Time Statistics

**Computed in useMemo for performance**:
```javascript
const statistics = useMemo(() => {
  // Calculate all stats from current cast data
  const traitDistribution = {};
  const traitCounts = {};
  
  casts.forEach(cast => {
    // Count traits per cast
    const numTraits = cast.traits.length;
    traitDistribution[numTraits] = (traitDistribution[numTraits] || 0) + 1;
    
    // Count occurrences of each trait
    cast.traits.forEach(trait => {
      traitCounts[trait] = (traitCounts[trait] || 0) + 1;
    });
  });
  
  return { traitDistribution, traitCounts };
}, [casts]);
```

## File Structure

```
trait-explorer/
├── app/
│   ├── page.js                    # Main explorer interface
│   ├── layout.js                  # Root layout
│   ├── api/
│   │   └── generate-trait/
│   │       └── route.js           # LLM trait generation endpoint
│   └── components/
│       ├── TraitGenerator.js      # Input for new traits
│       ├── TraitList.js           # Active traits management
│       ├── StatsD ashboard.js     # Charts and statistics
│       ├── CastViewer.js          # Filtered cast display
│       └── TraitCodeViewer.js     # Show/debug trait code
├── public/
│   └── data/
│       └── casts.json             # 9MB dataset
├── lib/
│   ├── traits.js                  # Trait execution logic
│   ├── statistics.js              # Stats calculation utilities
│   └── llm.js                     # LLM integration helpers
└── store/
    └── useTraitStore.js           # Zustand store
```

## Key Components

### 1. TraitGenerator Component
- Text input for natural language descriptions
- Loading state during LLM generation
- Error handling for failed generations
- Preview of generated code before applying

### 2. StatsD ashboard Component
- **Coverage Chart**: Pie chart of casts with 0, 1, 2, 3+ traits
- **Distribution Chart**: Bar chart of exact trait counts
- **Trait Ranking**: Table of traits by popularity
- **Intersection Analysis**: Which traits commonly appear together

### 3. CastViewer Component
- Virtual scrolling for 12k items
- Filter by trait combinations
- Search within filtered results
- Export filtered dataset

## Performance Optimizations

### 1. Virtual Scrolling
```javascript
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={filteredCasts.length}
  itemSize={120}
  width="100%"
>
  {({ index, style }) => (
    <CastItem cast={filteredCasts[index]} style={style} />
  )}
</FixedSizeList>
```

### 2. Web Workers for Trait Processing
```javascript
// trait-worker.js
self.onmessage = function(e) {
  const { casts, traitCode } = e.data;
  const testFunction = eval(`(${traitCode})`);
  
  const results = casts.map(cast => ({
    id: cast.hash,
    matches: testFunction(cast)
  }));
  
  self.postMessage(results);
};
```

### 3. Debounced Updates
```javascript
const debouncedApplyTrait = useMemo(
  () => debounce((traitName, testFunction) => {
    applyTraitToAllCasts(traitName, testFunction);
  }, 300),
  []
);
```

## Security Considerations

### 1. Code Execution Safety
```javascript
// Sandbox trait execution
const executeTrait = (code, cast) => {
  try {
    // Create limited context
    const sandboxedCast = {
      text: cast.text,
      timestamp: cast.timestamp,
      reactions: { ...cast.reactions },
      replies: { ...cast.replies },
      embeds: cast.embeds?.map(e => ({ ...e }))
    };
    
    // Execute with error boundary
    const fn = new Function('cast', `return (${code})(cast)`);
    return fn(sandboxedCast);
  } catch (error) {
    console.error('Trait execution error:', error);
    return false;
  }
};
```

### 2. API Key Protection
- Never expose LLM API key to client
- Use Next.js API routes as proxy
- Implement rate limiting
- Add basic auth for private deployment

## Deployment Strategy

### 1. Build Optimization
```javascript
// next.config.js
module.exports = {
  output: 'standalone',
  compress: true,
  images: {
    domains: ['i.imgur.com', 'imagedelivery.net']
  }
};
```

### 2. Data Loading Strategy
```javascript
// Option 1: Static import (built into bundle)
import castsData from '../public/data/casts.json';

// Option 2: Dynamic fetch (better for updates)
const response = await fetch('/data/casts.json');
const data = await response.json();

// Option 3: CDN hosted
const response = await fetch('https://cdn.example.com/casts.json');
```

### 3. Environment Variables
```bash
# .envtemplate
OPENROUTER_API_KEY=sk-...
NEXT_PUBLIC_APP_URL=https://trait-explorer.vercel.app
```

## Future Enhancements

1. **Trait Persistence**
   - Save traits to localStorage
   - Export/import trait definitions
   - Share trait sets via URL

2. **Advanced Analysis**
   - Trait correlation matrix
   - Time-based trait trends
   - Author-based trait analysis

3. **Collaboration Features**
   - Share filtered views
   - Export trait reports
   - Trait suggestion system

## Example Trait Implementations

```javascript
// Engagement-based traits
{
  "high_engagement": {
    code: "(cast) => (cast.reactions.likes_count + cast.reactions.recasts_count) > 100"
  },
  "conversation_starter": {
    code: "(cast) => cast.replies.count > 10"
  },
  "quote_cast": {
    code: "(cast) => cast.embeds?.some(e => e.cast)"
  },
  "media_post": {
    code: "(cast) => cast.embeds?.some(e => e.url && !e.cast)"
  },
  "morning_post": {
    code: "(cast) => { if (!cast.timestamp) return false; const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit' }).formatToParts(new Date(cast.timestamp)); const h = Number(parts.find(p => p.type === 'hour')?.value ?? '-1'); return !Number.isNaN(h) && h < 12; }"
  },
  "contains_url": {
    code: "(cast) => /https?:\/\/[^\s]+/.test(cast.text)"
  },
  "mention_heavy": {
    code: "(cast) => (cast.text.match(/@\w+/g) || []).length > 3"
  }
}
```

This architecture provides a robust, scalable foundation for exploring large datasets through natural language, while keeping the implementation simple enough for rapid iteration and maintenance.