# OpenShift PDP (Private Data Plane) — Debugging Notes

Reference notes from validating Cilium on an OpenShift 4.x dataplane.
Prerequisite: a shell with `kubectl`/`oc` configured to reach the target cluster.

---

## Cluster Overview

| Item | Value |
|---|---|
| Platform | OpenShift 4.x on AWS (us-east-1) |
| Kubernetes | v1.33.8 |
| CNI | Cilium 1.18.8 (sole CNI, not chaining) |
| Routing | VXLAN tunnel mode |
| kube-proxy | Replaced by Cilium BPF (`kube-proxy-replacement: true`) |
| IPAM | cluster-pool (`10.128.0.0/14`) |
| Nodes | 12 (9 workers, 3 control-plane) — all private, no external IPs |
| Container Runtime | CRI-O 1.33.9 |
| Hubble | Enabled (relay + UI running in `cilium` namespace) |
| Encryption | Disabled (WireGuard not enabled) |

## Issues Found & Fixed

### 1. SCC Violation — Build Pods Rejected

**Symptom:** Build pods in `dp-builds-*` namespaces stuck in `CreateContainerConfigError`. Events showed `Security Context Constraint (SCC) violation`.

**Root Cause:** Argo build workflow pods require `privileged: true` and `hostPath` volumes. The build ServiceAccount (`dp-builds-...-sa`) was not bound to any permissive SCC.

**Fix:**
```bash
oc adm policy add-scc-to-user privileged system:serviceaccount:dp-builds-<uuid>:dp-builds-<uuid>-sa
```

### 2. Azure-Specific Node Selectors — Pods Stuck Pending

**Symptom:** Build pods stuck `Pending` with `0/12 nodes are available: 12 node(s) didn't match Pod's node affinity/selector`.

**Root Cause:** Build workflow templates had `nodeSelector: kubernetes.azure.com/scalesetpriority=spot` — an AKS-specific label that doesn't exist on AWS nodes. This was a platform-level config carried over from AKS.

**Fix:**
- Temporary: labeled a worker node with `kubernetes.azure.com/scalesetpriority=spot`
- Permanent: platform-level change to remove the AKS-specific nodeSelector for OpenShift DPs
- Cleaned up: removed temporary node labels after platform fix

### 3. ECR Image Pull Failures — Application Pods `ImagePullBackOff`

**Symptom:** User application pods in `dp-osdev2-*` namespaces stuck in `ImagePullBackOff`. Images are stored in AWS ECR (`567870626192.dkr.ecr.us-east-1.amazonaws.com`).

**Root Cause:** ECR does not support basic auth with raw IAM access keys. It requires a temporary token obtained via `aws ecr get-login-password`, which uses username `AWS` + the token as password. The token expires every **12 hours**.

**Fix:**
1. Updated the OpenShift global pull secret (`openshift-config/pull-secret`) with ECR credentials using the correct format (username: `AWS`, password: token from `aws ecr get-login-password`)
2. Created a CronJob (`kube-system/ecr-pull-secret-refresh`) that refreshes the token every 10 hours

**How ECR auth works:**
```
IAM Access Key + Secret → aws ecr get-login-password → temporary token (12h)
Docker auth = base64("AWS:<token>")
This gets merged into the global pull secret under the ECR registry key
```

**How the global pull secret reaches pods:**
OpenShift MCO (Machine Config Operator) syncs `openshift-config/pull-secret` to every node's `/var/lib/kubelet/config.json`. CRI-O on each node reads this file and uses it for any image pull. No per-namespace `imagePullSecrets` needed for registries in the global pull secret.

**Important:** The global pull secret only affects the ECR registry entry. Existing registries (`quay.io`, `registry.redhat.io`, `registry.connect.redhat.com`, `cloud.openshift.com`) are untouched.

### 4. Cilium Egress Policies Blocking API Gateway Traffic

**Symptom:** External API calls to `*.prod.opc.choreoapis.dev` failed with TLS handshake error (`SSL_ERROR_SYSCALL`). Internal service mesh traffic within `choreo-apim` also broken.

