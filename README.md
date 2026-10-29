# HouseNest PG Backend API

[![Node.js](https://img.shields.io/badge/Node.js-v20+-68a063?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-v5.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.x-4479a1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Knex.js](https://img.shields.io/badge/Knex.js-v3.x-e15324)](https://knexjs.org/)
[![Redis](https://img.shields.io/badge/Redis-6.x+-dc382d?logo=redis&logoColor=white)](https://redis.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-Queue-b81424)](https://bullmq.io/)

A production-grade RESTful API backend engineered for the **HouseNest** PG & Hostel Management platform. Built using modern Node.js ES modules, Knex query builder, MySQL, BullMQ background queues with Redis, Brevo email services, and JWT authentication with secure HTTP-only cookies.

---

## 🏛️ System Architecture & Design Standards

### 1. Role-Based Access Control (RBAC)
- **`super_admin`**: Platform administrator with global access across all owners, PG branches, rooms, residents, and agreements.
- **`admin` (PG Owner / Manager)**: Owns and operates one or multiple PG facilities, managing inventory, residents, rooms, stays, and tenancy agreements.
- **`resident` (Tenant)**: Rents a room/bed in a PG branch with access to personal stay history, current active stay, profile, and agreement records.

### 2. Relational Hierarchy (1 Owner $\rightarrow$ Multiple PGs)
- A single owner (`admin`) can register and operate multiple independent PG facilities.
- All PGs are linked via `pgs.owner_id $\rightarrow$ users.id`.
- Room numbers are scoped and unique per PG facility.

### 3. Multi-PG Resident Stays (`resident_pg_stays`)
- Tracks resident tenancy over time across different PG properties (e.g. Month 1 at Branch A $\rightarrow$ Month 3 at Branch B).
- Supports atomic room/bed allocation, stay vacating (restoring rooms to vacant status), and PG-to-PG resident transfers.

### 4. Soft Delete Pattern (`deleted_at`)
- Implemented across all 5 core tables (`users`, `pgs`, `rooms`, `resident_pg_stays`, `agreements`).
- Uses indexed `deleted_at` timestamps (`NULL` indicates active records).
- All read queries, searches, relational joins, and unique validations automatically exclude soft-deleted records.
- Deleting an owner or PG cascades soft deletion to associated rooms, active stays, and agreements.

### 5. Standardized API Response Contract
- **Mutations (`POST`, `PUT`, `DELETE`)**: Strictly returns `{ success: true, message: "...", id: <number> }` via `successAction`.
- **Queries (`GET`)**: Returns `{ success: true, message: "...", data: <payload>, meta?: <pagination> }` via `success`.
- **Message Actions (Logout, Reset)**: Strictly returns `{ success: true, message: "..." }` via `successMessage`.
- **Operational Errors**: Standardized JSON error response with HTTP status codes and field-level validation errors via `AppError`.

### 6. Local Storage & Dynamic Media URLs
- File uploads for resident profile photos (`uploads/users`) and room photographs (`uploads/rooms`) via Multer.
- Supports `multipart/form-data` and JSON payloads; file uploads are **strictly optional**.
- Only the unique file basename is stored in the database; GET endpoints dynamically construct accessible URLs (`profile_photo_url`, `image_url`).

---

## 🗄️ Database Relational Schema

```text
┌─────────────────┐       1:N        ┌─────────────────┐       1:N        ┌──────────────────────┐
│      users      │ ───────────────> │      pgs        │ ───────────────> │  resident_pg_stays   │
│─────────────────│ (owner_id)       │─────────────────│ (pg_id)          │──────────────────────│
│ id (PK)         │                  │ id (PK)         │                  │ id (PK)              │
│ name            │                  │ owner_id (FK)   │                  │ resident_id (FK)──┐  │
│ email (UQ)      │                  │ name, type      │                  │ pg_id (FK)        │  │
│ password, phone │                  │ address, city   │                  │ room_id (FK)────┐ │  │
│ role (enum)     │                  │ total_rooms     │                  │ bed_number      │ │  │
│ deleted_at      │                  │ deleted_at      │                  │ check_in_date   │ │  │
└─────────────────┘                  └─────────────────┘                  │ status (active) │ │  │
        ▲                                     │ 1:N                       │ deleted_at      │ │  │
        │                                     ▼                           └─────────────────┘ │  │
        │                            ┌─────────────────┐                                      │  │
        │                            │    buildings    │                                      │  │
        │                            │─────────────────│                                      │  │
        │                            │ id (PK)         │                                      │  │
        │                            │ pg_id (FK)      │                                      │  │
        │                            │ name, status    │                                      │  │
        │                            │ deleted_at      │                                      │  │
        │                            └─────────────────┘                                      │  │
        │                                     │ 1:N                                           │  │
        │                                     ▼                                               │  │
        │                            ┌─────────────────┐                                      │  │
        │                            │     floors      │                                      │  │
        │                            │─────────────────│                                      │  │
        │                            │ id (PK)         │                                      │  │
        │                            │ building_id(FK) │                                      │  │
        │                            │ floor_number    │                                      │  │
        │                            │ name, status    │                                      │  │
        │                            │ deleted_at      │                                      │  │
        │                            └─────────────────┘                                      │  │
        │                                     │ 1:N                                           │  │
        │                                     ▼                                               │  │
        │                            ┌─────────────────┐                                      │  │
        │                            │      rooms      │ <────────────────────────────────────┘  │
        │                            │─────────────────│   (room_id)                             │
        │                            │ id (PK)         │                                         │
        │                            │ pg_id (FK)      │                                         │
        │                            │ building_id(FK) │                                         │
        │                            │ floor_id (FK)   │                                         │
        │                            │ room_no         │                                         │
        │                            │ room_type       │                                         │
        │                            │ building_name   │                                         │
        │                            │ floor, capacity │                                         │
        │                            │ size, image     │                                         │
        │                            │ status (enum)   │                                         │
        │                            │ deleted_at      │                                         │
        │                            └─────────────────┘                                         │
        │                                     ▲                                                  │
        │                                     │ 1:N                                              │
        │                            ┌─────────────────┐                                         │
        │                            │   agreements    │                                         │
        │                            │─────────────────│                                         │
        │                            │ id (PK)         │                                         │
        │                            │ resident_id(FK) │                                         │
        │                            │ pg_id, room_id  │                                         │
        │                            │ start/end_date  │                                         │
        │                            │ status, delete  │                                         │
        │                            └─────────────────┘                                         │
        └─────────────────────────────────────┴──────────────────────────────────────────────────┘
```

---

## 🔌 API Endpoint Directory

### 1. System & Diagnostic (`/api/v1`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Welcome check & root status | Public |
| `GET` | `/api/v1/health` | Service uptime, process health, and timestamp | Public |

### 2. Authentication (`/api/v1/auth`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register-pg` | Atomic PG Owner registration (`role: admin`) + initial PG creation | Public |
| `POST` | `/api/v1/auth/login` | Login with email & password (Issues JWT & sets HTTP-only cookies) | Public |
| `POST` | `/api/v1/auth/send-otp` | Dispatch 6-digit OTP to registered mobile number (Redis 5m TTL) | Public |
| `POST` | `/api/v1/auth/verify-otp` | Verify mobile OTP and complete login session | Public |
| `POST` | `/api/v1/auth/forgot-password` | Request password reset email redirecting to `reset-password?token={reset_token}` | Public |
| `POST` | `/api/v1/auth/reset-password` | Reset password using reset token (`token`, `password`) | Public |
| `POST` | `/api/v1/auth/refresh` | Rotate access token using refresh token | Public |
| `POST` | `/api/v1/auth/logout` | Clear session and purge authentication cookies | Public |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user profile | Private |

### 3. Building Management (`/api/v1/buildings`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/buildings` | Create a new building block under a PG facility | `admin`, `super_admin` |
| `GET` | `/api/v1/buildings` | Paginated list of buildings with total floors and rooms count | Private |
| `GET` | `/api/v1/buildings/:id` | Get building details with list of floors and room count | Private |
| `PUT` | `/api/v1/buildings/:id` | Update building name, description, or status | `admin`, `super_admin` |
| `DELETE` | `/api/v1/buildings/:id` | Soft delete building (guarded against active rooms) | `admin`, `super_admin` |

### 4. Floor Management (`/api/v1/floors`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/floors` | Create a floor under a building (`building_id`, `floor_number`) | `admin`, `super_admin` |
| `GET` | `/api/v1/floors` | Paginated list of floors (filterable by `building_id`, `pg_id`) | Private |
| `GET` | `/api/v1/floors/:id` | Get floor details with assigned rooms list | Private |
| `PUT` | `/api/v1/floors/:id` | Update floor number, display name, or status | `admin`, `super_admin` |
| `DELETE` | `/api/v1/floors/:id` | Soft delete floor (guarded against active rooms) | `admin`, `super_admin` |

### 5. Room Inventory (`/api/v1/rooms`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/rooms/stats` | Top KPI statistics (Total, Occupied, Vacant, Maintenance, Out of Service)| `admin`, `super_admin` |
| `GET` | `/api/v1/rooms/buildings` | Distinct building names and their floor lists array | Private |
| `POST` | `/api/v1/rooms` | Add room with `building_id`, `floor_id` (Supports optional photo) | `admin`, `super_admin` |
| `GET` | `/api/v1/rooms` | Paginated rooms list with building, floor, occupant, and filters | `admin`, `super_admin` |
| `GET` | `/api/v1/rooms/:id` | Get room details with `building_id`, `floor_id`, occupant, photo URL | Private |
| `PUT` | `/api/v1/rooms/:id` | Update room details, reassign `building_id` or `floor_id` | `admin`, `super_admin` |
| `DELETE` | `/api/v1/rooms/:id` | Soft delete vacant room (prevents deleting occupied rooms) | `admin`, `super_admin` |

### 6. User & Resident Management (`/api/v1/users`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/users` | Onboard resident / create user with optional photo and room stay | `admin`, `super_admin` |
| `GET` | `/api/v1/users` | List users (`?role=resident` displays Residents List with room details)| `admin`, `super_admin` |
| `PUT` | `/api/v1/users/profile` | Update current profile (Supports optional profile photo upload) | Private |
| `GET` | `/api/v1/users/:id` | Get user profile by primary ID | Private |
| `PUT` | `/api/v1/users/:id` | Update user details by ID (Supports optional profile photo) | `admin`, `super_admin` |
| `DELETE` | `/api/v1/users/:id` | Soft delete user, vacates room stay, and expires agreements | `admin`, `super_admin` |

### 7. Resident Stays & Relocation Timeline (`/api/v1/stays`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/stays/my-history` | Paginated stay records with `is_current_stay` boolean and filters | `resident` |
| `GET` | `/api/v1/stays/:id` | Get details of a specific stay record | Resident, Owner, `super_admin` |
| `PUT` | `/api/v1/stays/:id/vacate` | Check-out resident from PG (restores room to vacant status) | PG Owner, `super_admin` |

### 8. Agreement Records (`/api/v1/agreements`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/agreements` | Create tenancy agreement record (`draft`, `pending`, `signed`) | `admin`, `super_admin` |
| `GET` | `/api/v1/agreements` | Paginated agreement records table with joined resident/room info| Private |
| `GET` | `/api/v1/agreements/:id` | Get agreement record by ID | Private |
| `PUT` | `/api/v1/agreements/:id` | Update agreement details or transition status | `admin`, `super_admin` |
| `DELETE` | `/api/v1/agreements/:id` | Soft delete agreement record | `admin`, `super_admin` |

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory:

```ini
# Environment & Server
NODE_ENV=development
PORT=5000
CORS_ORIGIN=*

# MySQL Database
DB_CLIENT=mysql2
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=pg_backend_db

# Redis & Queue
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# Brevo Transactional Email
BREVO_API_KEY=
BREVO_SENDER_EMAIL=support@housenest.com
FROM_NAME=HouseNest

# JWT Secrets & Expiry
JWT_SECRET=super_secret_jwt_key_housenest_2026
JWT_ACCESS_SECRET=access_token_secret_housenest_2026
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=refresh_token_secret_housenest_2026
JWT_REFRESH_EXPIRES_IN=7d
COOKIE_SECURE=false
```

---

## 🚀 Quick Setup & Installation

```bash
# 1. Install dependencies
npm install

# 2. Run database migrations
npm run migrate:latest

# 3. Seed initial users, PGs, rooms, stays, and agreements
npm run seed:run

# 4. Start development server
npm run dev
```

### Default Seed Accounts (Password: `Admin@123456`)
| Role | Email | Notes |
| :--- | :--- | :--- |
| **Super Admin** | `superadmin@example.com` | Complete access to all system entities |
| **PG Owner (Admin)**| `admin@example.com` | Owns 2 PGs: *HouseNest Green Park* & *Silver Star* |
| **Resident** | `resident@example.com` | Active stay in Room A-202, signed agreement record |

---

## 📮 Postman Collection

A complete standalone Postman collection is pre-configured with embedded collection variables (no separate environment file required):
- **Collection file**: [`PG_Backend.postman_collection.json`](file:///d:/PG_Backend/PG_Backend.postman_collection.json)

### Features included in the Postman collection:
- **8 Clean Modules**: `01 Health`, `02 Authentication`, `03 Building Management`, `04 Floor Management`, `05 Room Management`, `06 User Management`, `07 Resident Stays`, and `08 Agreements`.
- **Collection-Level Bearer Auth**: Automatic token propagation using `{{accessToken}}` across all private endpoints, with public endpoints configured with `noauth`.
- **Multipart Form-Data for File Uploads**: `POST /rooms`, `PUT /rooms/:id`, `POST /users`, `PUT /users/:id`, and `PUT /users/profile` use `multipart/form-data` with comprehensive, field-by-field descriptions for text parameters and file binary uploads.
- **Auto-Capture Scripts**: Login, OTP verification, and entity creation automatically populate collection variables (`accessToken`, `refreshToken`, `pgId`, `roomId`, `userId`, `agreementId`, `stayId`, `resetToken`).
- **Complete Parameter Documentation**: Every query param, header, and body field has a dedicated description detailing purpose, data type, and validation rules.
