# Cross-Node Communication Test

## What It Tests

Verifies that HTTP requests between pods on **different Kubernetes nodes** are not being dropped. This is a critical check after Cilium upgrades, as CNI changes can sometimes cause cross-node traffic to fail silently.

## How It Works

### Setup Phase
1. Sources `common.sh` and verifies kubectl connectivity to the cluster the current shell is targeting.
2. Cleans up any leftover resources from previous runs.
3. Applies `manifests/cross-node-request-drop-test.yaml` which creates:
   - **Server DaemonSet**: Runs an nginx pod on every node (port 80). Has a Cilium proxy-visibility annotation so traffic is observable via Hubble.
   - **Client DaemonSet**: Runs a curl pod on every node that continuously makes HTTP requests to the server service every 30 seconds. If a request returns anything other than HTTP 200, the client exits with code 1 (causing a container restart).
   - **ClusterIP Service**: Exposes server pods so client pods route through Kubernetes networking (potentially cross-node).

### Monitoring Phase (5 minutes)
The script polls pod restart counts every 15 seconds and operates in two phases:

- **Settling phase (0–120s)**: Some initial client restarts are expected because client pods may start before server pods are ready. Restarts during this window are tolerated.
- **Stable phase (120–300s)**: At the 120s mark, the script records the current restart counts as a "baseline". Any **new** restarts after this point indicate cross-node request drops.

The live output shows:
```
[122s/300s] [STABLE] Client restarts: 6 | Server restarts: 0 | Remaining: 178s
```

### Result
- **PASS**: Zero new restarts after the settle window. Cleans up all resources.
- **FAIL**: New restarts detected after settle. Reports the count and cleans up. Exit code 1.

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `NAMESPACE` | `default` | Kubernetes namespace for the test resources |
| `MONITOR_DURATION` | `300` | Total monitoring time in seconds |
| `SETTLE_TIME` | `120` | Seconds to wait before checking for stable restarts |

## Usage

```bash
# Default (5 min monitor, 2 min settle)
bash verification/scripts/cluster/cross-node-test.sh

# Custom duration (10 min monitor, 3 min settle)
MONITOR_DURATION=600 SETTLE_TIME=180 bash verification/scripts/cluster/cross-node-test.sh
```

## Prerequisites

- `kubectl` available on PATH.
- Your shell must already be configured to reach the target cluster (KUBECONFIG, proxy/SSH-tunnel, `oc login`, etc.). Verify with `kubectl cluster-info`.
