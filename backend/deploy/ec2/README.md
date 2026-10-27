# SutrAI EC2 migration review

Prepared from repository commit `3d4370e` on branch `migration/ec2-compose-review`.
This is an additive, manual deployment option. No resources are provisioned by these
files. The five original Dockerfiles, `backend/docker-compose.yml`, the application,
frontend, and `.github/workflows/deploy.yml` are preserved.

## Recommendation and blockers

Start with a **4 GiB, 2 vCPU x86_64 Linux instance**, keep the current external Redis,
MongoDB, Qdrant, buckets, Firebase, Razorpay and model/search accounts, and retain
the existing HTTPS hostname. If an ALB currently serves the API, keep it for the
first cutover using the supplied ALB override. Evaluate local Redis and removal
of the ALB as separate changes after a stable observation period.

This is a capacity hypothesis, not a benchmark or availability guarantee. A single
host loses ECS task placement/replacement and multi-host redundancy. Future Compose
recreation can interrupt in-flight requests; it is not a rolling deployment system.

**Resolve before production traffic:**

- ECS task definitions, launch type, CPU/RAM allocations, security groups, DNS,
  load balancer/target groups, health checks, certificates, runtime secret sources,
  service discovery and Redis topology are absent from the repository. The workflow
  only pushes ECR `latest` and forces deployments of pre-existing services. An
  operator must inventory actual settings and preserve an exact rollback release.
- Confirm EC2 can reach the unchanged Redis endpoint, MongoDB databases and Qdrant
  from its intended subnet/IP/security groups. An ECS-only address or private
  localhost Redis is a blocker. Preserve TLS, authentication, DB index and MongoDB
  connection options. Do not open databases to the Internet for convenience.
- Auth statically imports `../serviceAccountKey.json`. A readable matching Firebase
  service account must be mounted before startup. `GOOGLE_APPLICATION_CREDENTIALS`
  alone does not satisfy this code. No real credential file is included here.
- Agent eagerly initializes Groq, Gemini/embeddings, OpenRouter and Tavily; billing
  initializes Razorpay. Privately supply the existing credentials before startup.
  The S3 client explicitly requires `AWS_ACCESS_KEY_ID` and **`AWS_SECRET_KEY`**;
  it does not currently use the default EC2 instance-profile credential chain or
  pass a session token. IAM role support needs a separately reviewed code change.
- Qdrant adapters pass only `QDRANT_URL`, without an explicit API key. Retain the
  existing working connectivity/authentication arrangement. If the unchanged
  endpoint requires unsupported auth, stop and resolve it separately.
- All five `GET /` handlers return greetings. Mongo connections begin after listen,
  errors are logged, and greetings can remain healthy with failed databases.
  Container health alone cannot authorize cutover.
- Gateway forwards `/api/auth/*` without session middleware. Auth's `/update-plan`
  and `/deduct-credits` routes are internal mutations. The supplied Caddy config
  allows only the exact public auth paths and rejects the remaining auth subtree.
  Keep all service ports private and verify encoded/trailing-slash variants are
  rejected. This deployment guard does not fix wider application authorization.
- Existing code logs session contents and provider responses. Restrict Docker/host
  log access and retention; never paste raw logs into tickets. Fixing those logs
  is outside this migration's no-business-logic scope.

## Source inspection

| Item | Observed behavior | EC2 treatment |
| --- | --- | --- |
| Five Dockerfiles | `FROM node` floats; root + service `npm install`; context is `backend/`; working directory is the service directory | Leave intact; EC2-only Dockerfile uses Node 24 Debian slim, lockfile `npm ci`, UID 1000, direct `node index.js` |
| Startup scripts | Every `npm start` is `node index.js`; `PORT` has no fallback | Same executable, explicit ports in Compose, environment injected before module imports |
| Gateway | 8000, CORS from `FRONTEND_URL`, cookie sessions, proxy URLs from env | Host loopback only; Caddy is public ingress |
| Auth | 8001, MongoDB + Firebase + Redis | Read-only Firebase bind mount at exact import path |
| Chat | 8002, MongoDB | Private service |
| Agent | 8003, MongoDB, Redis, Qdrant, S3, remote AI/search, disk uploads | Private service, writable named upload volume |
| Billing | 8004, MongoDB + Razorpay, calls auth | Private service |
| Existing Compose | Redis only, floating image, public 6379 mapping, no volume | Leave untouched; never combine it with the new files |
| Existing CI/CD | Push to `main` builds/pushes five images, forces ECS deployments, then uploads frontend to S3/invalidates CloudFront | Unchanged; pushing the migration branch or opening its PR does not match the workflow's `main` push trigger. A merge requires separate deployment review. |

