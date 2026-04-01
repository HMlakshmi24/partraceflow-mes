# 🟡 Missing Features & Production Roadmap
**ParTraceflow MES** | What's Not Yet Implemented

---

## Executive Overview

ParTraceflow MES is **feature-complete for MVP/demo purposes** but requires **4–6 weeks of additional work** to reach production-grade status. This document catalogs everything that's missing and provides implementation guidance.

**Current Gap**: ~40% of production requirements | **Effort Needed**: 200–300 developer-hours

---

## 🔴 Critical Blockers (Must Have for Production)

These features **block production deployment**. Without them, the system is not safe for manufacturing floor use.

### 1. Authentication & Authorization ⚠️ BLOCKING
**Status**: ❌ Not implemented (all APIs open)  
**Severity**: 🔴 CRITICAL  
**Effort**: 3–5 days | **Complexity**: High

**What's Missing:**
- [ ] JWT token generation & validation middleware
- [ ] OAuth2 / OIDC integration (Okta, Azure AD, etc.)
- [ ] Role-based access control (RBAC) for API endpoints
- [ ] User login form on frontend
- [ ] Session management & token refresh
- [ ] API key management for service-to-service calls
- [ ] Rate limiting per user/API key
- [ ] Audit logging of all auth events

**Current Problems:**
```
Anyone can:
- Create manufacturing orders (financial impact)
- Deploy workflows (operational risk)
- Trigger quality checks (compliance risk)
- Access all event data
- Modify or delete any record
```

**Implementation Steps:**
1. Choose auth method (JWT + local, OAuth, both)
2. Add middleware to protect `/api/*` routes
3. Add login page (form or OAuth button)
4. Implement token storage (localStorage/sessionStorage)
5. Add user context to audit logs
6. Test all endpoints require valid auth
7. Document API key usage for integrations

**Recommended Libraries:**
- `next-auth` (v4+) for OAuth/credentials
- `jsonwebtoken` for JWT if custom implementation
- `passport.js` alternative if needed

---

### 2. Secrets Management & Environment Variables ⚠️ BLOCKING
**Status**: ❌ Not implemented (env vars in .env file)  
**Severity**: 🔴 CRITICAL  
**Effort**: 1–2 days | **Complexity**: Medium

**What's Missing:**
- [ ] Secrets vault integration (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault)
- [ ] Encrypted database credentials
- [ ] API key rotation mechanism
- [ ] Secure credential injection in CI/CD
- [ ] Audit trail for secrets access
- [ ] Environment-specific configs (dev/staging/prod)

**Current Problems:**
```
Database password in .env file (visible in git history)
No encryption for sensitive data
No audit of who accessed secrets
Secrets mixed with regular config
```

**Implementation Steps:**
1. Choose vault solution (AWS Secrets is easiest for AWS)
2. Update database connection to fetch from vault
3. Move all API keys to vault
4. Update CI/CD to inject secrets at runtime
5. Remove .env from git (add to .gitignore)
6. Document secrets management process

**Recommended Solutions:**
- **AWS**: AWS Secrets Manager (managed service)
- **Azure**: Azure Key Vault (managed service)
- **On-premise**: HashiCorp Vault (self-hosted)
- **Development**: `.env.local` + `.env.example` (never commit secrets)

---

### 3. Database Hardening (Postgres Migration) ⚠️ BLOCKING
**Status**: 🟡 Partial (SQLite dev, Postgres path exists)  
**Severity**: 🔴 CRITICAL  
**Effort**: 2–3 days | **Complexity**: High

**What's Missing:**
- [ ] Postgres migration scripts (data transfer from SQLite)
- [ ] Connection pooling (PgBouncer or built-in)
- [ ] SSL/TLS encryption for DB connections
- [ ] Automated backups (daily, with retention)
- [ ] Backup restore testing procedure
- [ ] Database indexing optimization (production queries)
- [ ] Replication/failover configuration (HA)
- [ ] Database user roles (read-only, admin, etc.)