**Root Cause:** Two manually-applied CiliumNetworkPolicies in `choreo-apim` namespace were overly restrictive:

- `allow-dns-egress` — empty `endpointSelector` (selects ALL pods), only allowed DNS egress (port 5353)
- `allow-apiserver-egress` — empty `endpointSelector`, only allowed API server (6443) and Redis (6379)

With `kube-proxy-replacement: true`, Cilium enforces egress policy on any pod selected by a CiliumNetworkPolicy. Since these policies had empty selectors, **all pods** in `choreo-apim` (including nginx ingress controller) could only reach DNS, API server, and Redis. The nginx controller could not forward traffic to the choreo-connect router backends.

These policies were **not managed by Helm/FluxCD** — they were manually applied with `kubectl apply` (no Helm labels, just `kubectl.kubernetes.io/last-applied-configuration`). The working AKS cluster (`dev-choreo-apim`) had no such policies.

**Debugging path:**
1. Confirmed cross-node pod connectivity was fine globally (DaemonSet test from `cross-node-request-drop-test.yaml`)
2. Confirmed nginx pod could reach `localhost` but not other pods in `choreo-apim`
3. Confirmed pods outside `choreo-apim` could reach nginx pods cross-node
4. Checked `cilium-dbg endpoint list` — policy-enabled was `egress` for nginx endpoints
5. Compared policies with working cluster — working cluster had none in its APIM namespace
6. Used Hubble to confirm external traffic never reached Cilium's datapath on port 443 (NodePort traffic was being dropped before Cilium because nginx couldn't respond — upstream timeout)

**Fix:**
```bash
kubectl delete ciliumnetworkpolicy allow-dns-egress -n choreo-apim
kubectl delete ciliumnetworkpolicy allow-apiserver-egress -n choreo-apim
```

After deletion, nginx → router egress started working immediately (`curl http://router-default-p1.choreo-apim.svc:9000/` returned 200).

### 5. External API Endpoint Still Unreachable (TLS Handshake Fails)

**Status:** OPEN

**Symptom:** After fixing the Cilium egress policies, internal routing works (nginx → router → backends), but external curl to `https://<org-uuid>-os-dev-2.prod.opc.choreoapis.dev/...` still fails with `SSL_ERROR_SYSCALL`.

**What we know:**
- DNS resolves to an AWS Classic ELB (`a74746ca...us-east-1.elb.amazonaws.com`)
- TCP connects (ELB accepts the connection)
- TLS handshake never completes (server never responds after Client Hello)
- ELB forwards TCP:443 → NodePort:31593 on worker nodes
- Hubble shows **no flows** on port 443 from external sources — traffic never reaches Cilium's datapath
- Health check probes on port 10254 are visible in Hubble and working
- This is **outside Cilium's scope** — likely an AWS Security Group issue (NodePort 31593 not allowed inbound from ELB)

**Next steps:**
- Check AWS Security Groups on worker node EC2 instances
- Verify NodePort range (30000-32767) is allowed inbound from the ELB's security group/subnet CIDR
- Check ELB target health status

---

## Automation Added

### ECR Pull Secret CronJob

Script: `verification/scripts/cluster/ecr-pull-secret-cronjob.sh`

Creates the following resources in the cluster:
- `kube-system/ecr-aws-credentials` — Secret with IAM access key, secret, region, registry URL
- `kube-system/ecr-pull-secret-refresh-sa` — ServiceAccount for the CronJob
- `ecr-pull-secret-refresh` ClusterRole + ClusterRoleBinding — allows get/patch on `openshift-config/pull-secret`
- `kube-system/ecr-pull-secret-refresh` — CronJob (every 10 hours)

The CronJob pod (using `amazon/aws-cli` image):
1. Runs `aws ecr get-login-password` to get a fresh token
2. Reads current global pull secret
3. Merges/updates the ECR entry
4. Patches the global pull secret

```bash
# Setup (run once)
bash verification/scripts/cluster/ecr-pull-secret-cronjob.sh

# Manual trigger
kubectl create job --from=cronjob/ecr-pull-secret-refresh manual-refresh -n kube-system

# Check logs
kubectl logs -n kube-system -l job-name=ecr-pull-secret-refresh-init
```