The EC2-specific `Dockerfile.dockerignore` removes environment/credential files,
node_modules, logs, existing temp files and other non-application content from its
context. Keep **all** runtime material outside `backend/` anyway. The original ECS
Dockerfiles have no tracked ignore file, so do not place credentials in their
service folders. `nodemon` remains installed because source manifests classify it
as a production dependency; manifests are intentionally unchanged.

### Networking and environment ownership

| Caller | Destination in Compose |
| --- | --- |
| Caddy | `gateway:8000` |
| Gateway | `http://auth:8001`, `http://chat:8002`, `http://agent:8003`, `http://billing:8004` |
| Agent | `http://auth:8001`, `http://chat:8002` |
| Billing | `http://auth:8001` |
| Gateway, auth, agent | Same existing `REDIS_URL`; optional later `redis://redis:6379` |
| Auth, chat, agent, billing | Their unchanged `MONGODB_URI` values |
| Agent | Unchanged Qdrant URL, AWS region/bucket and provider endpoints |

Loopback appears only in a container's **own** health probe and the host gateway
binding, never as an inter-service address. The bridge permits outbound traffic;
an `internal: true` network would break external integrations. Do not publish
8001–8004 or 6379. Anyone with Docker socket access can still reach private services.
`NO_PROXY`/`no_proxy` cover the Docker names and loopback so an inherited outbound
HTTP proxy does not intercept internal Caddy/Axios calls; external proxy settings
are preserved. Extend this list deliberately if adding internal service names.

`examples/` contains placeholders only. Copy each file to `/etc/sutrai/`, removing
the `.example` suffix. Compose's `compose.env` supplies release/host/Redis variables;
the other five files supply only their respective service's external configuration.
Use valid Compose env-file quoting (single quotes for literal `$`/`#` where needed)
and verify values privately; a malformed value can silently change authentication.
The `environment` blocks override `PORT`, inter-service URLs and Redis to avoid
stale ECS/localhost settings. Preserve per-service MongoDB databases rather than
assuming they all share a database.

