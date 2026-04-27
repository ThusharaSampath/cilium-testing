# Transparent Encryption (WireGuard) Test

## What It Tests

Validates that Cilium's transparent encryption (WireGuard or IPsec) is enabled and functioning across all nodes. This ensures pod-to-pod traffic crossing node boundaries is encrypted at the network layer without application-level changes.

Reference: https://docs.cilium.io/en/v1.14/security/network/encryption-wireguard/#validate-the-setup

## How It Works

All checks are performed via `kubectl exec` into Cilium agent pods (which run as a DaemonSet on every node).

### Test 1: Cilium Encryption Status

1. Finds a Cilium agent pod in `kube-system`.
2. Runs `cilium status` and greps for "encryption".
3. Checks whether the output indicates WireGuard, IPsec, or Disabled.
4. Passes if WireGuard or IPsec is detected.

### Test 2: WireGuard Interface Details

1. Runs `cilium encrypt status` on the same Cilium pod.
2. Displays the full output (WireGuard interface name, public key, listening port, peers).
3. Counts peer references and compares with expected count (total nodes - 1, since each node should peer with every other node).

### Test 3: Encryption Across All Nodes

1. Lists all Cilium agent pods (`k8s-app=cilium` label).
2. For each pod, runs `cilium encrypt status` and checks the first line.
3. Reports which nodes have encryption working and which don't.
4. Fails if any node reports an error or disabled encryption.

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `CILIUM_NS` | `kube-system` | Namespace where Cilium pods run (override per cluster, e.g. `cilium` on OpenShift) |

## Usage

```bash
bash verification/scripts/cluster/transparent-encryption-test.sh
```

## Prerequisites

- `kubectl` available on PATH.
- Your shell must already be configured to reach the target cluster (KUBECONFIG, proxy/SSH-tunnel, `oc login`, etc.). Verify with `kubectl cluster-info`.

## Expected Output (WireGuard)

```
[INFO] === Test 1: Cilium encryption status ===
  Encryption: WireGuard [NodeEncryption]
[INFO] WireGuard encryption is enabled.

[INFO] === Test 2: WireGuard interface on Cilium pod ===
  Encryption: WireGuard
    Public key: <key>
    Listening port: 51871
    Number of peers: 4
[INFO] Cluster nodes: 5
[INFO] Expected WireGuard peers per node: 4
[INFO] Detected peer references: 4

[INFO] === Test 3: Checking encryption across all Cilium agents ===
[INFO]   Node aks-nodepool002-...-000009 (cilium-abc): Encryption: WireGuard
[INFO]   Node aks-nodepool002-...-00000a (cilium-def): Encryption: WireGuard
...

[INFO] === PASSED: Transparent encryption test ===
```
