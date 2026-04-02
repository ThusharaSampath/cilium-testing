# Hubble Observability Test

## What It Tests

Verifies that Cilium's Hubble observability layer is functioning correctly — both the real-time flow observation (CLI) and the metrics pipeline (Prometheus). After Cilium upgrades, Hubble can sometimes fail to report flows or stop exporting metrics.

## How It Works

### Test 1: Hubble CLI (L7 Traffic Observation)

1. Finds a Cilium agent pod in `kube-system` (`k8s-app=cilium` label).
2. Runs `hubble observe -t l7 --last 10` inside the Cilium agent pod via `kubectl exec`.
   - `-t l7` filters for Layer 7 (HTTP/DNS) traffic only.
   - `--last 10` retrieves the last 10 observed flows.
3. If flows are returned, the test passes. If empty, Hubble may not be running or no L7 traffic is flowing.

**Why kubectl exec instead of local Hubble CLI?**
The AKS cluster is private (accessible only via SSH tunnel). `kubectl port-forward` doesn't work through an HTTPS proxy (it requires a direct websocket connection), so we exec directly into the Cilium pod where the Hubble binary is already available.

### Test 2: Prometheus (hubble_http_requests_total)

1. Finds the Grafana pod in `choreo-observability` namespace (it has `curl` installed).
2. Runs `curl` inside that pod against the cluster-internal Prometheus URL:
   ```
   http://choreo-system-prometheus:9090/api/v1/query?query=hubble_http_requests_total
   ```
3. Parses the JSON response to count how many time series exist for `hubble_http_requests_total`.
4. If at least one series is found, the test passes. Empty results means Hubble is not exporting metrics to Prometheus.

**Why kubectl exec instead of port-forward?**
Same reason — the HTTPS proxy tunnel doesn't support port-forwarding. By exec-ing into a pod that's already inside the cluster network, we can reach Prometheus directly via its ClusterIP service name.

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `HTTPS_PROXY` | `http://localhost:3129` | Proxy for reaching the private AKS API server |
| `CILIUM_NS` | `kube-system` | Namespace where Cilium pods run |
| `PROMETHEUS_NS` | `choreo-observability` | Namespace where Prometheus runs |
| `PROMETHEUS_SVC` | `choreo-system-prometheus` | Prometheus service name |
| `PROMETHEUS_PORT` | `9090` | Prometheus service port |

## Usage

```bash
bash verification/scripts/cluster/hubble-observability-test.sh
```

## Prerequisites

- SSH tunnel running: `sh ssh-tunnel-dev-dp.sh <username>`
- kubectl configured: `az aks get-credentials --resource-group choreo-dev-dataplane-002-aks-rg --name choreo-dev-dataplane-aks-cluster-002 --overwrite-existing`

## Example Output

```
[INFO] === Test 1: Hubble L7 traffic observation ===
[INFO] Using Cilium pod: cilium-chvhh
[INFO] Running: hubble observe -t l7 --last 10
[INFO] Captured 10 L7 flow(s). Sample:
  Mar 31 06:35:56.143: default/request-drop-test-client-twlhp:59848 -> default/request-drop-test-server-8qvw6:80 http-request FORWARDED
[INFO] Hubble CLI: PASSED

[INFO] === Test 2: Prometheus (hubble_http_requests_total) ===
[INFO] Querying Prometheus via pod: prometheus-grafana-5d584b48b4-5n5c2
[INFO] Found 2 time series for hubble_http_requests_total.
[INFO] Prometheus Hubble metrics: PASSED

[INFO] === PASSED: Hubble observability test ===
```