`GOOGLE_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, and `TAVILY_API_KEY` are
SDK environment defaults; verify against the locked adapters. `FRONTEND_URL` must
exactly match the existing HTTPS browser origin with no trailing slash. Keep the
existing `VITE_SERVER_URL` and public Razorpay key ID/project configuration if the
API hostname and accounts remain the same. Secrets never belong in `VITE_*` fields.

### Runtime credential handling

Create `/etc/sutrai` as root mode `0700`; keep `*.env` root-owned mode `0600`.
Deploy through a trusted root operator (or equivalent access); Docker access is
already root-equivalent. Do not store credentials in Git, images, shell command
arguments/history, public logs, Compose output, or this review bundle. Environment
variables remain visible to privileged Docker users; encrypt host volumes and
restrict operator access. A secrets manager can deliver the same files later.

Mount the private JSON as `/etc/sutrai/firebase-service-account.json`, owned by
`root:1000` with mode `0440` so the auth image's UID/GID 1000 can read it. The host
directory remains `0700`; the bind mount exposes only the file to auth. The Compose
bind refuses to create a missing source path. Do not bake the JSON into a layer.
Rotate by replacing the host file securely and recreating auth (a bind mount can
retain the old inode). Protect credential backups and verify the file/project
privately before deployment. No Firebase env-based credential refactor is needed.

## Proxy, HTTPS and deployment lifecycle

All long-running containers use `unless-stopped`, bounded logs, and a 90-second
stop grace period. App containers run as non-root with dropped capabilities and
an init process. Caddy binds 80/443 with only `NET_BIND_SERVICE` added. Redis runs
as the image's `redis` user (avoiding privileged entrypoint ownership changes).
Greeting health checks use built-in
Node HTTP fetch; Redis uses `PING`. Caddy has no container health probe here;
verify its actual HTTP/HTTPS endpoint externally (and ALB target health if used).

`depends_on: service_healthy` orders initial app startup; it does not restart
dependents after later failures. Docker restart policies restart exited processes,
not running-but-unhealthy processes. Monitor health, errors, OOMs, latency and host
disk; investigate and deliberately recreate a failed service. Enable Docker at boot
and test an instance reboot before cutover. `unless-stopped` preserves an operator's
intentional stop across a reboot. Code does not implement explicit graceful drain,
so stop grace time is an upper bound, not a promise that requests finish.

**First cutover with an existing ALB:** `compose.ec2.alb.yml` changes Caddy to HTTP
8080 with no published 80/443. Retain ALB ACM termination and current DNS, and allow
8080 only from the ALB security group. Use a separate EC2 target group, health path
`/`, target port 8080. Keep the ECS target group running for weighted traffic
shifts/rollback. Do not mix EC2 and ECS in a single target group without a clear
rollback plan. Inventory listener rules, target group stickiness and timeouts;
set ALB idle timeout for the application's longest supported agent request. Caddy
waits up to 300 seconds for response headers; do not replay timed-out paid requests.
The proxy has no new body-size cap; the application currently limits uploads to
20 MiB. ALB support is conditional on the actual infrastructure inventory.

**Direct Caddy HTTPS later:** use base Compose without the ALB override and enable
profile `proxy`. Caddy redirects HTTP to HTTPS and manages ACME certificates for
`API_DOMAIN`, storing keys/certificates in `caddy-data`. Allow inbound TCP 80/443;
restrict SSH to trusted sources or use SSM. Do not publish Caddy's admin port.
Keep A/AAAA records correct, check certificate authority restrictions and ACME
reachability, and persist/protect Caddy volumes. A DNS change alone does not
pre-issue the certificate: validate a candidate hostname first, then arrange a
tested certificate handoff/pre-issuance for the real hostname or retain the ALB
until valid TLS is proven. Do not promise a zero-interruption DNS/TLS cutover.
Never use a self-signed certificate for the browser API. If using host Nginx
instead, proxy to `127.0.0.1:8000`, preserve the URI/cookies/forwarded headers,
reproduce the auth-path restriction, allow multipart uploads, configure appropriate
timeouts, and manage trusted TLS/renewal. Use one public ingress method at a time.

Auth sets `Secure; HttpOnly; SameSite=None` cookies with no domain attribute. Keeping
the API hostname preserves host-scoped cookies. A new API hostname requires a new
login even with the same Redis; browser third-party-cookie restrictions can still
apply. Test real browser sign-in and credentialed CORS from the existing frontend.
HTTPS termination does not require changing current business logic or trust-proxy
settings for these explicitly secure cookies.

## Deployment commands (operator runbook, not executed against AWS)

Use Docker Engine with Compose **2.24.4 or later** on a supported Linux OS. Patch
the host and configure disk, firewall, backups and monitoring before traffic.
Use the same CPU architecture for build/run; ARM/Graviton savings require a separate
multi-architecture build and dependency/native PDF smoke test. No AWS provisioning
commands are included or authorized by this review.

1. Copy the examples privately to `/etc/sutrai/` and replace every placeholder.
   Set `RELEASE_TAG` to a unique source/review release ID (never reuse a tag), use
   the current Redis URL, and provision the Firebase file as described above.
2. Run from the repository root. For the recommended existing-ALB option:

   ```bash
   dc() {
     sudo docker compose --env-file /etc/sutrai/compose.env \
       -f backend/compose.ec2.yml -f backend/compose.ec2.alb.yml \
       --profile proxy "$@"
   }
   dc config --quiet
   # Review file permissions and credential presence privately; do not print config.
   dc build gateway auth chat agent billing
   dc up -d --no-build --wait --wait-timeout 180
   dc ps
   ```

   For direct Caddy HTTPS, omit `-f backend/compose.ec2.alb.yml` in the helper.
   For an isolated pre-ingress check, omit the profile too, then use
   `curl --fail http://127.0.0.1:8000/` on the host. Do not send browser traffic
   through plain HTTP. `config --quiet` checks configuration without rendering
   resolved credentials. Caddy has no container health check, so `--wait` alone
   cannot validate public TLS. Proxy CA mounts in the EC2 Dockerfile are optional
   build-time trust only; do not disable npm TLS verification.