---

## Useful Commands

## Artifacts Applied to Cluster

Active manifests/scripts kept in this directory (originals applied during onboarding):

| File | Purpose |
|---|---|
| `hubble-metrics-service.yaml` | Headless Service in `cilium` namespace that exposes Hubble metrics (port 9965) from Cilium agent pods. Required for the `hubble` ServiceMonitor in `choreo-observability` to discover and scrape Hubble metrics. |
| `prometheus-operator-crb-fix.yaml` | New ClusterRoleBinding that binds ClusterRole `prometheus-operator` to SA `choreo-observability:prometheus-operator`. The Flux-managed CRB (`prometheus-operator`) incorrectly points to `openshift-monitoring` namespace and can't be patched (Flux reconciles it back). This new CRB is not managed by Flux so it persists. |
| `dev-cilium-config.yaml` | Reference copy of the AKS dev cluster's `cilium-config` ConfigMap for comparison. |
| `os-cilium-config.yaml` | Reference copy of the OS cluster's `cilium-config` ConfigMap for comparison. |
| `os-allow-world-except-az-metadata-patched-20260410.yaml` | Patched `allow-world-except-az-metadata` CCNP using `egressDeny` with `toCIDR: 169.254.169.254/32` (matching the AKS pattern). Helm-managed — may be reconciled by Flux. |
| `os-opensearch-internal-users-patched-20260411.yaml` | Patched `internal_users.yml` with `fluent-bit` and `logging-api` users added (with bcrypt hashes). Must be applied to `opensearch-security-config` secret for persistence. |
| `os-fluent-bit-scc-fix-20260411.sh` | Script to grant `privileged` SCC to `fluent-bit` SA and restart the DaemonSet. Fixes Permission denied errors reading `/var/log/containers/`. |
| `kube-state-metrics-crb-fix.yaml` | ClusterRoleBinding fix for `kube-state-metrics` SA. |

Original/backup copies of cluster manifests created during this onboarding live under `_archive/ospdp-backups/` (gitignored).

```bash
# Check build pods
kubectl get pods -n dp-builds-<uuid>

# Check application pods
kubectl get pods -n dp-osdev2-<project-ns>

# Check Cilium status
kubectl exec -n cilium <cilium-pod> -- cilium-dbg status

# Hubble observe (from cilium agent pod)
kubectl exec -n cilium <cilium-pod> -- hubble observe --namespace choreo-apim --follow
kubectl exec -n cilium <cilium-pod> -- hubble observe --type drop --last 50

# Check global pull secret registries
kubectl get secret pull-secret -n openshift-config -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d | python3 -c "import json,sys; [print(k) for k in json.load(sys.stdin)['auths'].keys()]"

# Check Cilium network policies
kubectl get ciliumnetworkpolicy -A

# Check nginx ingress controller
kubectl get pods -n choreo-apim -l app.kubernetes.io/component=controller -o wide
kubectl logs -n choreo-apim <nginx-pod> --tail=20

# ECR CronJob status
kubectl get cronjob ecr-pull-secret-refresh -n kube-system
kubectl get jobs -n kube-system -l job-name=ecr-pull-secret-refresh-init
```

---

## Key Differences: OpenShift (OS) vs AKS (DEV)

| Aspect | OpenShift (OS) | AKS (DEV) |
|---|---|---|
| Cilium namespace | `cilium` | `kube-system` |
| APIM namespace | `choreo-apim` | `dev-choreo-apim` |
| Container runtime | CRI-O | containerd |
| SCC | OpenShift SCCs (must grant to SAs) | N/A (no SCC concept) |
| Image pull secret | Global pull secret (`openshift-config/pull-secret`) synced to nodes by MCO | Per-namespace `imagePullSecrets` |
| Image registry | AWS ECR (needs token refresh every 12h) | Azure ACR |
| DNS port | 5353 (OpenShift DNS) | 53 (CoreDNS) |
| Default SAs per namespace | `default`, `builder`, `deployer` | `default` only |