**Current Problems:**
```
SQLite file-based DB cannot handle 1000+ concurrent users
No encryption in transit to database
No automated backups
No high-availability setup
```

**Current Status:**
```prisma
// Current (dev)
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")  // file:./prisma/dev.db
}

// Needed (prod)
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // postgresql://user:pass@host/db?sslmode=require
}
```

**Implementation Steps:**
1. Provision Postgres instance (AWS RDS, Azure, or self-hosted)
2. Create new empty Postgres database
3. Run `npx prisma db push` against Postgres
4. Write data migration script (SQLite → Postgres)
5. Test migration with production-like data volume
6. Set up SSL certificates
7. Configure connection pooling
8. Set up automated daily backups
9. Test backup restore procedure
10. Update `.env` with Postgres connection string

**Pre-Production Checklist:**
- [ ] Postgres instance created with minimal 2vCPU, 4GB RAM
- [ ] SSL/TLS enabled for all connections
- [ ] Automated backups configured (daily, 30-day retention)
- [ ] Backup restore tested successfully
- [ ] Connection pooling configured (max 50-100 connections)
- [ ] User roles set up (app can only read/write, not drop tables)
- [ ] Query performance tested (orders, workflows, events queries <100ms)

---

## 🟡 High Priority (Production Will Fail Without These)

### 4. API Rate Limiting & Throttling
**Status**: ❌ Not implemented  
**Severity**: 🟡 HIGH  
**Effort**: 1 day | **Complexity**: Medium

**What's Missing:**
- [ ] Rate limiting middleware per IP / per API key
- [ ] Request throttling (max 1000 req/min)
- [ ] Queue depth monitoring
- [ ] Graceful degradation under load
- [ ] Metrics dashboard (requests/sec, latency)

**Current Problem**: Without limits, a single user can overwhelm the system with requests, causing denial of service.

**Recommended Library**: `express-rate-limit` (or `next-rate-limit`)

**Implementation:**
```typescript
// Add to all /api/* routes
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  keyGenerator: (req) => req.user.id || req.ip,
});
```

---

### 5. Error Handling & Monitoring
**Status**: 🟡 Partial (basic logging)  
**Severity**: 🟡 HIGH  
**Effort**: 2–3 days | **Complexity**: Medium

**What's Missing:**
- [ ] Centralized error logging (Sentry, LogRocket, etc.)
- [ ] Error alerting (PagerDuty, email on critical errors)
- [ ] Performance monitoring (APM: Datadog, New Relic, etc.)
- [ ] Request tracing (correlation IDs)
- [ ] Health check endpoint (`/api/health`)
- [ ] Graceful error messages to clients
- [ ] Error recovery & retry logic

**Current Problem**: Errors are logged to console only; production won't have visibility.

**Recommended Services:**
- **Errors**: Sentry (best free tier)
- **Logs**: ELK Stack or Datadog
- **Metrics**: Prometheus + Grafana (open source)
- **Tracing**: Jaeger (open source) or Datadog APM

---

### 6. Real Hardware Connectors
**Status**: 🟡 All stubs only (no real integrations)  
**Severity**: 🟡 HIGH  
**Effort**: 2–4 weeks per connector | **Complexity**: Very High

**What's Missing:**

#### ERP Connector (NetSuite / SAP)
- [ ] OAuth2 authentication to NetSuite/SAP
- [ ] Create purchase orders → MES work orders
- [ ] Update order status back to ERP
- [ ] Fetch real inventory data
- [ ] Real product catalog sync
- [ ] Error handling & retry on ERP timeout
- [ ] Data mapping (ERP fields → MES fields)
- [ ] Audit trail of all ERP calls

**Current**: Stubs in `lib/connectors/erpConnector.ts`

#### PLC / Modbus Connector
- [ ] Modbus TCP/RTU protocol implementation
- [ ] Read tags from PLC (pressure, temperature, etc.)
- [ ] Write tags to PLC (start/stop commands)
- [ ] Connection pooling & keep-alive
- [ ] Graceful handling of PLC disconnects
- [ ] Retry logic with exponential backoff
- [ ] Event subscription (real-time updates)
- [ ] Data validation & unit conversion