3. Prefer building on a separate same-architecture builder, not on the small
   production instance. Transfer all five uniquely tagged images with `docker save`
   / `docker load` over a secure channel or an approved private registry. Record
   image IDs/digests and base-image digests for rollback; Node/Redis/Caddy version
   tags remain mutable. Never use the ECS workflow's `latest` as a rollback record.
   The existing ECR/workflow naming is untouched by this local image namespace.
4. Validate individual greetings, Docker service-name DNS, integration connectivity,
   Firebase login, secure cookie, `/api/me`, conversation/message persistence,
   agent chat and each enabled PDF/PPT/image/RAG/S3/search feature using a controlled
   test account. Test billing with an approved test-mode environment; avoid
   unapproved live charges or replaying payment verification. There is no webhook
   route in this source; inventory any live callback/webhook integrations separately.
5. Verify proxy rejection of `/api/auth/update-plan` and `/api/auth/deduct-credits`,
   including case, escaping and trailing-slash variants; verify unauthenticated
   protected routes fail and downstream ports are unreachable externally. Check
   expected CORS, large upload behavior, TLS, long requests and process restarts.
6. Capture baseline ECS error/latency/resource observations and compare candidate
   behavior under representative traffic before any cutover. A candidate using
   production databases can still mutate records: use isolated staging credentials
   first; coordinate any shared-data test accounts. No schema migration is needed.
7. Once approved for real operations, shift a small ALB weight to the validated
   candidate, observe and expand. Keep ECS capacity, certificates, target group,
   runtime settings and exact images throughout the agreed rollback window. Define
   acceptable error/latency thresholds and observation duration from the actual
   baseline. If no compatible traffic-split facility exists, resolve the cutover
   mechanism first; this repository cannot guarantee disruption-free traffic moves.

The supplied files do not create a GitHub Actions deployment. A merge to `main`
would still trigger the unchanged ECS/frontend pipeline; plan that operationally
before any later merge. Do not disable CI or delete secrets during this review.

## Optional local Redis: persistence and migration

Local Redis is technically suitable for a small, single-host workload, but it shares
the host's failure domain. Current usage is **not disposable cache alone**:

- Auth creates `session-*` and `user-session-*` with seven-day expiry; gateway
  authorizes requests from those snapshots. Billing/agent update cached credits.
- Agent stores conversation history and per-user counters. `getMemory` initially
  sets a 24-hour TTL, but `addMessage` rewrites with `SET` without expiry, which
  removes that TTL. Redis data may therefore grow indefinitely despite short
  histories. No code change is included; measure and alert on memory growth.
- Durable messages, users and payments remain in MongoDB; an empty Redis still
  invalidates sessions, resets counters, and may change cached authorization state.

The optional profile uses `redis:7.4-bookworm`, named `redis-data` volume at `/data`,
AOF `everysec`, periodic RDB snapshots, `maxmemory 256mb`, and **noeviction**. About
one second of recent writes can be lost in a crash; filesystem/host loss can lose
more. A volume survives container replacement, not instance/disk deletion. Never
run `docker compose down -v`, `docker volume prune`, or destructive Docker cleanup
on a production host. No Redis port is published. This config has no password/TLS
because it is isolated on a trusted host bridge; don't reuse it for network clients
or untrusted containers. Add ACL/TLS design separately if that trust model changes.

`noeviction` protects sessions from silent removal but returns write errors at the
cap, which can break login/credit operations. Alert well before the cap. The 512 MiB
container limit reserves headroom for overhead and persistence copy-on-write, but
does not guarantee a fork/AOF rewrite cannot OOM. Measure `used_memory`, RSS,
`aof_last_write_status`, rewrite results, rejected writes, host free disk and inode
capacity. Persist data on encrypted EBS; budget disk for AOF rewrite temporary files,
snapshots, Docker images and bounded logs. A 30–40 GiB gp3 planning disk is a starting
estimate, not a sizing result. Upload volume growth must be measured separately.

Back up Redis with a version-compatible, consistent RDB export or a coordinated
quiesced AOF/volume backup to encrypted off-host storage. A raw copy of a live
multipart AOF directory is not a consistency guarantee. Verify snapshot completion,
include metadata/TTLs, restore into an isolated compatible Redis, and test sessions
after restart. Record backup retention, access, RPO/RTO and restore procedure.
EBS snapshots need application-consistency coordination, not just a timestamp.

