
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
- [ ] Cilium Network Policy enforcement (https://github.com/ThusharaSampath/cilium-testing)
  - [ ] Unable to connect to the metadata endpoint http://169.254.169.254
  - [ ] Public services are reachable via the gateway
  - [ ] Organization-level services are reachable via the internal gateway (This was not worked in DEV CDP)
  - [ ] Project-level services are reachable via another component within the same project
  - [ ] Webapps are reachable (also tested via tester `/test/webapp` endpoint)
  - [ ] CoreDNS connectivity is working
  - [ ] Service-to-service scale to zero is working with both services having scale to zero enabled, and the second service is only exposed on the project scope
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
- [ ] Transparent encryption
  - https://docs.cilium.io/en/v1.14/security/network/encryption-wireguard/#validate-the-setup