**Current**: Stubs in `lib/connectors/plcConnector.ts`

#### RFID Reader Connector
- [ ] Support multiple RFID protocols (EPC, ISO 18000)
- [ ] Real-time tag reading
- [ ] Tag filtering (ignore duplicates within 500ms)
- [ ] Antenna/reader configuration
- [ ] Geo-tagging (which reader, which location)
- [ ] Tag deduplication logic
- [ ] Event batching (group reads)

**Current**: Stubs in `lib/connectors/rfidConnector.ts`

**Effort Breakdown:**
- 1–2 weeks to understand vendor APIs
- 1–2 weeks implementation & testing
- 2–3 days integration testing with real hardware

---

### 7. Data Validation & Input Sanitization
**Status**: 🟡 Partial (basic Zod validation)  
**Severity**: 🟡 MEDIUM-HIGH  
**Effort**: 2–3 days | **Complexity**: Medium

**What's Missing:**
- [ ] Input sanitization (SQL injection prevention)
- [ ] XSS prevention (HTML escaping)
- [ ] CSRF token validation
- [ ] File upload validation (size, type, scanning)
- [ ] Business logic validation (e.g., due date > today)
- [ ] Field-level validation rules
- [ ] Rate limiting on failed validation attempts

**Current Status**: Prisma ORM prevents SQL injection automatically; basic Zod schemas exist but inconsistent.

---

## 🟡 Medium Priority (Production Strongly Recommended)

### 8. Workflow Engine Enhancements
**Status**: 🟡 Basic linear flows only  
**Severity**: 🟡 MEDIUM  
**Effort**: 1–2 weeks | **Complexity**: High

**What's Missing:**
- [ ] Parallel gateway support (AND, OR logic)
- [ ] Merge gateway implementation
- [ ] Dynamic decision gates (with conditions)
- [ ] SubProcess / nested workflows
- [ ] Loop/repeat constructs
- [ ] Error handling nodes (catch, retry, escalate)
- [ ] Boundary events (timers, signals)
- [ ] Compensations (undo/rollback)
- [ ] Workflow versioning & migration

**Current Status**: Only sequential flows with basic XOR gateways work.

**Example Gap:**
```
Design a workflow with:
├─ Task 1 (Prepare Material)
├─ Task 2 & Task 3 in PARALLEL (CNC + Assembly)
└─ Task 4 (Final Assembly) — MERGED result

Currently: ❌ Can't do parallel or merges
After fix: ✅ Full BPMN 2.0 support
```

**Implementation Approach:**
1. Extend token model to track parallel branches
2. Add queue for branching decisions
3. Implement join/merge logic
4. Add loop detection (prevent infinite loops)
5. Test with complex workflows

---

### 9. Quality Decision Engine (DMN)
**Status**: ❌ Not implemented (QualityRule model exists but unused)  
**Severity**: 🟡 MEDIUM  
**Effort**: 1–2 weeks | **Complexity**: High

**What's Missing:**
- [ ] DMN (Decision Model & Notation) parser
- [ ] Decision table support
- [ ] Rule evaluation engine
- [ ] Dynamic rule updates (no need to redeploy)
- [ ] Decision history & audit
- [ ] Performance optimization (caching rules)

**Current Status**: Quality checks are manual pass/fail; no automatic decisions.

**Example Gap:**
```
Quality Rule:
IF dimension_actual BETWEEN expected ± 0.5mm THEN PASS
ELSE FAIL

Currently: ❌ Operator manually enters pass/fail
After fix: ✅ System automatically decides
```