**Do not enable this profile during the initial backend move.** A later migration
requires Redis version/module/cluster compatibility inventory, dataset/memory/TTL
measurement, a tested snapshot/replication procedure, and an explicit write handoff.
While ECS serves traffic, it must share the same writable authoritative Redis as
EC2. Never split sessions/credit snapshots between two writable Redis instances.
If moving external Redis to a Docker-private endpoint, ECS cannot automatically
reach it on rollback; plan reverse synchronization or retain the external endpoint.
If no tested handoff preserves sessions, retain external Redis rather than claiming
a seamless migration. Accepting reauthentication requires a separate product decision.

After that separate migration is complete, set `REDIS_URL=redis://redis:6379` in
`compose.env` and add the following to the chosen command helper:

```text
-f backend/compose.ec2.local-redis.yml --profile local-redis
```

Keep base Compose first, then ALB override if used, then local-Redis override.
The override points gateway/auth/agent to the `redis` service and waits for `PING`.
Only enabling the profile starts Redis but does **not** redirect clients. The base
still requires a `REDIS_URL` value during interpolation; the explicit setting above
keeps both the base and override coherent. Restore/validate Redis before starting
the dependent applications; do not start them against an empty replacement.

## CPU/RAM assessment

No workload benchmarks or production measurements were available. Models run at
remote providers, but local PDF parsing, splitting, embeddings orchestration,
image buffers and PDF/PPT rendering can consume substantial memory/CPU. A 20 MiB
upload may expand far beyond 20 MiB; concurrent requests amplify this. Per-user
Redis counters are not a global concurrency limiter.

| Component | Configured container limit (MiB) | Node heap cap (MiB) |
| --- | ---: | ---: |
| Gateway | 192 | 96 |
| Auth | 256 | 128 |
| Chat | 256 | 128 |
| Billing | 256 | 128 |
| Agent | 1536 | 768 |
| Caddy, if enabled | 128 | n/a |
| Local Redis, if enabled | 512 | n/a; dataset cap 256 |
| Total with external Redis and Caddy | 2624 | |
| Total with local Redis and Caddy | 3136 | |

These are protective **initial limits**, not measured requirements/reservations.
V8 heap caps do not cap buffers, native libraries, stacks or total RSS. The limits
are enforced by standalone Compose `mem_limit`; `cpu_shares` are relative scheduling
weights, not dedicated CPUs or hard quotas. Agent has the largest share. Health
probe processes also consume memory inside the limit.

| EC2 RAM tier | Assessment |
| --- | --- |
| 2 GiB, e.g. t3.small | Current conservative limits exceed host RAM even without Redis. May fit only very light traffic with much lower budgets after measurement; PDF/RAG/image concurrency is a material OOM risk. Not the recommended initial production size. No unvalidated 2 GiB override is supplied. |
| 4 GiB, e.g. t3.medium | Recommended starting experiment for modest traffic: totals leave about 1472 MiB with external Redis or 960 MiB with local Redis for kernel, Docker, monitoring and filesystem cache. Actual available RAM is lower than nominal and limits are not reservations. Still requires representative load tests and may need a larger instance. |

Two vCPUs is a reasonable starting hypothesis for mostly remote-I/O work, but
document work can saturate them. Burstable T-family sustained CPU may consume
credits or incur surplus charges in unlimited mode. Monitor CPU credits, CPU,
memory available, swap, OOM kills, disk space/I/O, request p95/p99 and errors.
Small encrypted swap can reduce abrupt host OOM pressure but is not capacity and
may cause unacceptable latency. Never use a cold idle RSS reading as a load result.

Before approving 2 GiB or 4 GiB, exercise controlled concurrent chat plus maximum
supported uploads, RAG and artifact generation; observe `docker stats`, cgroup OOM
events and host memory over a representative interval. Test Redis persistence
rewrite and reboot separately. Set acceptance limits from the actual service SLO,
then adjust caps/host size. Building images on the host adds a separate peak.

## Migration, rollback and AWS cost checklist

### Migration

- [ ] Inventory ECS definitions/image digests/runtime files/secret references,
  service counts, ALB/ACM/DNS/CORS, Redis, network access and baseline behavior.
- [ ] Resolve all blockers; approve single-host availability tradeoff, candidate
  resource budget, monitoring, patching, encrypted storage and off-host restores.
