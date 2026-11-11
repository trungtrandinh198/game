# Security Checklist — OWASP ASVS Level 1

Rà soát trước khi lên production. Đánh dấu ✅ khi đã xác nhận.

## 1. Authentication

- [ ] Password hashing: bcrypt/argon2 (không dùng MD5/SHA1)
- [ ] Session token: JWT HS256, secret >= 256 bit, rotation định kỳ
- [ ] Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`
- [ ] Login rate limit: 10 lần/15 phút/IP+email, 50 lần/15 phút/IP
- [ ] Account lockout sau 5 lần sai (tạm khóa 15 phút)
- [ ] Email verification trước khi dùng (nếu bật)
- [ ] Password reset: token 1 lần, hết hạn 1 giờ, thu hồi mọi session

## 2. Authorization

- [ ] RBAC: mọi endpoint admin yêu cầu permission code
- [ ] User không truy cập được dữ liệu của user khác (404, không 403)
- [ ] Realtime: ticket 1 lần, verify JWT, check suspend
- [ ] Admin audit log ghi mọi thao tác moderation

## 3. Input Validation

- [ ] Zod schema cho mọi request body/query/params
- [ ] Display name: normalize dấu, max 24 ký tự, từ cấm
- [ ] Bio: max 160 ký tự
- [ ] Appearance config: whitelist keys, validate màu
- [ ] Body size limit: 100 KB
- [ ] SQL injection: Drizzle ORM parameterized queries
- [ ] XSS: React auto-escape, CSP header

## 4. Rate Limiting

- [ ] Global: 120 req/phút/IP
- [ ] Auth endpoints: riêng (login, register, forgot, reset)
- [ ] WebSocket: giới hạn kết nối/IP
- [ ] 429 response với `Retry-After` header

## 5. CSRF

- [ ] `X-DNW-CSRF` header required cho POST/PATCH/DELETE
- [ ] Origin check: phải match `APP_BASE_URL`
- [ ] Cookie `SameSite=Lax`

## 6. HTTP Security Headers

- [ ] `Strict-Transport-Security` (HSTS)
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Content-Security-Policy` (Next.js)
- [ ] Helmet (API)
- [ ] Không expose `Server` header

## 7. Secrets Management

- [ ] Không có `.env` trong Git (`.gitignore`)
- [ ] gitleaks scan trong CI
- [ ] Secrets qua environment variables / secret manager
- [ ] `pnpm audit --prod` không có lỗi high/critical
- [ ] Database/Redis không expose port ra Internet

## 8. Data Protection

- [ ] Password: bcrypt cost >= 12
- [ ] Token email: SHA-256 hash trong DB
- [ ] Session token: SHA-256 hash trong DB
- [ ] PII: không log password, token, cookie
- [ ] Object storage: private bucket, signed URL

## 9. Infrastructure

- [ ] Docker: non-root user
- [ ] Docker: chỉ copy artifact cần thiết
- [ ] Caddy: TLS tự động (ACME), HTTP -> HTTPS redirect
- [ ] PostgreSQL: chỉ reachable từ internal network
- [ ] Redis: requirepass, chỉ internal
- [ ] Backup: daily pg_dump, versioning on object storage

## 10. Monitoring & Logging

- [ ] Structured logs (pino) ra stdout
- [ ] Không log sensitive data
- [ ] `/healthz` và `/readyz` cho uptime check
- [ ] `/metrics` (Prometheus) chỉ internal
- [ ] Sentry cho error tracking
- [ ] Alert khi error rate > 1%

## 11. Dependency Security

- [ ] `pnpm audit --prod` trong CI
- [ ] Dependabot/Renovate cho updates
- [ ] Lock file committed
- [ ] Image scan (Trivy) trước khi push

## 12. WebSocket Security

- [ ] Ticket 1 lần (jti unique)
- [ ] JWT verify trước khi join
- [ ] Check suspend/ban trước khi join
- [ ] Rate limit message rate
- [ ] Max connections per IP
- [ ] Protocol version check
