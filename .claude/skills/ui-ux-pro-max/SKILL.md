---
name: "ui-ux-pro-max"
description: "Provides design intelligence for building professional UI/UX across multiple platforms. Invoke when user requests UI/UX design, landing pages, dashboards, mobile apps, or design system generation."
---

# UI/UX Pro Max Skill

An AI skill that provides design intelligence for building professional UI/UX across multiple platforms and frameworks.

## When to Invoke

- User requests to build/design/create a landing page
- User asks for dashboard design
- User needs mobile app UI
- User wants design system generation
- User asks for UI/UX improvements or reviews
- User mentions specific styles (glassmorphism, neumorphism, etc.)

## Design System Generation Workflow

### 1. Multi-Domain Analysis
When user requests UI/UX work, analyze across 5 domains:
- **Product Type** (161 categories) - Match to UI category rules
- **Style** (67 styles) - Apply style priorities with BM25 ranking
- **Color Palette** (161 palettes) - Industry-appropriate selection
- **Landing Page Pattern** (24 patterns) - Structure recommendation
- **Typography** (57 font combinations) - Font personality matching

### 2. Reasoning Engine Output
Generate complete design system:
```
PATTERN: [Pattern Name] + [Key Features]
   Conversion: [Strategy]
   CTA: [Placement strategy]
   Sections: [1. X, 2. Y, 3. Z...]

STYLE: [Style Name]
   Keywords: [Descriptors]
   Best For: [Use cases]
   Performance: [Rating] | Accessibility: [Standard]

COLORS:
   Primary:    #[HEX] ([Name])
   Secondary:  #[HEX] ([Name])
   CTA:        #[HEX] ([Name])
   Background: #[HEX] ([Name])
   Text:       #[HEX] ([Name])
   Notes: [Usage guidance]

TYPOGRAPHY: [Font Pairing]
   Mood: [Descriptors]
   Best For: [Use cases]
   Google Fonts: [URL]

KEY EFFECTS:
   [Effect 1] + [Effect 2] + [Effect 3]

AVOID (Anti-patterns):
   [Anti-pattern 1] + [Anti-pattern 2] + [Anti-pattern 3]

PRE-DELIVERY CHECKLIST:
   [ ] No emojis as icons (use SVG: Heroicons/Lucide)
   [ ] cursor-pointer on all clickable elements
   [ ] Hover states with smooth transitions (150-300ms)
   [ ] Light mode: text contrast 4.5:1 minimum
   [ ] Focus states visible for keyboard nav
   [ ] prefers-reduced-motion respected
   [ ] Responsive: 375px, 768px, 1024px, 1440px
```

## Popular Styles Reference

### General Styles (Top 15)
| # | Style | Best For |
|---|-------|----------|
| 1 | Minimalism & Swiss Style | Enterprise apps, dashboards |
| 2 | Neumorphism | Health/wellness apps |
| 3 | Glassmorphism | Modern SaaS, financial dashboards |
| 4 | Brutalism | Design portfolios, artistic |
| 5 | 3D & Hyperrealism | Gaming, product showcase |
| 6 | Vibrant & Block-based | Startups, creative agencies |
| 7 | Dark Mode (OLED) | Night-mode apps, coding |
| 8 | Claymorphism | Educational apps, SaaS |
| 9 | Aurora UI | Modern SaaS, creative |
| 10 | Soft UI Evolution | Modern enterprise apps |
| 11 | Bento Box Grid | Dashboards, portfolios |
| 12 | AI-Native UI | AI products, chatbots |
| 13 | Neubrutalism | Gen Z brands, startups |
| 14 | Cyberpunk UI | Gaming, tech, crypto |
| 15 | Organic Biophilic | Wellness, sustainability |

