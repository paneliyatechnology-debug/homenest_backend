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
| `GET` | `/api/v1/agreements/stats` | Top KPI statistics (Total Agreements, Draft, Pending Sign, Signed, Expired) | Private |
| `POST` | `/api/v1/agreements` | Create tenancy agreement record (`draft`, `pending`, `signed`) | `admin`, `super_admin` |
| `GET` | `/api/v1/agreements` | Paginated agreement records table with joined resident/room info| Private |
| `GET` | `/api/v1/agreements/:id` | Get agreement record by ID | Private |
| `PUT` | `/api/v1/agreements/:id` | Update agreement details or transition status | `admin`, `super_admin` |
| `DELETE` | `/api/v1/agreements/:id` | Soft delete agreement record | `admin`, `super_admin` |

### 9. Payments & Billing Module (`/api/v1/payments`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/payments/stats` | Unified KPI statistics for payments (Revenue, Transactions, Collections, Pending, Overdue, Refunds) | `admin`, `super_admin` |
| `GET` | `/api/v1/payments` | Paginated table supporting tabs (`all`, `pending`, `overdue`, `refunds`) & filters | Private |
| `GET` | `/api/v1/payments/resident/overview` | Resident mobile overview (Outstanding amount, itemized breakdown, deposit, recent transactions) | `resident`, `admin` |
| `POST` | `/api/v1/payments/:id/initiate-upi` | Generate dynamic NPCI UPI URI and standard Base64 QR code for checkout | Private |
| `POST` | `/api/v1/payments/:id/pay` | Complete/record payment (assigns transaction ID, marks paid, generates receipt) | Private |
| `POST` | `/api/v1/payments` | Create a new billing demand / invoice with itemized breakdown | `admin`, `super_admin` |
| `GET` | `/api/v1/payments/:id` | Get payment invoice details by primary ID | Private |

### 10. Visitor Management (`/api/v1/visitors`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/visitors/stats` | Dashboard KPI metrics (Total passes, inside, expected, expired) | `admin`, `super_admin` |
| `POST` | `/api/v1/visitors/scan` | QR pass scan at security gate (auto check-in / check-out toggle) | `admin`, `super_admin`, `staff` |
| `GET` | `/api/v1/visitors` | Paginated visitors directory with filters & active status | Private |
| `POST` | `/api/v1/visitors` | Create new visitor pass with QR code generation | Private |
| `GET` | `/api/v1/visitors/gate/logs` | Gate activity log timeline with security guard records | `admin`, `super_admin`, `staff` |
| `GET` | `/api/v1/visitors/:id/logs` | Multi-entry timeline logs for a specific visitor | Private |
| `GET` | `/api/v1/visitors/:id` | Get visitor pass details and QR image URL | Private |
| `PUT` | `/api/v1/visitors/:id` | Update visitor pass details | `admin`, `super_admin`, `resident` |
| `PATCH` | `/api/v1/visitors/:id/status` | Quick update visitor pass status | `admin`, `super_admin`, `staff` |
| `DELETE` | `/api/v1/visitors/:id` | Soft delete visitor pass record | `admin`, `super_admin` |

### 11. Branch Management (`/api/v1/branches`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/branches/stats` | Multi-branch KPI statistics (Total, Active, Maintenance, Upcoming) | Private |
| `GET` | `/api/v1/branches` | Paginated branches list with capacity & occupancy counts | Private |
| `POST` | `/api/v1/branches` | Create new facility branch (Supports optional photo upload) | `admin`, `super_admin` |
| `GET` | `/api/v1/branches/:id` | Get branch details with buildings & floor breakdown | Private |
| `PUT` | `/api/v1/branches/:id` | Update branch details (Supports optional photo upload) | `admin`, `super_admin` |
| `DELETE` | `/api/v1/branches/:id` | Soft delete branch (guarded against active rooms/stays) | `admin`, `super_admin` |

### 12. Food Menu & Feedback (`/api/v1/food-menu`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/food-menu/feedback/my` | Resident's historical meal feedback list | `resident` |
| `GET` | `/api/v1/food-menu/feedback/summary` | Analytics summary (Overall average, meal type breakdown, star counts) | `admin`, `super_admin` |
| `GET` | `/api/v1/food-menu/feedback` | Paginated resident meal feedback table with date filters | `admin`, `super_admin` |
| `GET` | `/api/v1/food-menu/:id/feedback` | Get feedback and ratings for a specific menu item | Private |
| `POST` | `/api/v1/food-menu/:id/feedback` | Submit or update meal rating and feedback with optional dish photo | `resident` |
| `GET` | `/api/v1/food-menu` | Paginated date-range meal menu (Breakfast, Lunch, Dinner) | Private |
| `POST` | `/api/v1/food-menu` | Create daily meal offering with dish items & meal timings | `admin`, `super_admin` |
| `GET` | `/api/v1/food-menu/:id` | Get menu item details with average feedback score | Private |
| `PUT` | `/api/v1/food-menu/:id` | Update menu details, timings, or active status | `admin`, `super_admin` |
| `DELETE` | `/api/v1/food-menu/:id` | Delete menu item record | `admin`, `super_admin` |

