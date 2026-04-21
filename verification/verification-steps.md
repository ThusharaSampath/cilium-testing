# Verification Steps

Verification is organized into three tracks, orchestrated by `bash scripts/verify.sh`.
Cluster target is driven by `CLUSTER` in `.env` (`DEV` = AKS, `OS` = OpenShift).

---

## Track 1: Infrastructure Tests (`track-infra.sh`)

Validates cluster foundation via kubectl against the selected cluster. No Choreo console interaction.

- [x] **Step 1/7 — Cluster info** (`cluster/cluster-info.sh`)
  - Prints Kubernetes, Cilium, CNI, and runtime versions for the target cluster.
- [x] **Step 2/7 — CoreDNS connectivity** (`cluster/coredns-test.sh`)
  - Verifies CoreDNS (or OpenShift DNS) pods are healthy and resolve internal + external names.
- [x] **Step 3/7 — Transparent encryption (WireGuard)** (`cluster/transparent-encryption-test.sh`)
  - Confirms `cilium_wg0` interface on every node with N-1 peers.
  - Reference: https://docs.cilium.io/en/v1.14/security/network/encryption-wireguard/#validate-the-setup
- [x] **Step 4/7 — Hubble observability** (`cluster/hubble-observability-test.sh`)
  - CLI: `hubble observe -t l7` returns L7 flows.
  - Prometheus: `hubble_http_requests_total{}` populated via ServiceMonitor scrape.
- [x] **Step 5/7 — Metadata endpoint blocking** (`cluster/metadata-endpoint-test.sh`)
  - Confirms `http://169.254.169.254` is unreachable from user-app pods (enforced by `allow-world-except-az-metadata` CCNP).
- [x] **Step 6/7 — Cross-namespace isolation** (`cluster/cross-namespace-isolation-test.sh`)
  - Creates two test namespaces with the `choreo-default-policies` CNP applied (same shape Choreo installs on every project namespace).
  - Client pod in ns-A calls server pod in ns-B by pod-IP and by service DNS — both must be blocked.
  - Control call from inside ns-B must return 200 to prove the server is healthy.
- [x] **Step 7/7 — Cross-node communication** (`cluster/cross-node-test.sh`)
  - Applies `cross-node-request-drop-test.yaml` (client + server DaemonSets) and monitors for ~5 min.
  - A few restarts during the first 1-2 min settle window are acceptable; none afterwards.
- [x] **Optional — Gateway error monitor** (`cluster/gateway-error-monitor.sh`, ~10 min)
  - Watches router logs for elevated 403s and "upstream not found" errors.
  - 403s: historically caused by pods with deleted pod identities after upgrades.
  - Upstream not found: gateway router failing to resolve service IPs via CoreDNS.

---

## Track 2: Tester Track (`track-tester.sh`)

Playwright-driven end-to-end flow. Creates five Choreo components (org-service, public-service, project-service, webapp, tester), waits for builds, collects endpoint URLs, updates tester config, and invokes the tester `/test` console.

Covers Cilium network policy enforcement via the tester's per-scope calls:

- [x] Public services reachable via the gateway (tester `/test/public`).
- [ ] Organization-level services reachable via the internal gateway (tester `/test/org`) — was broken in DEV CDP.
- [x] Project-level services reachable within the same project (tester `/test/project`).
- [x] Webapps reachable (tester `/test/webapp`).

---

## Track 3: Service-to-Service Track (`track-s2s.sh`)

Playwright flow that creates a project-scoped server + client pair, wires them via a Choreo connection, and invokes the client `/hello` endpoint through the test console.

- [x] Project-level service-to-service communication.
- [x] Service-to-service scale-to-zero with both sides enabled (second service project-scoped).
  - Requires control-plane feature flag **and** KEDA stack in the cluster (see OpenShift onboarding guide).

---

## Not Yet Automated

- [ ] **HTTP retries**
  - Deploy the `error-responder` component (always returns 500).
  - Configure HTTP retry via endpoint config; verify retry requests in component logs.
- [x] **Elevated 403s from the gateway** — covered by the optional gateway error monitor.
  - [Azure Log query](https://portal.azure.com#@da76d684-740f-4d94-8717-9d5fb21dd1f9/blade/Microsoft_OperationsManagementSuite_Workspace/Logs.ReactView/resourceId/%2Fsubscriptions%2F520bc16b-6ff6-4d94-970e-1fa9c4708084%2Fresourcegroups%2Fchoreo-dev-log-analytics-rg%2Fproviders%2Fmicrosoft.operationalinsights%2Fworkspaces%2Fchoreo-log-crack-sole/source/LogsBlade.AnalyticsShareLinkToQuery/q/H4sIAAAAAAAAA22OQUvEQAyF7%252F0VYU8zsCuC4q2nKlIU8aBnmXbiNquTlExGreyPd1ZZRPAdw%252FflvU7YAjHqrWybPeyEGF6IY%252FuKz5YxEbibMuC9xJ7fkE10aaBmD%252B8TKkJ39O9CQphChtU4iaJsRmHG0TYqxVBX%252FlsT%252FjX6S2iOb%252BagGZ92WdjVIVdsuvgTxTx3EhHaFs5PzyqMH4YcIczUR2jBJJsSb92%252FeqUeC0VfvSxqMCzwQAmvsXYHw3i4l5SC0ifCKIXN%252BQM0ELs%252F4BouJr%252F%252Baf0CE16cnjABAAA%253D/timespan/P7D)
- [x] **Elevated "upstream not found"** — covered by the optional gateway error monitor.
  - [Azure Log query](https://portal.azure.com#@da76d684-740f-4d94-8717-9d5fb21dd1f9/blade/Microsoft_OperationsManagementSuite_Workspace/Logs.ReactView/resourceId/%2Fsubscriptions%2F520bc16b-6ff6-4d94-970e-1fa9c4708084%2Fresourcegroups%2Fchoreo-dev-log-analytics-rg%2Fproviders%2Fmicrosoft.operationalinsights%2Fworkspaces%2Fchoreo-log-crack-sole/source/LogsBlade.AnalyticsShareLinkToQuery/q/H4sIAAAAAAAAA22OwU7DMAyG730Kq6dU2jhy66lDqAJNO8C5ShuzZDR25ThA0R6eDDQhJHy0v%252B%252F33zGpDYTyyMfqDCcOBK%252BBXDvjiyaMAcxDHvHArqc3JGVZKyhzhnePgtBd%252Fb2NCN4mqCfPgrydmAgn3QpnRambb43p1%252Bh3UF1jFisJh1NiMqXIHamszY1gWjp2uNM5QdtCTTx4tLP6dchLUkEb6xKBH4rkwC6hd9CCcjkFOpp%252FQwv1nINripdYFMYVnkLEeyyNrKK77HOMVsInwsSZ1DQXaAxk%252FoAbuPXN5ufrFzmcnh9GAQAA/timespan/P7D)

---

## Running the suite

```bash
# Full orchestrated run (infra → prereq → tester → s2s → full-test)
bash scripts/verify.sh

# Infra track only (no Choreo console needed)
bash scripts/verify.sh   # choose option 4

# Reset state and start over
bash scripts/verify.sh --reset
```
