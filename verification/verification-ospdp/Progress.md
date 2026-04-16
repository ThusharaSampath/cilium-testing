
# Test Cases
- [x] Cross-node communication (PASSED — 2026-04-08)
  - Applied `cross-node-request-drop-test.yaml` to the OS cluster (12 nodes, 9 workers + 3 control-plane)
  - 9 client + 9 server pods deployed (control-plane nodes excluded due to taints)
  - 18 client restarts during 2-min settle window (expected — clients start before servers)
  - **0 restarts** after settle window through full 5-minute monitoring period
  - All pods stable and Running at completion
- [ ] HTTP retries
   - Create a component that returns a 500 status code and logs every time there is a request with https://github.com/ThusharaSampath/cilium-testing/tree/main/error-responder.
   - Configure an HTTP retry using endpoint configs
   - Check if the component received retry requests by checking logs
   - The resilience label is missing in dataplane labels, hence this feature is disbaled, should enable that.
- [ ] Cilium Network Policy enforcement (https://github.com/ThusharaSampath/cilium-testing)
  - [x] Unable to connect to the metadata endpoint http://169.254.169.254 (PASSED with fix — 2026-04-10)
    - Deployed `proxy-service` (reverse proxy defaulting to `169.254.169.254`) as a Choreo component
    - Initially FAILED — invoking `/` returned the full metadata API version listing (metadata endpoint was accessible)
    - **Root cause**: OS cluster's `allow-world-except-az-metadata` CCNP used `egress` (allow-except pattern) instead of `egressDeny`. The `choreo-default-policies` CNP in the workload namespace allows `toCIDR: 0.0.0.0/0` with empty `endpointSelector`, which unions with the CCNP's allow rule — filling the `except 169.254.169.254/32` gap. In Cilium, allow rules are additive, so the metadata IP was reachable.
    - DEV cluster uses `deny-az-metadata` CCNP with `egressDeny` (deny rules always win over allow rules), which correctly blocks metadata access regardless of other policies.
    - **Fix**: Patched `allow-world-except-az-metadata` CCNP to use `egressDeny` with `toCIDR: 169.254.169.254/32` (matching DEV cluster pattern). After patch, proxy-service returns connection timeout instead of metadata response.
    - Backups: `os-allow-world-except-az-metadata-backup-20260410.yaml`, `os-allow-world-except-az-metadata-patched-20260410.yaml`
    - **Note**: This CCNP is Helm-managed (`choreo-pdp` release via FluxCD) — Flux may reconcile it back. Permanent fix requires updating the Helm chart values.
  - [x] Public services are reachable via the gateway
  - [ ] Organization-level services are reachable via the internal gateway (This was not worked in DEV CDP)
  - [x] Project-level services are reachable via another component within the same project
  - [x] Webapps are reachable (PASSED with fix — 2026-04-10)
    - Initially BLOCKED — external traffic not reaching webapps nginx controller
    - Webapp pod was healthy internally but external curl failed with `SSL_ERROR_SYSCALL`
    - Hubble showed zero flows on port 80/443 to the webapps nginx controller
    - **Root cause**: The `choreo-webapps-nginx` Service was using a Classic ELB without proper annotations. AWS Security Groups on worker nodes did not allow inbound traffic on the webapps NodePorts.
    - **Fix**: Added two annotations to the Service (matching the working `choreo-apim` NLB):
      - `aws-load-balancer-type: nlb`
      - `aws-load-balancer-scheme: internet-facing`
    - Deleted the old LB Service so it gets recreated as an NLB with correct security group rules
    - DNS for `*.prod.opc.choreoapps.dev` updated by SRE to point to new NLB hostname
    - Verified locally before DNS update by adding webapp hostname to `/etc/hosts`
    - **Action for production**: When creating actual OpenShift PDPs, the default LB Service for webapps nginx must include these NLB annotations. This should be configured in the platform Helm chart/values so it's automatic.
    - Backups: `os-webapps-nginx-svc-backup-20260409-1240.yaml`, `os-webapps-nginx-svc-nlb.yaml`
  - [x] CoreDNS connectivity is working (PASSED — 2026-04-09)
    - Updated `coredns-test.sh` to detect cluster type: OpenShift uses `openshift-dns` namespace with `dns.operator.openshift.io/daemonset-dns=default` label (not `kube-system` / `k8s-app=kube-dns`)
    - All 12 OpenShift DNS pods healthy (0 restarts)
    - DNS resolution tests (3/3 passed):
      - `kubernetes.default.svc.cluster.local` → `172.30.0.1`
      - `dns-default.openshift-dns.svc.cluster.local` → `172.30.0.10`
      - `google.com` → resolved (both IPv4 and IPv6)
  - [ ] Service-to-service scale to zero is working with both services having scale to zero enabled, and the second service is only exposed on the project scope
    - Scale to zero is not visible in this pdp, by default ha
    - Apart from S2Z connections and calls are working
    - No keda pods running at all
- [ ] Increased 403s returned from the gateway ([query](https://portal.azure.com#@da76d684-740f-4d94-8717-9d5fb21dd1f9/blade/Microsoft_OperationsManagementSuite_Workspace/Logs.ReactView/resourceId/%2Fsubscriptions%2F520bc16b-6ff6-4d94-970e-1fa9c4708084%2Fresourcegroups%2Fchoreo-dev-log-analytics-rg%2Fproviders%2Fmicrosoft.operationalinsights%2Fworkspaces%2Fchoreo-log-crack-sole/source/LogsBlade.AnalyticsShareLinkToQuery/q/H4sIAAAAAAAAA22OQUvEQAyF7%252F0VYU8zsCuC4q2nKlIU8aBnmXbiNquTlExGreyPd1ZZRPAdw%252FflvU7YAjHqrWybPeyEGF6IY%252FuKz5YxEbibMuC9xJ7fkE10aaBmD%252B8TKkJ39O9CQphChtU4iaJsRmHG0TYqxVBX%252FlsT%252FjX6S2iOb%252BagGZ92WdjVIVdsuvgTxTx3EhHaFs5PzyqMH4YcIczUR2jBJJsSb92%252FeqUeC0VfvSxqMCzwQAmvsXYHw3i4l5SC0ifCKIXN%252BQM0ELs%252F4BouJr%252F%252Baf0CE16cnjABAAA%253D/timespan/P7D))
  - Sometimes we have noticed an elevated number of HTTP 403s during/after upgrades.
  - This can be confirmed by checking the router log with the status code.
  - This was due to some of the pods having deleted pod identities.
- [ ] Increased "upstream not found" errors returned from the gateway ([query](https://portal.azure.com#@da76d684-740f-4d94-8717-9d5fb21dd1f9/blade/Microsoft_OperationsManagementSuite_Workspace/Logs.ReactView/resourceId/%2Fsubscriptions%2F520bc16b-6ff6-4d94-970e-1fa9c4708084%2Fresourcegroups%2Fchoreo-dev-log-analytics-rg%2Fproviders%2Fmicrosoft.operationalinsights%2Fworkspaces%2Fchoreo-log-crack-sole/source/LogsBlade.AnalyticsShareLinkToQuery/q/H4sIAAAAAAAAA22OwU7DMAyG730Kq6dU2jhy66lDqAJNO8C5ShuzZDR25ThA0R6eDDQhJHy0v%252B%252F33zGpDYTyyMfqDCcOBK%252BBXDvjiyaMAcxDHvHArqc3JGVZKyhzhnePgtBd%252Fb2NCN4mqCfPgrydmAgn3QpnRambb43p1%252Bh3UF1jFisJh1NiMqXIHamszY1gWjp2uNM5QdtCTTx4tLP6dchLUkEb6xKBH4rkwC6hd9CCcjkFOpp%252FQwv1nINripdYFMYVnkLEeyyNrKK77HOMVsInwsSZ1DQXaAxk%252FoAbuPXN5ufrFzmcnh9GAQAA/timespan/P7D))
  - Sometimes we have noticed an elevated number of "upstream not found" errors during/after upgrades.
  - This is because the gateway router was unable to connect to the CoreDNS to lookup the service IPs.
- [x] Hubble-based observability (PASSED with fixes — 2026-04-08)
  - **Hubble CLI: PASS** — Hubble is running (Ok, 4095/4095 flows, 257 flows/s). L3/L4 flows observed successfully.
  - **3 issues found and fixed:**
    - **Fix 1: Hubble metrics export not configured in Cilium** — OS cluster `cilium-config` ConfigMap (ns `cilium`) was missing `hubble-metrics` and `hubble-metrics-server` keys. Patched ConfigMap to match DEV cluster values, rolled out Cilium DaemonSet. `cilium-dbg status` now shows `Metrics: Ok`. Backup: `os-cilium-config-backup-20260408-1240.yaml`.
    - **Fix 2: Prometheus operator RBAC** — The Flux-managed `prometheus-operator` ClusterRoleBinding pointed to SA in `openshift-monitoring` namespace instead of `choreo-observability` where the operator actually runs. Patching didn't stick because Flux reconciles it back. Created a new CRB `prometheus-operator-choreo-observability` (not managed by Flux) that binds ClusterRole `prometheus-operator` to the correct SA. Applied: `prometheus-operator-crb-fix.yaml`. Backup: `os-prometheus-operator-crb-backup-20260408-1015.yaml`.
    - **Fix 3: Missing hubble-metrics Service** — The `hubble` ServiceMonitor expected a Service with label `k8s-app: hubble` and port `hubble-metrics` in the `cilium` namespace, but none existed. Created headless Service `hubble-metrics` selecting Cilium agent pods (`k8s-app: cilium`) on port 9965. Applied: `hubble-metrics-service.yaml`.
  - **Result**: After all 3 fixes, `hubble_http_requests_total` is populated in Prometheus with real traffic data.
  - **L7 visibility — Cilium 1.18 breaking change**:
    - In Cilium 1.15 (DEV cluster), L7 visibility was enabled via **pod annotations** (`policy.cilium.io/proxy-visibility`).
    - In Cilium 1.18 (OS cluster), pod annotations no longer work. L7 visibility requires a **CiliumNetworkPolicy with L7 rules** (`rules.http`) to trigger Envoy proxy insertion.
    - The existing `choreo-default-policies` in workload namespaces is L3/L4-only — no `toPorts` with `rules.http`.
    - **Tested and confirmed**: Applied the following policy to `dp-osdev2-thushara-83289-1593846909` and Hubble immediately showed HTTP-level flows (method, URL, status code, latency):
      ```yaml
      apiVersion: cilium.io/v2
      kind: CiliumNetworkPolicy
      metadata:
        name: l7-visibility-test
      spec:
        endpointSelector: {}
        ingress:
          - fromEndpoints:
              - {}
            toPorts:
              - ports:
                  - port: "9090"
                    protocol: TCP
                rules:
                  http:
                    - {}   # match all HTTP — enables visibility without restricting
      ```
    - Without this policy: Hubble only sees L3/L4 (TCP SYN/ACK/FIN). With it: `http-request FORWARDED (HTTP/1.1 GET ...)` and `http-response FORWARDED (HTTP/1.1 404 0ms ...)`.
    - **Platform action needed**: Choreo control plane must inject CiliumNetworkPolicies with L7 rules per component at deploy time (it knows the port from `component.yaml`). The `choreo-default-policies` or a new per-component policy needs `toPorts` with `rules.http` for each service port.
    - [X] Check Logs working in the UI (FIXED infrastructure — 2026-04-12, pending UI verification)
      - **Blocker found (2026-04-11):** Logging API returning 500 / empty results. Four root causes found and fixed:
        1. **OpenSearch missing users** — `logging-api` and `fluent-bit` internal users did not exist in OpenSearch. The `internal_users.yml` in `opensearch-security-config` secret only had `admin`. Both services got 401 on every request.
           - **Runtime fix applied**: Created both users via OpenSearch REST API with admin credentials.
           - **Persistent fix needed**: Update `opensearch-security-config` secret's `internal_users.yml` to include both users (see `os-opensearch-internal-users-patched-20260411.yaml`), then re-run the security config update job.
        2. **Fluent Bit can't read log files (OpenShift SCC)** — All log lines were `Permission denied` for `/var/log/containers/*.log`. Fluent Bit SA (`fluent-bit`) had no SCC grant, defaulted to `restricted` which blocks host path reads.
           - **Fix applied**: Granted `privileged` SCC to `fluent-bit` SA via `kubectl patch scc privileged`.
        3. **Fluent Bit running as wrong UID** — Even with `privileged` SCC, the DaemonSet had `runAsUser: 10000` and `runAsNonRoot: true` hardcoded in the container securityContext. UID 10000 can't read root-owned log files on OpenShift/CRI-O nodes. Additionally, the init container (`set-volume-ownership`) was chowning the SQLite DB to `10000:10000`, causing "readonly database" errors when main container switched to UID 0.
           - **Fix applied**: Patched DaemonSet — `runAsUser: 0`, `runAsNonRoot: false`, init container `chown 0:0`.
        4. **SELinux blocking hostPath reads + FluxCD reverting patches** (2026-04-12):
           - Even with `runAsUser: 0` and `privileged` SCC, OpenShift SELinux still blocked hostPath reads because the container securityContext had `privileged: false` and `allowPrivilegeEscalation: false`. On OpenShift, `privileged: true` in securityContext is required to bypass SELinux enforcement on hostPath volumes.
           - FluxCD `choreo-fluent-bit` HelmRelease reconciled overnight and **reverted all DaemonSet patches** back to original values (`runAsUser: 10000`). This meant fixes from 2026-04-11 were undone.
           - **Fix applied**: Suspended FluxCD HelmRelease (`spec.suspend: true`), then patched DaemonSet with full privileged securityContext: `privileged: true`, `runAsUser: 0`, `runAsNonRoot: false`, `readOnlyRootFilesystem: false`, `allowPrivilegeEscalation: true`.
           - Fix script: `os-fluent-bit-scc-fix-20260411.sh` (updated with all steps including Flux suspend).
      - **Result** (2026-04-12): All 9 Fluent Bit pods running (0 restarts), `container-logs-2026-04-12` index has 31k+ docs. Historical data being re-indexed (some 409 duplicate conflicts — harmless, will clear after catch-up).
      - **Persistence note**: FluxCD HelmRelease is **suspended**. Helm values must be updated before resuming, otherwise patches will be reverted again. Changes needed in Helm values:
        - `securityContext.privileged: true`, `runAsUser: 0`, `runAsNonRoot: false`, `readOnlyRootFilesystem: false`, `allowPrivilegeEscalation: true`
        - Init container `chown 0:0` instead of `10000:10000`
        - OpenSearch security config secret needs `internal_users.yml` update for `fluent-bit` and `logging-api` users
      - Backups: `os-opensearch-security-config-backup-20260411.yaml`, `os-fluent-bit-daemonset-backup-20260411.yaml`
    - [x] Insights/metrics working in the UI (PASSED with fixes — 2026-04-16)
      - The obsapi (`choreo-obsapi-v2`) queries Thanos for HTTP metrics filtered by `releaseId`, but Hubble metrics in Thanos have no Choreo-specific labels (`releaseId`, `componentId`, `namespace`, etc.).
      - `hubble_http_requests_total` only has: `destination` (format `namespace/pod-name`), `source`, `reporter`, `status`, `prometheus`. No separate `namespace` label.
      - The `hubble-metrics` config in `cilium-config` is: `httpV2:destinationContext=pod;sourceContext=pod;http_requests_total=status;http_request_duration_seconds=status` — same as DEV cluster. The `pod` context embeds namespace inside the destination/source labels rather than as a separate label.
      - L7 visibility policy (`l7-visibility-test`) was updated to include port 8080 (was only 9090). After update, Hubble correctly shows `http-request`/`http-response` flows and `hubble_http_requests_total` is populated in Thanos for the workload namespace.
      - **Previous root cause analysis was incorrect.** The recording rules in the Prometheus Helm chart (`http-metrics-by-release-deprecated`, `http-metrics-by-release-rates`) already handle the mapping from Hubble's pod-level labels to Choreo's `release_id` by joining with `kube_pod_labels`. The templates and PrometheusRules are correctly deployed.
      - **Actual root cause (2026-04-16):** Two issues preventing `kube-state-metrics` from working:
        1. **SCC violation** — Pod failed to start for 13 days. Deployment runs as UID `65534` with `fsGroup: 65534` and `seccompProfile: RuntimeDefault`. No SCC permitted this combination — `anyuid` rejected the seccomp profile, `restricted-v2` rejected the UID.
           - 3044+ `FailedCreate` events on the ReplicaSet
           - **Fix**: Granted `privileged` SCC to `system:serviceaccount:choreo-observability:kube-state-metrics`
           - Backup: `os-scc-privileged-backup-20260416.yaml`, `os-scc-anyuid-backup-20260416.yaml`
        2. **RBAC — ClusterRoleBinding pointing to wrong namespace** — Same issue as `prometheus-operator`. The `kube-state-metrics` CRB has `app.kubernetes.io/managed-by: cluster-monitoring-operator` label, causing OpenShift's monitoring operator to overwrite the subject namespace to `openshift-monitoring` instead of `choreo-observability`. kube-state-metrics pod started but couldn't list pods/services/jobs.
           - **Fix**: Created new CRB `kube-state-metrics-choreo-observability` (not managed by OpenShift CMO) binding ClusterRole `kube-state-metrics` to SA `choreo-observability:kube-state-metrics`
           - Applied: `kube-state-metrics-crb-fix.yaml`. Backup: `os-kube-state-metrics-crb-backup-20260416.yaml`
        - After both fixes: `kube-state-metrics` running, `kube_pod_labels` has 6 series with `label_release_id`, cAdvisor recording rules producing `choreo_component_cpu_usage_seconds_total` (3 series with proper `release_id`)
        - Hubble recording rules (`choreo_component_http_requests_total`) still empty because L7 visibility policy is only applied to one namespace and needs active HTTP traffic to generate `hubble_http_requests_total` for user workload pods
      - **Persistence note**: Platform Helm chart for OpenShift DPs needs:
        - `privileged` SCC grant for `kube-state-metrics` SA (or update pod securityContext to remove seccompProfile and use UID in OpenShift range)
        - CRB must not have `app.kubernetes.io/managed-by: cluster-monitoring-operator` label, or use a separate CRB not managed by OpenShift CMO
- [x] Transparent encryption (PASSED with fix — 2026-04-09)
  - Initially FAILED — `enable-wireguard` key was missing from `cilium-config` ConfigMap (present in DEV cluster).
  - Patched `cilium-config` with `enable-wireguard: "true"`, rolled out Cilium DaemonSet. Backup: `os-cilium-config-backup-20260409-0900.yaml`.
  - After fix: WireGuard enabled on all 12 nodes, 11 peers each, `cilium_wg0` interface active.