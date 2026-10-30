# Boame API

A service marketplace backend that connects customers to vetted providers for domestic and commercial services — starting with car wash and home cleaning, with plans to expand across more service categories.

Built by **Asante** as a full-stack portfolio project demonstrating production-grade backend architecture. Pairs with the [Boame Client](https://github.com/littlegod20/boa_me_client) (React Native / Expo).

---

## What it does

Customers open the app, browse available services, pick a provider, book and pay securely via Mobile Money or card. Providers receive job requests, confirm bookings, and get paid automatically after completing a job. Both parties can chat in realtime throughout the process.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js + TypeScript | Type safety across the entire codebase |
| Framework | Express.js v5 | Async error handling, minimal overhead |
| Database | PostgreSQL | Relational data with strong constraints |
| Cache | Redis | Sub-2ms response times on frequently read data |
| Realtime | Socket.io | Bidirectional messaging between customer and provider |
| Queue | RabbitMQ | Async payout processing decoupled from request cycle |
| Scheduler | node-cron | Hourly job to trigger provider payouts after 24hr window |
| Payments | Paystack | MoMo and card payments, webhooks, transfers, refunds |
| Auth | JWT + Passport.js | Stateless auth with Google OAuth 2.0 support |
| Email | Resend | Verification emails and password reset |
| Validation | Zod v4 | Schema-first input validation on all endpoints |
| Logging | Winston + Morgan | Structured logs with HTTP request tracking |
| Rate Limiting | express-rate-limit | Brute force protection on auth endpoints |

---

## System Architecture

```
Client (React Native Expo)
    ↓
Cloudflare (CDN / Proxy)
    ↓
Nginx (Load Balancer)
    ↓
Express API Server ←→ Redis (Cache + Socket.io pub/sub adapter)
    ├── PostgreSQL (Primary Database)
    ├── Socket.io ←→ RabbitMQ (Job Queue)
    ├── Paystack (Payments + Webhooks + Transfers)
    ├── Cloudinary (Media Storage)
    ├── Google Maps (Location)
    ├── Expo Push Notifications
    └── Winston Logger
```

---

## Database Design

11 tables covering the full service marketplace domain:

- **users** — customers, providers and admins with role-based access
- **providers** — provider profiles with MoMo/bank payout details
- **provider_services** — junction table linking providers to services with individual pricing
- **categories** — service categories (Home Services, Car Services)
- **services** — platform-defined service catalogue
- **bookings** — full booking lifecycle with state machine
- **payments** — Paystack transaction records with webhook verification
- **transactions** — financial audit trail for payouts and refunds
- **reviews** — post-completion ratings (1-5) tied to specific bookings
- **conversations** — chat threads between customer and provider
- **messages** — individual chat messages with seen status

---

## Key Features

### Authentication
- Email/password registration with email verification
- JWT access tokens with refresh token pattern
- Google OAuth 2.0 via Passport.js
- Forgot password with SHA-256 hashed reset tokens
- Role-based access control (customer, provider, admin)

### Booking State Machine
Bookings follow strict validated transitions:

```
pending_payment → pending_confirmation → confirmed → in_progress → completed
                                      ↘ cancelled ↙
```

- Customers can only cancel
- Providers can confirm, start, complete, or cancel
- Invalid transitions are rejected at the API level

### Payment System
- Customer pays at booking time via Paystack (MoMo or card)
- Payment initialisation returns a hosted Paystack checkout URL
- Webhook handler verifies Paystack HMAC-SHA512 signature before processing
- **Cancellation policy:**
  - Provider cancels → full refund to customer
  - Customer cancels after confirmation → 96% refund (4% cancellation fee to provider)
  - Cancelled before payment → no charge
- Provider payout triggered automatically 24 hours after job completion via RabbitMQ worker
- Platform takes 10% commission on each completed payout

### Realtime Messaging
- Socket.io with JWT authentication on connection
- Users automatically join all their conversation rooms on connect
- Messages saved to PostgreSQL and emitted to room simultaneously
- Message seen status tracking

### Caching Strategy
- Categories cached for 1 hour
- Services cached for 30 minutes per query combination
- Provider listings cached for 10 minutes
- Cache invalidated automatically on write operations

---

## API Endpoints

### Auth
```
POST   /api/v1/auth/register
PATCH  /api/v1/auth/verify-email
POST   /api/v1/auth/login
GET    /api/v1/auth/google
GET    /api/v1/auth/google/callback
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/password-reset
```

### Categories
```
GET    /api/v1/categories
GET    /api/v1/categories/:categoryId
POST   /api/v1/categories              (admin only)
PATCH  /api/v1/categories/:categoryId  (admin only)
DELETE /api/v1/categories/:categoryId  (admin only)
```

### Services
```
GET    /api/v1/services
GET    /api/v1/services/:serviceId
POST   /api/v1/services                (admin only)
PATCH  /api/v1/services/:serviceId     (admin only)
DELETE /api/v1/services/:serviceId     (admin only)
```

### Providers
```
POST   /api/v1/providers/register
POST   /api/v1/providers
GET    /api/v1/providers
GET    /api/v1/providers/:providerServiceId
GET    /api/v1/providers/service/:serviceId/providers
PATCH  /api/v1/providers/:providerServiceId
DELETE /api/v1/providers/:providerServiceId
```

### Bookings
```
POST   /api/v1/bookings
GET    /api/v1/bookings
GET    /api/v1/bookings/:id
PATCH  /api/v1/bookings/:id/status
```

### Payments
```
POST   /api/v1/payments/initialize
POST   /api/v1/payments/webhook
```

### Reviews
```
POST   /api/v1/reviews
GET    /api/v1/reviews
```

### Conversations
```
POST   /api/v1/conversations
GET    /api/v1/conversations
GET    /api/v1/conversations/:conversationId/messages
```

---

## Socket.io Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `send_message` | `{ conversation_id, content }` | Send a chat message |
| `message_seen` | `{ conversation_id }` | Mark messages as read |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `new_message` | Message object | New message received |
| `messages_seen` | `{ conversation_id, seen_by }` | Messages marked as read |
| `error` | `{ message }` | Error notification |

---

## Running Locally

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis
- RabbitMQ (Docker recommended)
- Paystack account (test mode)
- Google Cloud Console OAuth credentials
- Resend account

### Setup

```bash
# clone the repo
git clone https://github.com/yourusername/boame-server
cd boame-server

# install dependencies
npm install

# copy environment variables
cp .env.example .env
# fill in your values in .env

# start RabbitMQ
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:management

# run database migrations (create tables manually using the SQL in /docs/schema.sql)

# start development server
npm run dev
```

### Environment Variables

```env
PORT=3000
NODE_ENV=development

DATABASE_URL=postgresql://postgres:password@localhost:5432/boame_db

REDIS_URL=redis://localhost:6379

RABBITMQ_URL=amqp://guest:guest@localhost:5672

JWT_SECRET=your_jwt_secret

PAYSTACK_SECRET_KEY=sk_test_...

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

GEOAPIFY_API_KEY=your_geoapify_key

RESEND_API_KEY=re_...
```

---

## Project Structure

```
src/
├── config/          — database, Redis, RabbitMQ, Passport, Socket.io, constants
├── controllers/     — request/response handlers
├── jobs/            — node-cron scheduled tasks
├── middlewares/     — auth, validation, error handling, rate limiting, logging
├── queues/          — RabbitMQ message publishers
├── routes/          — Express route definitions
├── services/        — business logic and database queries
├── types/           — TypeScript interfaces and enums
├── utils/           — JWT, tokens, email, Paystack, cache helpers
├── validators/      — Zod schemas
├── workers/         — RabbitMQ consumers
├── app.ts           — Express app configuration
└── server.ts        — entry point
```

---

## Planned Features

- **Dispute Resolution** — customers can flag unsatisfactory completed bookings for admin review. Admins can investigate, resolve or reject disputes, with optional compensation flow.
- **Push Notifications** — Expo Push Notifications for booking confirmations, status updates, payment receipts and new messages via Firebase Cloud Messaging.
- **Image Uploads** — provider profile photos and ID verification documents uploaded directly to Cloudinary from the React Native client using unsigned upload presets.
- **Admin Dashboard** — web-based dashboard for managing users, services, disputes, and viewing platform analytics.
- **Apple OAuth** — Sign in with Apple alongside existing Google OAuth.
- **React Native Frontend** — mobile app for iOS and Android built with Expo.



## What I Learned

This project pushed me significantly beyond CRUD. The most valuable lessons:

- **Payment system design** — handling the full money lifecycle: initialize, verify via webhook, conditional refunds based on who cancels, automated provider payouts with commission deduction
- **State machines** — modeling booking lifecycle as validated transitions rather than a simple status field prevents invalid states at the database level
- **Async architecture** — decoupling payout processing from the request/response cycle using RabbitMQ and node-cron so HTTP responses stay fast
- **Realtime systems** — Socket.io rooms, authentication on connection, and saving messages atomically while emitting to conversation participants
- **Caching strategy** — knowing what to cache, for how long, and critically when to invalidate

---

*This project is now deployed on a DigitalOcean Droplet with Nginx and SSH access*