### 13. Complaint Management (`/api/v1/complaints`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/complaints/categories` | Predefined complaint categories (Cleaning, AC, WiFi, Water, Food, etc.) | Private |
| `GET` | `/api/v1/complaints/stats` | Real-time complaint KPIs (Total, Open, In Progress, Resolved, Overdue) | `admin`, `super_admin` |
| `GET` | `/api/v1/complaints` | Paginated complaints table (Resident: own; Admin: branch-wide) | Private |
| `POST` | `/api/v1/complaints` | Register complaint with optional attachments & WiFi diagnostics | Private |
| `GET` | `/api/v1/complaints/:id` | Get complaint details, activity log, and technician notes | Private |
| `PATCH` | `/api/v1/complaints/:id/assignment` | Assign complaint to operational staff member | `admin`, `super_admin`, `staff` |
| `PATCH` | `/api/v1/complaints/:id/status` | Update ticket status (open -> in_progress -> resolved) | `admin`, `super_admin`, `staff` |
| `POST` | `/api/v1/complaints/:id/updates` | Append communication update note to complaint timeline | Private |
| `POST` | `/api/v1/complaints/:id/feedback` | Resident star rating and satisfaction feedback on resolved ticket | `resident` |

### 14. Operational Staff Management (`/api/v1/users/staff`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users/staff/stats` | Staff dashboard KPI cards (Total, Active, On Leave, Inactive, Roles) | `admin`, `super_admin` |
| `GET` | `/api/v1/users/staff` | Unified staff directory (Multi-branch filtering & resident directory) | Private |
| `POST` | `/api/v1/users/staff` | Onboard staff member with role & multi-branch assignments | `admin`, `super_admin` |
| `GET` | `/api/v1/users/staff/:id` | Get staff profile with assigned branches | `admin`, `super_admin` |
| `PUT` | `/api/v1/users/staff/:id` | Update staff contact details, role, or branch assignments | `admin`, `super_admin` |
| `PATCH` | `/api/v1/users/staff/:id/status` | Quick update staff status (`active`, `on_leave`, `inactive`) | `admin`, `super_admin` |
| `DELETE` | `/api/v1/users/staff/:id` | Soft delete staff member | `admin`, `super_admin` |

### 15. Room Shift Requests (`/api/v1/rooms/shifts`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/rooms/shifts/stats` | Shift requests KPI statistics (Total, Pending, Approved, Rejected) | `admin`, `super_admin` |
| `POST` | `/api/v1/rooms/shifts` | Submit room relocation request with preferred room type & reason | Private |
| `GET` | `/api/v1/rooms/shifts` | Paginated room shift requests with status filters | Private |
| `GET` | `/api/v1/rooms/shifts/:id` | Get room shift request details | Private |
| `PATCH` | `/api/v1/rooms/shifts/:id/status` | Approve / Reject shift (Approving atomically reallocates room & bed) | `admin`, `super_admin` |
| `DELETE` | `/api/v1/rooms/shifts/:id` | Cancel or delete room shift request | Private |

### 16. Laundry Management (`/api/v1/laundry`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/laundry/catalog` | Active laundry item catalog and itemized rate list | Private |
| `PUT` | `/api/v1/laundry/catalog` | Configure laundry item prices (branch-specific or all branches) | `admin`, `super_admin` |
| `GET` | `/api/v1/laundry/stats` | Laundry KPI metrics (Total orders, pending pickup, in process, unbilled) | `admin`, `super_admin` |
| `GET` | `/api/v1/laundry/users` | List residents with unbilled laundry amounts and order counts | `admin`, `super_admin`, `staff` |
| `GET` | `/api/v1/laundry/residents/:resident_id/billing` | Resident itemized laundry order history and billing summary | Private |
| `POST` | `/api/v1/laundry/payments` | Generate billing invoices for unbilled laundry orders (single or bulk) | `admin`, `super_admin` |
| `POST` | `/api/v1/laundry` | Submit laundry request (itemized clothing counts & pickup time) | Private |
| `GET` | `/api/v1/laundry` | Paginated laundry orders table with status and type filters | Private |
| `GET` | `/api/v1/laundry/:id` | Get laundry request details and itemized pricing breakdown | Private |
| `PATCH` | `/api/v1/laundry/:id/status` | Update laundry order status (`pending_pickup` -> `completed`) | `admin`, `super_admin`, `staff` |
| `PATCH` | `/api/v1/laundry/:id/assign` | Assign laundry pickup / processing to staff member | `admin`, `super_admin` |
| `DELETE` | `/api/v1/laundry/:id` | Cancel laundry request | Private |