### Landing Page Styles
| # | Style | Best For |
|---|-------|----------|
| 1 | Hero-Centric Design | Strong visual identity |
| 2 | Conversion-Optimized | Lead generation, sales |
| 3 | Feature-Rich Showcase | SaaS, complex products |
| 4 | Social Proof-Focused | Services, B2C |
| 5 | Storytelling-Driven | Brands, agencies |

### Dashboard Styles
| # | Style | Best For |
|---|-------|----------|
| 1 | Data-Dense Dashboard | Complex analysis |
| 2 | Executive Dashboard | C-suite summaries |
| 3 | Real-Time Monitoring | Operations, DevOps |
| 4 | Financial Dashboard | Finance, accounting |
| 5 | Sales Intelligence | Sales teams, CRM |

## Industry Categories (Selected)

### Tech & SaaS
- SaaS, Micro SaaS, B2B Service
- Developer Tool / IDE
- AI/Chatbot Platform
- Cybersecurity Platform

### Finance
- Fintech/Crypto, Banking, Insurance
- Personal Finance Tracker
- Invoice & Billing Tool

### Healthcare
- Medical Clinic, Pharmacy, Dental
- Mental Health, Medication Reminder

### E-commerce
- General, Luxury, Marketplace
- Subscription Box, Food Delivery

### Services
- Beauty/Spa, Restaurant, Hotel
- Legal, Home Services

### Creative
- Portfolio, Agency, Photography
- Gaming, Music Streaming

## Supported Tech Stacks

| Category | Stacks |
|----------|--------|
| Web (HTML) | HTML + Tailwind (default) |
| React | React, Next.js, shadcn/ui |
| Vue | Vue, Nuxt.js, Nuxt UI |
| Angular | Angular |
| PHP | Laravel (Blade, Livewire) |
| Other | Svelte, Astro |
| iOS | SwiftUI |
| Android | Jetpack Compose |
| Cross-Platform | React Native, Flutter |

## Anti-Patterns to Avoid

### Universal Anti-Patterns
- Bright neon colors (unless brand-appropriate)
- Harsh, jarring animations
- AI purple/pink gradients (for non-AI products)
- Missing hover states
- Using emojis as icons
- Insufficient color contrast

### Industry-Specific Anti-Patterns
| Industry | Avoid |
|----------|-------|
| Banking/Finance | Playful animations, bright colors |
| Healthcare | Dark themes, aggressive CTAs |
| Luxury | Flat design, stock photography |
| Enterprise | Trendy styles, excessive whitespace |

## Pre-Delivery Checklist (Mandatory)

- [ ] **No emojis as icons** - Use SVG (Heroicons/Lucide)
- [ ] **cursor-pointer** on all clickable elements
- [ ] **Hover states** with smooth transitions (150-300ms)
- [ ] **Text contrast** 4.5:1 minimum in light mode
- [ ] **Focus states** visible for keyboard navigation
- [ ] **prefers-reduced-motion** respected
- [ ] **Responsive** at 375px, 768px, 1024px, 1440px

## Example Prompts

### Landing Page
"Build a landing page for my SaaS product"
"Create a conversion-focused landing page for a fintech app"
"Design a hero-centric landing page for a wellness brand"

### Dashboard
"Create a healthcare analytics dashboard"
"Build an executive dashboard for sales data"
"Design a real-time monitoring dashboard"

### Mobile App
"Make a mobile app UI for e-commerce"
"Build a fintech banking app with dark theme"
"Design a meditation app with soft UI"

### With Specific Stack
"Build a landing page using Next.js and shadcn/ui"
"Create a dashboard with Vue and Nuxt UI"
"Design a mobile app with React Native"

## Usage Instructions

1. **Auto-activation**: This skill activates automatically for UI/UX requests
2. **Natural language**: Just describe what you want to build
3. **Specify stack**: Mention preferred framework or let it default to HTML + Tailwind
4. **Review checklist**: Ensure all pre-delivery items are checked
5. **Iterate**: Request adjustments to colors, spacing, or effects as needed