- [ ] Build a distinct reviewed release; retain exact ECS and Compose image IDs.
- [ ] Fill private runtime files; verify mounts, DNS, external service reachability
  and all functional checks. No MongoDB/Qdrant/data migration or schema changes.
- [ ] Verify candidate proxy/TLS/browser cookies, payment test behavior, restarts,
  host reboot and memory behavior before serving users.
- [ ] Confirm same authoritative Redis, databases, hostname and signing/account
  configuration across both backends. Do not enable local Redis concurrently.
- [ ] Arrange any release freeze operationally; unchanged pushes to main still
  deploy ECS and the frontend. Keep the ECS pipeline available for rollback.
- [ ] Shift traffic using the inventoried mechanism; watch errors/latency, OOMs,
  request completion, user sessions and credits through the rollback window.
- [ ] Reconcile uncertain in-flight paid/credit operations manually before retrying.
  Payment verification is not visibly idempotent; do not blindly replay writes.

### Rollback

- [ ] Trigger rollback on agreed error/latency thresholds, OOM/restarts, auth,
  payment, data integrity, provider or TLS failures; record the incident time.
- [ ] Route traffic back to the already-running ECS target group or exact previous
  DNS/CloudFront origin configuration. Keep both backends available through DNS
  cache expiry/draining; DNS changes are not instantaneous rollback.
- [ ] Verify ECS's preserved image digests/task revision/runtime config, shared
  Redis and existing databases; check login, `/api/me`, chat, credits and billing.
- [ ] Drain candidate connections before `dc stop` to prevent new writes. Existing
  code does not guarantee graceful draining; reconcile uncertain requests.
- [ ] Preserve EC2 volumes, protected logs, configuration and images for diagnosis.
  Do not restore older MongoDB data over legitimate shared writes.
- [ ] If only a later EC2 release failed, select previous `RELEASE_TAG` plus its
  matching configuration/Compose files, ensure its five exact images are loaded,
  run `config --quiet` and `up -d --no-build --wait`, then verify behavior.
- [ ] If local Redis was subsequently introduced, execute the separately tested
  reverse synchronization/reachability plan before ECS serves requests. Stale
  external Redis is not safe rollback state for sessions or credit snapshots.

### Cost review and cleanup (only after rollback window and separate authorization)

No AWS inventory or live pricing was queried. Price the actual region and usage
with AWS Pricing Calculator/Cost Explorer. Compare **total** monthly costs:

```text
EC2 hours × regional instance rate + EBS + snapshots + public IPv4
+ egress + logging/monitoring + retained NAT/ALB + backups/registry
versus current Fargate vCPU-hours + memory-GB-hours + networking/ALB/logging
```

Include temporary dual-running cost during migration and burst credit charges.
Do not claim a fixed savings percentage without actual bills. A 4 GiB host can
cost less overall than a 2 GiB host that fails or needs repeated operator recovery.

- [ ] Identify resources by account/region/tags and prove they belong exclusively
  to the retired backend; do not delete shared networking, databases or storage.
- [ ] After rollback retention, separately approve scaling retired ECS services to
  zero and disabling their autoscaling; retain definitions and exact rollback images.
- [ ] Remove unused target groups/listener rules and ALB only after direct TLS,
  traffic routing and rollback policy permit it. An empty ALB still incurs charges.
- [ ] Check NAT Gateway hourly/data charges and VPC endpoints independently. A
  single public-subnet host may avoid a dedicated NAT but needs a reviewed ingress/
  egress design; never delete shared NAT or change routes merely to reduce cost.
- [ ] Review unused Elastic IP/public IPv4, idle EBS/snapshots, CloudWatch log
  retention, ECR image lifecycle, service-discovery resources and secret storage.
  Keep retained rollback images out of destructive lifecycle rules.
- [ ] Decommission external Redis only after the separate Redis migration and
  rollback window. Keep MongoDB, Qdrant, Firebase, Razorpay, AI/search services,
  artifact S3 and frontend S3/CloudFront unchanged for this phase.
- [ ] Retain IAM roles/policies/CI secrets until their consumers and rollback needs
  are understood. Removing pipeline credentials would break the preserved workflow.
- [ ] Verify post-change billing, tag allocation, budgets and alarms. Keep a dated
  list of retained and removed resources with owners and evidence.

## Validation status

See `VALIDATION.md` for checks actually performed and their limits. Production
readiness requires the operator checks above; this review does not change AWS.