### 17. Checkout & Refund Approvals (`/api/v1/stays/checkouts`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/stays/checkouts/review` | Resident checkout review, live pending dues calculation & NOC preview | Private |
| `POST` | `/api/v1/stays/checkouts` | Submit planned departure request with reason and notice period | Private |
| `GET` | `/api/v1/stays/checkouts/export` | Export checkout and refund approvals report as Excel (.xlsx) or PDF (.pdf) | `admin`, `super_admin`, `staff` |
| `GET` | `/api/v1/stays/checkouts` | Paginated departure clearance & refund approval table | `admin`, `super_admin`, `staff` |
| `GET` | `/api/v1/stays/checkouts/:id` | Get checkout request details, inspection checklist & refund breakdown | Private |
| `PATCH` | `/api/v1/stays/checkouts/:id/status` | Update status, verify checklist, grant NOC, and process refund | `admin`, `super_admin` |
| `DELETE` | `/api/v1/stays/checkouts/:id` | Cancel departure request | Private |

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

### 18. Subscription Plans (`/api/v1/subscriptions`)
Manage and configure resident subscription plans with pricing, duration, and feature checklists:
- `GET /api/v1/subscriptions/stats` - Dashboard KPI cards (Total Plans, Total Subscribers, Active Plans, Inactive Plans)
- `GET /api/v1/subscriptions` - List subscription plans with filtering (plan_type, status, search, pagination)
- `POST /api/v1/subscriptions` - Create new subscription plan with name, type, price, duration, features
- `GET /api/v1/subscriptions/:id` - Get subscription plan details and overview
- `PUT /api/v1/subscriptions/:id` - Update subscription plan details
- `PATCH /api/v1/subscriptions/:id/status` - Quick toggle/update status (Pause Plan / Activate Plan)
- `DELETE /api/v1/subscriptions/:id` - Soft-delete subscription plan

### 19. Notice Management & Communications (`/api/v1/notices`)
Property communications, broadcast announcements, scheduling, and resident notification center:
- `GET /api/v1/notices/stats` - Notice KPI cards (Total Notices, Drafts, Scheduled, Sent)
- `GET /api/v1/notices` - Paginated notices table with tab filtering (All, Drafts, Scheduled, Sent), category, priority, and search
- `POST /api/v1/notices` - Create or schedule notice with audience targeting (All, Branch, Room, Resident) and optional document/image attachment (PDF, DOC, JPG, PNG)
- `GET /api/v1/notices/:id` - Get notice details by ID for Admin portal
- `PUT /api/v1/notices/:id` - Update notice content, reschedule, or replace attachment
- `DELETE /api/v1/notices/:id` - Soft delete notice
- `POST /api/v1/notices/:id/send` - Immediately publish / broadcast draft or scheduled notice
- `GET /api/v1/notices/resident` - Resident Mobile Notification Center list with category pills (All, Important, General, Events) and unread counters
- `GET /api/v1/notices/resident/:id` - Resident Notice Detail screen showing category, priority, date/time, content, and attachment download card (automatically marks as read)
- `PATCH /api/v1/notices/resident/:id/read` - Explicitly mark notice as read by resident
- `PATCH /api/v1/notices/resident/read-all` - Mark all notifications as read for resident

---

## 📮 Postman Collection


A complete standalone Postman collection is pre-configured:
- **Collection file**: [`PG_Backend.postman_collection.json`](file:///d:/HomeNest_Backend/PG_Backend.postman_collection.json)

### Features included in the Postman collection:
- **19 Clean Standardized Modules**: Numbered from `01 System & Health` to `19 Notice Management` in strict logical hierarchy.
- **Over 130 Distinct API Endpoints**: All duplicate requests eliminated; canonical RESTful routes with complete documentation.
- **Collection-Level Bearer Auth**: Automatic token propagation using `{{accessToken}}` across all private endpoints, with public endpoints configured with `noauth`.
- **Multipart Form-Data & JSON Payloads**: Formdata parameters with comprehensive field descriptions for text parameters and file binary uploads.
- **Auto-Capture Scripts**: Login, OTP verification, and entity creation automatically populate collection variables (`accessToken`, `refreshToken`, `pgId`, `branchId`, `roomId`, `userId`, `staffId`, `stayId`, `agreementId`, `paymentId`, `visitorId`, `menuId`, `complaintId`, `shiftId`, `laundryId`, `checkoutRequestId`, `planId`, `noticeId`).
- **Complete Parameter Documentation**: Every query param, header, and body field has a dedicated description detailing purpose, data type, and validation rules.