**Recommended Library:**
- `dmn-js` (BPMN.io's DMN engine)
- `easy-rules` (simpler, no XML needed)
- Custom rule engine (most control)

---

### 10. Queue & Scheduling Engine
**Status**: 🟡 Partial (task list exists, no prioritization)  
**Severity**: 🟡 MEDIUM  
**Effort**: 1–2 weeks | **Complexity**: High

**What's Missing:**
- [ ] Task prioritization (FIFO, priority queue)
- [ ] Resource capacity constraints (machine availability)
- [ ] Due date SLA tracking & alerts
- [ ] Dynamic re-scheduling on resource conflict
- [ ] Load balancing across work centers
- [ ] Bottleneck detection
- [ ] Fair-queue dispatch (prevent starvation)

**Current Status**: Tasks created sequentially; no smart scheduling.

**Example Gap:**
```
Scenario:
- Machine M1 has 10 tasks in queue
- Task A (due now) arrives
- Machine M2 is idle

Currently: ❌ Task A waits for M1
After fix: ✅ Task A auto-routed to M2
```

---

### 11. CAD/Engineering Drawing Integration
**Status**: 🟡 UI placeholders only  
**Severity**: 🟡 MEDIUM  
**Effort**: 2–3 weeks | **Complexity**: High

**What's Missing:**
- [ ] CAD file upload & storage (S3, blob storage)
- [ ] Document versioning (revision control)
- [ ] Approval workflow (engineer signs off)
- [ ] AutoCAD / SolidWorks plugin integration
- [ ] Drawing viewer & markup (annotation)
- [ ] Change tracking (ECO/ECN support)
- [ ] Linking drawings to work orders

**Current Status**: File upload button exists but does nothing.

**Example Gap:**
```
Operator needs part drawing to manufacture:
Currently: ❌ Not linked or versioned
After fix: ✅ Right drawing revision auto-loaded
```

---

### 12. Audit & Compliance Logging
**Status**: 🟡 Partial (SystemEvent logs exist, incomplete)  
**Severity**: 🟡 MEDIUM  
**Effort**: 3–5 days | **Complexity**: Medium

**What's Missing:**
- [ ] User identity in all audit logs (currently incomplete)
- [ ] Change tracking (old value → new value)
- [ ] Immutable audit log (write-once)
- [ ] Regulatory compliance format (21 CFR Part 11, etc.)
- [ ] Audit log retention policy enforcement
- [ ] Export audit logs for compliance review
- [ ] Automated alerts for suspicious activity

**Current Status**: Events logged, but missing user context and immutability.

---

## 🟢 Low Priority (Nice to Have)

### 13. Performance Optimization
**Status**: 🟢 Not optimized for scale  
**Severity**: 🟢 LOW  
**Effort**: 1–2 weeks | **Complexity**: High

**What's Missing:**
- [ ] Database query optimization (indexes, query analysis)
- [ ] Caching layer (Redis for frequently accessed data)
- [ ] API response compression (gzip)
- [ ] Frontend optimization (code splitting, lazy loading)
- [ ] Image optimization (thumbnails, WebP)
- [ ] Database connection pooling
- [ ] Load testing & benchmarks

**Current Status**: Not optimized, but works fine for <100 concurrent users.

---

### 14. Mobile / Responsive Operator App
**Status**: ❌ Not implemented (web-only)  
**Severity**: 🟢 LOW  
**Effort**: 2–3 weeks | **Complexity**: Medium

**What's Missing:**
- [ ] React Native app (iOS/Android)
- [ ] Offline support (sync when online)
- [ ] Push notifications for task assignments
- [ ] Barcode scanning (work order)
- [ ] Network resilience

**Current Status**: Web app scales to mobile browsers, but not native app.

---

### 15. Advanced Analytics & Reporting
**Status**: 🟡 Basic dashboard only  
**Severity**: 🟢 LOW  
**Effort**: 1–2 weeks | **Complexity**: Medium

**What's Missing:**
- [ ] Custom report builder
- [ ] Export to PDF / Excel
- [ ] Scheduled reports (email daily)
- [ ] Predictive analytics (forecast demand)
- [ ] Trend analysis (historical comparisons)
- [ ] Drill-down reports (order → task → quality)
- [ ] Dashboard customization per user role

**Current Status**: Only KPI dashboard exists.

---

### 16. Multi-Tenant Support
**Status**: ❌ Not implemented (single tenant only)  
**Severity**: 🟢 LOW  
**Effort**: 2–3 weeks | **Complexity**: Very High

**What's Missing:**
- [ ] Tenant isolation (data & application)
- [ ] Per-tenant configuration
- [ ] Tenant subscription/billing
- [ ] Data segregation in queries

**Current Status**: Single company only; no multi-tenant support.

---

### 17. CI/CD Pipeline & DevOps
**Status**: 🟡 GitHub Actions template ready  
**Severity**: 🟢 LOW  
**Effort**: 2–3 days | **Complexity**: Medium

**What's Missing:**
- [ ] Automated tests on every PR
- [ ] Code quality checks (SonarQube)
- [ ] Automated deployment to staging
- [ ] Performance tests in CI
- [ ] Security scanning (SAST, dependency check)

**Current Status**: Manual builds only; no automation.

---

### 18. Documentation & Training Materials
**Status**: 🟡 Complete dev docs, missing user training  
**Severity**: 🟢 LOW  
**Effort**: 1–2 weeks | **Complexity**: Low

**What's Missing:**
- [ ] Video tutorials
- [ ] End-user training modules
- [ ] Administrator handbook
- [ ] Troubleshooting guide
- [ ] Frequently asked questions (FAQ)

**Current Status**: Developer docs complete; user docs basic.

---

## 📊 Missing Features Summary Table

| Feature | Priority | Effort | Impact | Status |
|---------|----------|--------|--------|--------|
| **Authentication** | 🔴 CRITICAL | 3–5 days | Blocks production | ❌ None |
| **Secrets Management** | 🔴 CRITICAL | 1–2 days | Security risk | ❌ None |
| **Postgres Migration** | 🔴 CRITICAL | 2–3 days | Scalability | 🟡 Path exists |
| **Real Connectors** | 🟡 HIGH | 2–4 weeks | Functionality | 🟡 Stubs only |
| **Rate Limiting** | 🟡 HIGH | 1 day | Security/Stability | ❌ None |
| **Error Monitoring** | 🟡 HIGH | 2–3 days | Production safety | 🟡 Basic logging |
| **DMN Decision Engine** | 🟡 MEDIUM | 1–2 weeks | Functionality | ❌ None |
| **Queue Scheduling** | 🟡 MEDIUM | 1–2 weeks | Efficiency | 🟡 Basic only |
| **Workflow Enhancements** | 🟡 MEDIUM | 1–2 weeks | Advanced features | 🟡 Linear only |
| **CAD Integration** | 🟡 MEDIUM | 2–3 weeks | Usability | 🟡 UI placeholder |
| **Compliance Logging** | 🟡 MEDIUM | 3–5 days | Regulatory | 🟡 Partial |
| **Performance Tuning** | 🟢 LOW | 1–2 weeks | Scalability | ❌ Not done |
| **Mobile App** | 🟢 LOW | 2–3 weeks | Convenience | ❌ None |
| **Advanced Analytics** | 🟢 LOW | 1–2 weeks | Insights | 🟡 Basic |
| **CI/CD Pipeline** | 🟢 LOW | 2–3 days | DevOps | 🟡 Template ready |

---

## 🗺️ Production Roadmap (16-Week Plan)

### **Week 1–2: Security & Authentication** (🔴 CRITICAL)
```
Days 1–3:   JWT implementation + middleware
Days 4–6:   OAuth2 integration (Azure AD)
Days 7–10:  Login UI + session management
Days 11–14: Rate limiting + API key management
Final:      Security audit & penetration test
```

### **Week 3–4: Database & Infrastructure** (🔴 CRITICAL)
```
Days 1–3:   Postgres provisioning (RDS)
Days 4–6:   Migration script (SQLite → Postgres)
Days 7–10:  Secrets vault setup (AWS Secrets Manager)
Days 11–14: SSL/TLS + backups + replication
Final:      Load test (1000 concurrent users)
```

### **Week 5–7: Real Hardware Connectors** (🟡 HIGH)
```
Weeks 5–6:  ERP integration (NetSuite or SAP)
            PLC connector (Modbus TCP)
            RFID reader integration
Week 7:     Integration testing + error handling
```

### **Week 8–10: Advanced Features** (🟡 MEDIUM)
```
Week 8:     Workflow engine enhancements (parallel, merges)
            DMN decision engine
Week 9:     Queue scheduling & prioritization
Week 10:    CAD drawing integration
```

### **Week 11–12: Monitoring & Operations** (🟡 HIGH)
```
Week 11:    Error monitoring (Sentry)
            Performance APM (Datadog)
Week 12:    Health checks, alerts, dashboards
```

### **Week 13–14: Compliance & Audit** (🟡 MEDIUM)
```
Week 13:    Audit logging enhancements
            Compliance report generation
Week 14:    Security audit & remediation
```

### **Week 15–16: Testing & Deployment** (Final)
```
Week 15:    UAT with real users
            Performance benchmarking
Week 16:    Production deployment
            Training & documentation
```

---

## 💰 Cost Estimate (Cloud Services)

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| **AWS RDS (Postgres)** | $50–200 | Dev: db.t3.micro; Prod: db.t3.small+ |
| **AWS Secrets Manager** | $0.40/secret | ~$10/month for 25 secrets |
| **Sentry (Error Monitoring)** | $0–50 | Free tier covers MVP |
| **Datadog (APM)** | $50–500 | Depends on log volume |
| **AWS S3 (File Storage)** | $10–50 | For CAD files, backups |
| **ELK Stack (Logging)** | $0 | Self-hosted (server cost) |
| **GitHub Actions (CI/CD)** | $0 | Free for public repos |
| **Total (Baseline)** | ~$150–300/month | Scales with volume |

---

## 🎯 Go-Live Checklist (What Blocks Production)

Before going live, **all of these must be complete**:

- [ ] Authentication implemented (JWT or OAuth)
- [ ] Database migrated to Postgres
- [ ] All secrets in vault (nothing in .env)
- [ ] SSL/TLS certificates installed
- [ ] Automated backups configured & tested
- [ ] Error monitoring live (Sentry/Datadog)
- [ ] Real hardware connectors working
- [ ] Rate limiting active
- [ ] Audit logging capturing all events
- [ ] Performance benchmarks pass (>100 req/sec)
- [ ] Security audit completed & remediated
- [ ] Compliance documentation (21 CFR Part 11, etc.)
- [ ] Disaster recovery plan written & tested
- [ ] User training completed
- [ ] Support runbook prepared
- [ ] Rollback procedure documented & tested

---

## 📋 FAQ: Why Is This Missing?

**Q: Why no authentication in MVP?**  
A: MVP is for internal demo only. Production requires auth to prevent unauthorized access to manufacturing data.

**Q: Why SQLite instead of Postgres?**  
A: SQLite was fastest for development. Production needs Postgres for concurrency, backups, and replication.

**Q: Why are connectors stubs?**  
A: Real connector implementation requires vendor APIs (NetSuite, Modbus libraries, etc.) and hardware access for testing.

**Q: When will all features be done?**  
A: Following the 16-week roadmap above, full production-ready system in 4 months.

**Q: Can I deploy the current version?**  
A: **No.** Current version is for demo/testing only. Production deployment requires at least weeks 1–4 work (security, auth, database, monitoring).

**Q: What if I don't implement all features?**  
A: Prioritize by column:
1. **Must**: Authentication, Postgres, rate limiting
2. **Should**: Real connectors, error monitoring
3. **Nice**: Mobile app, analytics, CI/CD

---

## 🔗 Next Steps

1. **Review this document** with stakeholders
2. **Prioritize missing features** based on business needs
3. **Plan sprints** using the 16-week roadmap
4. **Allocate developers** (suggest 2–3 full-time)
5. **Start Week 1:** Authentication & security

---

**Current Status**: MVP ready for demo  
**Production Ready**: 16 weeks away with focused effort  
**Critical Path**: Security → Database → Monitoring

**Let's build a production-grade MES! 🚀**

