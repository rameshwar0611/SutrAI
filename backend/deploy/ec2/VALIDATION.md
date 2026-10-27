# EC2 deployment review validation

Date: 27 October 2026. Baseline: `3d4370e`.
Branch: `migration/ec2-compose-review`. Docker Engine 28.4.0,
Compose 2.40.3; builds resolved Node 24.22.1 from `node:24-bookworm-slim`.

## Passed

- Built all five EC2 images from their existing package lockfiles with the new
  EC2-only Dockerfile. No application, dependency manifest or lockfile changed.
  The managed build environment's public CA was mounted as a BuildKit secret;
  npm TLS verification remained enabled.
- Resolved Compose configurations for external Redis, direct Caddy HTTPS,
  existing ALB, local Redis with Caddy, and local Redis with ALB. Checked private
  service ports, service-name URLs, resource limits, restart policies, health
  definitions, proxy exclusions and the read-only Firebase bind configuration.
- Started every service as UID 1000 using the configured memory and V8 heap caps,
  with dropped capabilities, on an isolated internal-only Docker network.
  Each returned HTTP 200 from its existing `GET /` greeting endpoint.
- Auth loaded a synthetic Firebase service-account file through its exact runtime
  mount path. It contained a newly generated offline key for a nonexistent test
  project, never a production Firebase credential.
- Gateway reached auth/chat/agent/billing using Docker service names and their
  configured ports. Unauthenticated `/api/me` returned the existing HTTP 400.
- Caddy validated both HTTP (ALB) and HTTPS configuration modes. In HTTP mode it
  forwarded the gateway greeting and protected-route response. A POST to public
  `/api/auth/login` reached auth and returned its expected missing-token error.
  Internal auth mutations were rejected with 404, including uppercase, encoded
  slash/character and trailing-slash variants. A trailing slash on public login
  was also rejected by the exact-path allowlist.
- Redis started as its non-root image user with capabilities dropped, accepted a
  synthetic expiring key, and retained the value and positive TTL after restart
  using the provided AOF/RDB configuration and a dedicated temporary volume.
- Runtime images contained no application `.env` files; agent's uploaded sample
  images were excluded from its image and its writable `temp` directory was empty.
- The final diff left **every tracked baseline file unchanged**, including the
  five original Dockerfiles, original Redis Compose file and ECS/Actions workflow.
  Changes are additive. The initial preparation made no commit or push; the
  subsequent authorized finalization publishes only this migration branch and PR.
  No AWS API call was made.
- Disposable test containers, the isolated test network and the specifically
  created synthetic Redis data volume were removed after the checks.

## Findings corrected during validation

- Source package files were mode 0600 in this workspace. Copying root package
  metadata as root prevented the non-root process from reading it; EC2 Dockerfile
  copies package metadata with explicit `node:node` ownership.
- An inherited outbound HTTP proxy intercepted Caddy's internal requests. The
  final Compose environment explicitly excludes loopback and Docker service names
  through `NO_PROXY`/`no_proxy`, preserving external proxy settings.
- Redis runs explicitly as `redis` so its entrypoint does not require privileged
  ownership/user changes that conflict with `cap_drop: ALL`.
- The proxy's auth-subtree rejection is case-insensitive to cover Express's
  case-insensitive route matching. Exact public auth paths remain allowlisted.

## Finalization review

Before the authorized commit/push, all 15 proposed files were reviewed again.
The credential examples contain placeholders only. A targeted scan for AWS,
Google, GitHub and provider token patterns, private-key material, Firebase key
JSON and credential-bearing URLs found no secrets. No actual environment files,
service-account JSON, private keys, test fixtures or validation logs are included.

All five Compose variants passed syntax and structural checks again, including
private ports, build context, health/restart settings, memory limits, non-root
runtime configuration, read-only Firebase mount and Docker service-name URLs.
The isolated runtime suite was rerun successfully: all five application startups,
service-name HTTP, protected-route rejection, Caddy configuration/routing and
auth-path restrictions, plus Redis AOF persistence and TTL across restart.

The existing tracked tree was compared against baseline `3d4370e` and remained
unchanged. The migration, rollback and infrastructure cost-cleanup checklists were
confirmed present. The single-instance design remains a 4 GiB starting hypothesis;
the production integration and workload gates below still apply. No deployment
workflow was invoked and no AWS infrastructure operation was performed.

## Not established by these checks

The internal-only test network blocked external access. MongoDB was intentionally
absent and credentials/provider endpoints were placeholders. Services can return
healthy greetings despite failed database connections; these checks establish
startup, packaging and local routing, not application readiness.

No real Firebase token verification, MongoDB/Qdrant operations, Redis production
connectivity, S3 access, AI/search request, Razorpay charge, ALB target registration,
public DNS/ACME certificate issuance or frontend/browser interaction was performed.
HTTPS configuration validation did not obtain or exercise a real certificate.

No EC2 was created, live AWS configuration read or changed, production traffic
shifted, resource deleted, workload benchmark run, or current AWS pricing fetched.
The isolated runtime checks did not exercise a full production Compose deployment,
host reboot, production health recovery, real Redis data migration, off-host restore,
or sustained/concurrent workload. Resource budgets are estimates only.

Complete the integration, capacity, backup, cutover and rollback gates in
`README.md` before approving production use. Keep external Redis for the first
backend move; treat local Redis as a separate state migration.
