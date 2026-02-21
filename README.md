# ElectHub - Election Management System

A full-stack election management platform built with Next.js that enables organizations to create, manage, and conduct secure elections with geographic access control and real-time results.

## Features

- **Election Management** - Create and configure elections with multiple positions, candidates, and custom voter fields
- **Secure Voting** - Email verification, device fingerprinting, and configurable security levels (casual, standard, strict)
- **Geographic Access Control** - Define voting regions with interactive map drawing (polygons & circles) and location verification
- **Real-time Results** - Live vote counting, turnout tracking, and results dashboard
- **Timed Phases** - Automatic election phase management (registration, voting, closed)
- **Share Links** - Unique share codes for voter access to elections

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: SQLite via Prisma ORM
- **Authentication**: NextAuth.js
- **UI**: Tailwind CSS + shadcn/ui (Radix UI)
- **Maps**: Leaflet + react-leaflet
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod validation

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Installation

```bash
git clone https://github.com/Urz1/Election-Hub.git
cd Election-Hub
pnpm install
```

### Environment Setup

Create a `.env` file in the root directory:

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```

### Database Setup

```bash
npx prisma db push
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── app/
│   ├── api/              # API routes
│   │   ├── auth/         # Authentication endpoints
│   │   ├── elections/    # Election CRUD & stats
│   │   └── vote/         # Voting flow endpoints
│   ├── dashboard/        # Organizer dashboard pages
│   ├── vote/             # Voter-facing pages
│   ├── login/            # Login page
│   └── register/         # Registration page
├── components/
│   ├── ui/               # Reusable UI components
│   ├── map-draw.tsx      # Map region drawing
│   └── theme-provider.tsx
├── lib/
│   ├── auth.ts           # NextAuth configuration
│   ├── prisma.ts         # Database client
│   ├── geo.ts            # Geographic utilities
│   └── election-helpers.ts
├── prisma/
│   └── schema.prisma     # Database schema
└── hooks/                # Custom React hooks
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register as organizer |
| GET/POST | `/api/elections` | List/create elections |
| GET/PATCH | `/api/elections/[id]` | Get/update election |
| GET | `/api/elections/[id]/stats` | Election statistics |
| POST | `/api/vote/[code]/register` | Register as voter |
| POST | `/api/vote/[code]/verify` | Verify email |
| POST | `/api/vote/[code]/cast` | Cast vote |
| GET | `/api/vote/[code]/results` | View results |

## License

MIT
