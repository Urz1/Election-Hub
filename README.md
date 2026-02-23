# ElectHub - Secure Election Management Platform

A production-ready, mobile-first election management platform built with Next.js. Create region-based elections, share a link with voters, track live results, and manage everything from one dashboard.

## Features

- **Self-Service Elections** — Organizers register, create elections, and manage everything independently
- **Region-Based Access** — Draw voting regions on a satellite map; only voters within the area can participate
- **Secure Voting** — Email verification, device fingerprinting, and configurable security levels
- **Position-Based Voting** — Define positions, register candidates with photos, and voters select one per position
- **Real-Time Dashboard** — Live vote counting, turnout tracking, region breakdowns, and CSV export
- **Timed Phases** — Automatic registration/voting windows with schedule extensions
- **Mobile-First** — Optimized for phone screens with 44px+ touch targets and responsive layouts
- **Google OAuth** — One-click sign-in with auto-linking for organizers
- **Image Uploads** — Candidate photos and custom voter fields via Cloudinary
- **Audit Logging** — Immutable logs for all critical actions (votes, auth, status changes)
- **Rate Limiting** — Per-IP sliding-window rate limiting on all sensitive endpoints

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Language**: TypeScript
- **Database**: PostgreSQL (Neon) via Prisma ORM
- **Authentication**: NextAuth.js v5 (Credentials + Google OAuth)
- **UI**: Tailwind CSS 4 + shadcn/ui
- **Maps**: Leaflet + react-leaflet + leaflet-geosearch
- **Email**: Resend
- **Images**: Cloudinary (free tier)
- **Security**: CSP headers, HSTS, rate limiting, constant-time verification

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL database (or [Neon](https://neon.tech) free tier)

### Installation

```bash
git clone https://github.com/Urz1/Election-Hub.git
cd Election-Hub
pnpm install
```

### Environment Setup

Create a `.env` file:

```env
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require&pgbouncer=true&connection_limit=20"
AUTH_SECRET="generate-with-openssl-rand-hex-32"
NEXTAUTH_URL="http://localhost:3000"

# Resend (https://resend.com/api-keys)
RESEND_API_KEY=""

# Cloudinary (https://cloudinary.com/console)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=""
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=""

# Google OAuth (https://console.cloud.google.com/apis/credentials)
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
```

### Database Setup

```bash
npx prisma db push
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── auth/           # Registration, login, verify, password reset
│   │   ├── elections/      # CRUD, stats, voter management
│   │   └── vote/           # Public voter flow (register, verify, cast, results)
│   ├── dashboard/          # Organizer dashboard + election detail + create wizard
│   ├── vote/               # Voter-facing election flow
│   └── (auth pages)        # Login, register, verify-email, forgot/reset password
├── components/
│   ├── ui/                 # shadcn/ui components (button, input, card, etc.)
│   ├── logo.tsx            # ElectHub logo (SVG)
│   ├── map-draw.tsx        # Map region drawing (satellite, search, edit)
│   └── image-upload.tsx    # Cloudinary image upload
├── lib/
│   ├── auth.ts             # NextAuth config (Credentials + Google)
│   ├── prisma.ts           # Prisma client singleton
│   ├── audit.ts            # Immutable audit logging
│   ├── cache.ts            # TTL response cache
│   ├── rate-limit.ts       # Sliding-window rate limiter
│   ├── geo.ts              # Point-in-region calculations
│   ├── email.ts            # Resend email utilities
│   ├── time-validation.ts  # Election schedule validation
│   └── election-helpers.ts # Phase detection utilities
├── prisma/
│   └── schema.prisma       # PostgreSQL schema (11 models)
└── middleware.ts            # Auth guard + security headers (CSP, HSTS)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register organizer account |
| POST | `/api/auth/verify-email` | Verify organizer email |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |
| GET | `/api/auth/me` | Get current user info |
| GET/POST | `/api/elections` | List / create elections |
| GET/PATCH/DELETE | `/api/elections/[id]` | Manage election |
| GET | `/api/elections/[id]/stats` | Election statistics (SQL aggregated) |
| GET | `/api/elections/[id]/voters` | List registered voters |
| GET | `/api/vote/[code]` | Get election info (cached, 3s TTL) |
| POST | `/api/vote/[code]/register` | Register as voter |
| POST | `/api/vote/[code]/verify` | Verify voter email |
| POST | `/api/vote/[code]/cast` | Cast / update votes |
| GET | `/api/vote/[code]/results` | View results (SQL aggregated) |

## Performance

Designed to handle **10,000+ concurrent voters**:
- SQL `GROUP BY` aggregation (no in-memory vote counting)
- 3-second TTL cache on polling endpoint (~7,500x DB load reduction)
- Neon connection pooling via PgBouncer
- Tab-visibility-aware polling (pauses when hidden)
- Database indexes on all foreign keys and lookup columns

## Author

**Sadam Husen Ali** — AI/ML Engineer & Full-Stack Developer

- Portfolio: [sadam.tech](https://sadam.tech)
- GitHub: [@Urz1](https://github.com/Urz1)
- LinkedIn: [sadam-husen-16s](https://linkedin.com/in/sadam-husen-16s)

## License

MIT
