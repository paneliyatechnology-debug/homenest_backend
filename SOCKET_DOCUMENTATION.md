# HomeNest Real-Time WebSocket & Socket.IO Documentation

Comprehensive reference documentation for the real-time WebSocket architecture, connection lifecycle, room subscriptions, and event catalog for the HomeNest PG & Hostel Management Platform.

---

## 1. Architecture Overview

HomeNest implements a bidirectional, real-time messaging pipeline built on **Socket.IO (v4+)**. Real-time capabilities power instant notifications, maintenance issue dispatching, visitor arrival alerts, live community feeds, room shifting workflows, and checkout tracking.

```
┌────────────────────────────────────────────────────────┐
│             Client (Mobile App / Web Portal)           │
└──────────────┬───────────────────────────▲─────────────┘
               │ Handshake (JWT Auth)      │ Real-time Events
               ▼                           │
┌──────────────────────────────────────────┴─────────────┐
│                 Node.js / Express Server               │
│                  (src/server.js:17)                    │
│                                                        │
│   ┌────────────────────────────────────────────────┐   │
│   │   SocketService (src/services/socket.service.js)│  │
│   │   - JWT Handshake Auth Middleware              │   │
│   │   - Multi-Tenant Room Routing Engine           │   │
│   │   - Scoped Event Dispatchers                   │   │
│   └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

### Key Technical Specifications
- **Base WebSocket URL**: `ws://<host>:<port>` or `http://<host>:<port>` (e.g. `http://localhost:5000`)
- **Transport Modes**: `websocket`, `polling` (fallback)
- **Ping Interval**: 25,000 ms (25s)
- **Ping Timeout**: 30,000 ms (30s)
- **CORS Support**: Synchronized with backend environment `CORS_ORIGIN` credentials allowed.
- **Server Initialization**: Mounted to HTTP server in [`src/server.js`](file:///d:/HomeNest_Backend/src/server.js#L17) via `socketService.init(server)`.

---

## 2. Connection & Authentication Lifecycle

Every WebSocket connection must authenticate during the handshake using a valid JWT access token.

### 2.1 Handshake Authentication Options

Clients can pass the token using either of two methods:

#### Option A: Handshake `auth` object (Recommended)
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: accessToken, // Raw JWT token string
  },
  transports: ['websocket'],
});
```

#### Option B: HTTP Authorization Header
```javascript
const socket = io('http://localhost:5000', {
  extraHeaders: {
    Authorization: `Bearer ${accessToken}`,
  },
  transports: ['websocket'],
});
```

### 2.2 Connection Errors
If authentication fails, the server rejects the handshake with an error:
- `Authentication error: Access token missing`: Neither `auth.token` nor `headers.authorization` was supplied.
- `Authentication error: Invalid access token`: Token signature verification failed or token expired.
- `Authentication error: User not found or inactive`: User ID from token was not found in database or user `status === 'inactive'`.

Client-side error handling:
```javascript
socket.on('connect_error', (error) => {
  console.error('Socket authentication failed:', error.message);
  if (error.message.includes('Authentication error')) {
    // Handle token refresh or logout
  }
});
```

---

## 3. Multi-Tenant Room & Channel Routing

Upon successful authentication, the server automatically maps the connected socket into multi-tenant isolation rooms based on user role, PG property, and branch.

### 3.1 Automatically Joined Rooms

| Room Name Pattern | Description | Who Joins |
| :--- | :--- | :--- |
| `user:<userId>` | Private inbox for user-specific events | The connected user only |
| `role:<role>` | Role broadcast room (`role:admin`, `role:super_admin`, `role:resident`, `role:branch_manager`) | All users having that role |
| `pg:<pgId>` | Property-wide broadcast room | All residents, staff, and admins belonging to that PG |
| `branch:<branchId>` | Branch facility broadcast room | All residents and branch staff assigned to that branch |

### 3.2 Dynamic Topic Rooms

| Room Name Pattern | Description | Join Trigger | Leave Trigger |
| :--- | :--- | :--- | :--- |
| `post:<postId>` | Live comment/like thread for a specific community post | Inbound `subscribe:post` | Inbound `unsubscribe:post` or disconnect |

### 3.3 Server Dispatcher Methods (`socketService`)

```javascript
socketService.emitToUser(userId, event, payload);      // Sends to user:<userId>
socketService.emitToPg(pgId, event, payload);          // Sends to pg:<pgId>
socketService.emitToBranch(branchId, event, payload);  // Sends to branch:<branchId>
socketService.emitToRole(role, event, payload);        // Sends to role:<role>
socketService.emitToPgAdmins(pgId, event, payload);    // Sends to admins/super admins of PG
socketService.emitToPost(postId, event, payload);      // Sends to post:<postId> thread
socketService.emitToAll(event, payload);               // Broadcasts globally
```

---

## 4. Inbound Client-to-Server Events

Clients can emit these events to control dynamic room subscriptions.

### 4.1 `subscribe:post`
Subscribes the client's socket connection to live updates for a specific community post's discussion thread.

- **Direction**: Client $\rightarrow$ Server
- **Syntax**: `socket.emit('subscribe:post', postId)`
- **Parameters**: `postId` (Number / String)
- **Effect**: Socket joins `post:<postId>`

```javascript
// Example: User opens community post detail screen
socket.emit('subscribe:post', 42);
```

### 4.2 `unsubscribe:post`
Unsubscribes the socket from a community post thread.

- **Direction**: Client $\rightarrow$ Server
- **Syntax**: `socket.emit('unsubscribe:post', postId)`
- **Parameters**: `postId` (Number / String)
- **Effect**: Socket leaves `post:<postId>`

```javascript
// Example: User navigates back from community post detail screen
socket.emit('unsubscribe:post', 42);
```

---

## 5. Outbound Server-to-Client Event Catalog

Below is the complete inventory of all real-time events dispatched by the backend services.

---

### 5.1 Maintenance & Complaints Module

#### 1. `complaint:new`
Dispatched when a new complaint is filed or when a complaint is assigned to a staff member.

- **Trigger A (New Complaint)**:
  - **Location**: [`src/services/complaint.service.js:297`](file:///d:/HomeNest_Backend/src/services/complaint.service.js#L297) (`createComplaint`)
  - **Audience**: Property Admins & Super Admins (`emitToPgAdmins`)
  - **Payload**:
    ```json
    {
      "id": 14,
      "complaint_number": "CMP-202611-0014",
      "title": "Air Conditioner not cooling",
      "status": "PENDING",
      "room_id": 50,
      "resident_id": 167,
      "created_at": "2026-11-19T10:45:00.000Z"
    }
    ```

- **Trigger B (Assigned to Staff)**:
  - **Location**: [`src/services/complaint.service.js:760`](file:///d:/HomeNest_Backend/src/services/complaint.service.js#L760) (`assignComplaint`)
  - **Audience**: Assigned Staff Member (`emitToUser`)
  - **Payload**:
    ```json
    {
      "id": 14,
      "complaint_number": "CMP-202611-0014",
      "title": "Air Conditioner not cooling",
      "due_date": "2026-11-21"
    }
    ```

#### 2. `complaint:status_updated`
Dispatched whenever the status of a complaint changes (e.g. `PENDING` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `RESOLVED` / `REJECTED`).

- **Location**: [`src/services/complaint.service.js:846-854`](file:///d:/HomeNest_Backend/src/services/complaint.service.js#L846-L854) (`updateComplaintStatus`)
- **Audience**:
  - The resident who filed the complaint (`emitToUser`)
  - Property Admins (`emitToPgAdmins`)
- **Payload**:
  ```json
  {
    "id": 14,
    "complaint_number": "CMP-202611-0014",
    "old_status": "PENDING",
    "status": "RESOLVED",
    "resolution_notes": "AC capacitor replaced and cooling restored.",
    "updated_at": "2026-11-19T11:15:30.000Z"
  }
  ```

#### 3. `complaint:activity`
Dispatched when administrative actions are taken on a complaint, such as assigning staff or scheduling a due date.

- **Location**: [`src/services/complaint.service.js:753`](file:///d:/HomeNest_Backend/src/services/complaint.service.js#L753) (`assignComplaint`)
- **Audience**: Resident who filed the complaint (`emitToUser`)
- **Payload**:
  ```json
  {
    "id": 14,
    "complaint_number": "CMP-202611-0014",
    "type": "ASSIGNED",
    "assigned_to": "Ramesh (HVAC Tech)",
    "due_date": "2026-11-21"
  }
  ```

---

### 5.2 Notices & Broadcasts Module

#### 4. `notice:new`
Dispatched when a notice or announcement is published immediately upon creation or when a draft/scheduled notice is sent.

- **Location**: [`src/services/notice.service.js:760-764`](file:///d:/HomeNest_Backend/src/services/notice.service.js#L760-L764) (`emitNoticeRealTime` via `createNotice` / `sendNotice`)
- **Audience**:
  - If `audience_type === 'resident'`: Specific resident (`emitToUser`)
  - If `audience_type === 'branch'`: Specific branch members (`emitToBranch`)
  - If `audience_type === 'all'`: Entire PG property members (`emitToPg`)
- **Payload**:
  ```json
  {
    "id": 8,
    "title": "Scheduled Power Backup Maintenance",
    "category": "Maintenance",
    "priority": "high",
    "content": "Generator testing will occur today between 3:00 PM and 4:00 PM. Elevators will operate normally.",
    "sent_at": "2026-11-19T09:30:00.000Z",
    "audience_type": "all"
  }
  ```

---

### 5.3 Community Feed & Social Hub Module

#### 5. `community:post_new`
Dispatched when any resident or admin publishes a new community post.

- **Location**: [`src/services/community.service.js:313`](file:///d:/HomeNest_Backend/src/services/community.service.js#L313) (`createPost`)
- **Audience**: All residents and staff in the PG property (`emitToPg`)
- **Payload**:
  ```json
  {
    "id": 29,
    "author": {
      "id": 167,
      "name": "Jash Patel",
      "room_no": "101",
      "role": "resident",
      "subtitle": "101 • Just now",
      "profile_photo_url": "http://localhost:5000/uploads/users/avatar-167.jpg"
    },
    "content": "Looking for a badminton partner for Saturday evening at the community court!",
    "image_url": null,
    "category": "activity",
    "likes_count": 0,
    "comments_count": 0,
    "is_liked": false,
    "time_ago": "Just now",
    "created_at": "2026-11-19T11:00:00.000Z",
    "updated_at": "2026-11-19T11:00:00.000Z"
  }
  ```

#### 6. `community:post_liked`
Dispatched when a post is liked or unliked.

- **Location**: [`src/services/community.service.js:455-461`](file:///d:/HomeNest_Backend/src/services/community.service.js#L455-L461) (`toggleLikePost`)
- **Audience**:
  - Entire PG feed (`emitToPg`)
  - Users viewing the post thread (`emitToPost`)
- **Payload**:
  ```json
  {
    "post_id": 29,
    "likes_count": 4,
    "is_liked": true,
    "user_id": 167
  }
  ```

#### 7. `community:comment_new`
Dispatched when a new comment is posted on a community post.

- **Location**: [`src/services/community.service.js:584-630`](file:///d:/HomeNest_Backend/src/services/community.service.js#L584-L630) (`createComment`)
- **Audience**:
  - Entire PG feed (`emitToPg`)
  - Users viewing the post thread (`emitToPost`)
- **Payload**:
  ```json
  {
    "post_id": 29,
    "comment": {
      "id": 61,
      "content": "I'm in! Let's play around 5 PM.",
      "author": {
        "id": 172,
        "name": "Aman Sharma"
      },
      "created_at": "2026-11-19T11:05:00.000Z"
    }
  }
  ```

#### 8. `notification:new`
Dispatched directly to a user when another resident interacts with their content.

- **Triggers**:
  - Post liked by another user: [`src/services/community.service.js:469`](file:///d:/HomeNest_Backend/src/services/community.service.js#L469)
  - Post commented on by another user: [`src/services/community.service.js:610`](file:///d:/HomeNest_Backend/src/services/community.service.js#L610)
- **Audience**: Post Author (`emitToUser`)
- **Payload (Like)**:
  ```json
  {
    "title": "New Like on your post",
    "message": "Aman Sharma liked your post.",
    "post_id": 29
  }
  ```
- **Payload (Comment)**:
  ```json
  {
    "title": "New Comment on your post",
    "message": "Aman Sharma commented on your post: \"I'm in! Let's play around 5 PM...\"",
    "post_id": 29
  }
  ```

---

### 5.4 Visitor Management & Gate Access Module

#### 9. `visitor:status_updated`
Dispatched when a visitor pass is approved, rejected, or updated by Property Management or Security.

- **Location**: [`src/services/visitor.service.js:768-775`](file:///d:/HomeNest_Backend/src/services/visitor.service.js#L768-L775) (`updatePassStatus`)
- **Audience**:
  - Resident hosting the visitor (`emitToUser`)
  - Property Admins (`emitToPgAdmins`)
- **Payload**:
  ```json
  {
    "id": 19,
    "visitor_name": "Rohan Mehta",
    "status": "approved",
    "pass_code": "VP-582910",
    "updated_at": "2026-11-19T12:00:00.000Z"
  }
  ```

#### 10. `visitor:entry`
Dispatched when security records a visitor entering or exiting the property gate.

- **Location**: [`src/services/visitor.service.js:908-969`](file:///d:/HomeNest_Backend/src/services/visitor.service.js#L908-L969) (`recordGateLog`)
- **Audience**: Resident hosting the visitor (`emitToUser`)
- **Payload (Gate Entry / Check-in)**:
  ```json
  {
    "visitor_id": 19,
    "visitor_name": "Rohan Mehta",
    "action": "ENTRY",
    "direction": "IN",
    "gate_name": "Main Gate",
    "log_time": "12:15 PM"
  }
  ```
- **Payload (Gate Exit / Check-out)**:
  ```json
  {
    "visitor_id": 19,
    "visitor_name": "Rohan Mehta",
    "action": "EXIT",
    "direction": "OUT",
    "gate_name": "Main Gate",
    "log_time": "02:30 PM"
  }
  ```

---

### 5.5 Room Shifts & Move Requests Module

#### 11. `room_shift:new`
Dispatched when a resident files a request to shift to another room or bed.

- **Location**: [`src/services/room.service.js:882-893`](file:///d:/HomeNest_Backend/src/services/room.service.js#L882-L893) (`createRoomShiftRequest`)
- **Audience**:
  - Property Admins (`emitToPgAdmins`)
  - Target Resident (if created on resident's behalf by Admin) (`emitToUser`)
- **Payload**:
  ```json
  {
    "id": 7,
    "resident_id": 167,
    "current_room_id": 50,
    "requested_room_id": 52,
    "reason": "Requesting 1st floor room due to leg injury",
    "created_at": "2026-11-19T13:00:00.000Z"
  }
  ```

#### 12. `room_shift:status_updated`
Dispatched when Admin approves, rejects, or changes the status of a room shift request.

- **Location**: [`src/services/room.service.js:1198`](file:///d:/HomeNest_Backend/src/services/room.service.js#L1198) (`reviewShiftRequest`)
- **Audience**: Resident who filed the shift request (`emitToUser`)
- **Payload**:
  ```json
  {
    "id": 7,
    "status": "approved",
    "admin_notes": "Room 103 approved. Handover keys on Friday 10 AM.",
    "reviewed_at": "2026-11-19T13:30:00.000Z"
  }
  ```

---

### 5.6 Stay Clearance & Checkout Module

#### 13. `checkout:new`
Dispatched when a resident submits a request to vacate/checkout of their stay.

- **Location**: [`src/services/stay.service.js:599`](file:///d:/HomeNest_Backend/src/services/stay.service.js#L599) (`createCheckoutRequest`)
- **Audience**: Property Admins & Super Admins (`emitToPgAdmins`)
- **Payload**:
  ```json
  {
    "id": 11,
    "resident_id": 167,
    "room_id": 50,
    "departure_date": "2026-12-01",
    "reason": "Course completed and returning home",
    "created_at": "2026-11-19T14:00:00.000Z"
  }
  ```

#### 14. `checkout:status_updated`
Dispatched when Admin reviews and updates the status of a checkout request (e.g. `approved`, `rejected`).

- **Location**: [`src/services/stay.service.js:1764`](file:///d:/HomeNest_Backend/src/services/stay.service.js#L1764) (`reviewCheckoutRequest`)
- **Audience**: Resident who submitted the checkout request (`emitToUser`)
- **Payload**:
  ```json
  {
    "id": 11,
    "status": "approved",
    "admin_notes": "Inspection scheduled. Security deposit refund will process within 3 business days.",
    "updated_at": "2026-11-19T14:30:00.000Z"
  }
  ```

---

### 5.7 Architectural Constants & Reserved Events

Defined in [`src/services/socket.service.js:10-41`](file:///d:/HomeNest_Backend/src/services/socket.service.js#L10-L41) for extended real-time capabilities:

| Constant Name | Event String | Purpose / Recommended Usage |
| :--- | :--- | :--- |
| `SOCKET_EVENTS.VISITOR_NEW` | `visitor:new` | Pre-alert when a resident pre-registers a visitor |
| `SOCKET_EVENTS.COMMUNITY_EVENT_UPDATED` | `community:event_updated` | Real-time updates to community event schedules or RSVPs |
| `SOCKET_EVENTS.DASHBOARD_STATS_UPDATED` | `dashboard:stats_updated` | Live push to admin dashboards to trigger KPI refresh without reload |

---

## 6. Socket Events Quick-Reference Master Table

| # | Event Name | Direction | Target Room / Recipient | Trigger Action | Emitting Service & Line |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **1** | `dashboard:stats_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Any key metric change (rooms, residents, payments, complaints) | Centralized across all core mutation services |
| **2** | `room:stats_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Room created, updated, deleted, or resident shift/occupancy updated | [`room.service.js`](file:///d:/HomeNest_Backend/src/services/room.service.js), [`stay.service.js`](file:///d:/HomeNest_Backend/src/services/stay.service.js) |
| **3** | `room:new` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | New room added to inventory | [`room.service.js`](file:///d:/HomeNest_Backend/src/services/room.service.js) |
| **4** | `room:updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Room status or capacity updated | [`room.service.js`](file:///d:/HomeNest_Backend/src/services/room.service.js) |
| **5** | `room:deleted` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Room removed from inventory | [`room.service.js`](file:///d:/HomeNest_Backend/src/services/room.service.js) |
| **6** | `room_shift:new` | S $\rightarrow$ C | `pg:<pgId>` (Admins) / `user:<residentId>` | Resident submits room shift request | [`room.service.js:882, 893`](file:///d:/HomeNest_Backend/src/services/room.service.js#L882) |
| **7** | `room_shift:status_updated` | S $\rightarrow$ C | `user:<residentId>` | Admin approves or rejects room shift | [`room.service.js:1198`](file:///d:/HomeNest_Backend/src/services/room.service.js#L1198) |
| **8** | `payment:stats_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Payment recorded, paid, updated, or deleted | [`payment.service.js`](file:///d:/HomeNest_Backend/src/services/payment.service.js) |
| **9** | `payment:new` | S $\rightarrow$ C | `pg:<pgId>` (Admins) / `user:<residentId>` | New payment invoice / demand generated | [`payment.service.js`](file:///d:/HomeNest_Backend/src/services/payment.service.js) |
| **10** | `payment:status_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) / `user:<residentId>` | Payment paid, verified, or updated | [`payment.service.js`](file:///d:/HomeNest_Backend/src/services/payment.service.js) |
| **11** | `resident:stats_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Resident registered, updated, checked out, or deleted | [`user.service.js`](file:///d:/HomeNest_Backend/src/services/user.service.js), [`stay.service.js`](file:///d:/HomeNest_Backend/src/services/stay.service.js) |
| **12** | `user:new` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | New user / resident created | [`user.service.js`](file:///d:/HomeNest_Backend/src/services/user.service.js) |
| **13** | `user:updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | User profile or status updated | [`user.service.js`](file:///d:/HomeNest_Backend/src/services/user.service.js) |
| **14** | `staff:stats_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Staff added, role changed, status updated, or deleted | [`user.service.js`](file:///d:/HomeNest_Backend/src/services/user.service.js) |
| **15** | `branch:stats_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Branch created, updated, or deleted | [`branch.service.js`](file:///d:/HomeNest_Backend/src/services/branch.service.js) |
| **16** | `building:stats_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Building or floor created, updated, or removed | [`building.service.js`](file:///d:/HomeNest_Backend/src/services/building.service.js) |
| **17** | `complaint:stats_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Complaint created, status updated, or resolved | [`complaint.service.js`](file:///d:/HomeNest_Backend/src/services/complaint.service.js) |
| **18** | `complaint:new` | S $\rightarrow$ C | `pg:<pgId>` (Admins) / `user:<staffId>` | Resident creates complaint or Admin assigns to staff | [`complaint.service.js:297, 760`](file:///d:/HomeNest_Backend/src/services/complaint.service.js#L297) |
| **19** | `complaint:status_updated` | S $\rightarrow$ C | `user:<residentId>` & `pg:<pgId>` (Admins) | Admin/Staff updates complaint status | [`complaint.service.js:846, 854`](file:///d:/HomeNest_Backend/src/services/complaint.service.js#L846) |
| **20** | `complaint:activity` | S $\rightarrow$ C | `user:<residentId>` | Admin assigns staff or updates due date | [`complaint.service.js:753`](file:///d:/HomeNest_Backend/src/services/complaint.service.js#L753) |
| **21** | `visitor:stats_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Visitor pass created, status updated, or gate entry/exit logged | [`visitor.service.js`](file:///d:/HomeNest_Backend/src/services/visitor.service.js) |
| **22** | `visitor:new` | S $\rightarrow$ C | `pg:<pgId>` (Admins) / `user:<residentId>` | New visitor pass generated | [`visitor.service.js`](file:///d:/HomeNest_Backend/src/services/visitor.service.js) |
| **23** | `visitor:status_updated` | S $\rightarrow$ C | `user:<residentId>` & `pg:<pgId>` (Admins) | Visitor pass approved, rejected, or changed | [`visitor.service.js:768, 775`](file:///d:/HomeNest_Backend/src/services/visitor.service.js#L768) |
| **24** | `visitor:entry` | S $\rightarrow$ C | `user:<residentId>` | Security logs visitor Entry or Exit at gate | [`visitor.service.js:908, 969`](file:///d:/HomeNest_Backend/src/services/visitor.service.js#L908) |
| **25** | `notice:stats_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Notice created, scheduled, broadcasted, or deleted | [`notice.service.js`](file:///d:/HomeNest_Backend/src/services/notice.service.js) |
| **26** | `notice:new` | S $\rightarrow$ C | `pg:<pgId>` / `branch:<branchId>` / `user:<residentId>` | Admin publishes or sends a notice | [`notice.service.js:760-764`](file:///d:/HomeNest_Backend/src/services/notice.service.js#L760) |
| **27** | `laundry:stats_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Laundry order created, status changed, or cancelled | [`laundry.service.js`](file:///d:/HomeNest_Backend/src/services/laundry.service.js) |
| **28** | `laundry:new` | S $\rightarrow$ C | `pg:<pgId>` (Admins) / `user:<residentId>` | New laundry pickup request placed | [`laundry.service.js`](file:///d:/HomeNest_Backend/src/services/laundry.service.js) |
| **29** | `laundry:status_updated` | S $\rightarrow$ C | `user:<residentId>` & `pg:<pgId>` (Admins) | Laundry order marked in-progress or completed | [`laundry.service.js`](file:///d:/HomeNest_Backend/src/services/laundry.service.js) |
| **30** | `subscription:stats_updated` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Subscription plan created, updated, or removed | [`subscription.service.js`](file:///d:/HomeNest_Backend/src/services/subscription.service.js) |
| **31** | `community:post_new` | S $\rightarrow$ C | `pg:<pgId>` | Resident or Admin creates community post | [`community.service.js:313`](file:///d:/HomeNest_Backend/src/services/community.service.js#L313) |
| **32** | `community:post_liked` | S $\rightarrow$ C | `pg:<pgId>` & `post:<postId>` | User toggles like on post | [`community.service.js:455, 461`](file:///d:/HomeNest_Backend/src/services/community.service.js#L455) |
| **33** | `community:comment_new` | S $\rightarrow$ C | `pg:<pgId>` & `post:<postId>` | User comments on post | [`community.service.js:584, 596`](file:///d:/HomeNest_Backend/src/services/community.service.js#L584) |
| **34** | `notification:new` | S $\rightarrow$ C | `user:<postAuthorId>` | Post author notified of likes or comments | [`community.service.js:469, 610`](file:///d:/HomeNest_Backend/src/services/community.service.js#L469) |
| **35** | `checkout:new` | S $\rightarrow$ C | `pg:<pgId>` (Admins) | Resident submits checkout/vacate request | [`stay.service.js:599`](file:///d:/HomeNest_Backend/src/services/stay.service.js#L599) |
| **36** | `checkout:status_updated` | S $\rightarrow$ C | `user:<residentId>` | Admin approves or updates checkout request | [`stay.service.js:1764`](file:///d:/HomeNest_Backend/src/services/stay.service.js#L1764) |
| **37** | `subscribe:post` | C $\rightarrow$ S | `post:<postId>` | Client enters community post thread | [`socket.service.js:168`](file:///d:/HomeNest_Backend/src/services/socket.service.js#L168) |
| **38** | `unsubscribe:post` | C $\rightarrow$ S | `post:<postId>` | Client leaves community post thread | [`socket.service.js:174`](file:///d:/HomeNest_Backend/src/services/socket.service.js#L174) |

---

## 7. Client Integration Guide (React / React Native / Mobile)

### 7.1 Socket Singleton Manager

```typescript
// socket.ts
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const initializeSocket = (token: string): Socket => {
  if (socket?.connected) return socket;

  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000', {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected successfully with ID:', socket?.id);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection failed:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  return socket;
};

export const getSocket = (): Socket | null => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
```

### 7.2 React Hook Implementation

```typescript
// useSocketEvent.ts
import { useEffect } from 'react';
import { getSocket } from './socket';

export const useSocketEvent = <T = any>(event: string, handler: (data: T) => void) => {
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on(event, handler);

    return () => {
      socket.off(event, handler);
    };
  }, [event, handler]);
};
```

### 7.3 Component Example: Live Visitor & Complaint Alerts

```tsx
import React, { useCallback } from 'react';
import { useSocketEvent } from './useSocketEvent';
import { toast } from 'react-hot-toast';

export const ResidentNotificationListener = () => {
  // 1. Listen for Visitor Arrival at Gate
  useSocketEvent('visitor:entry', useCallback((data) => {
    if (data.action === 'ENTRY') {
      toast.success(`Visitor arrived: ${data.visitor_name} checked in at ${data.gate_name}`);
    } else {
      toast.info(`Visitor departed: ${data.visitor_name} checked out`);
    }
  }, []));

  // 2. Listen for Complaint Status Updates
  useSocketEvent('complaint:status_updated', useCallback((data) => {
    toast(`Complaint #${data.complaint_number} is now ${data.status}`);
  }, []));

  // 3. Listen for Property Notices
  useSocketEvent('notice:new', useCallback((notice) => {
    toast(`New Notice: ${notice.title}`, { icon: '📢' });
  }, []));

  return null;
};
```
