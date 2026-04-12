#!/bin/bash
# Fix: Grant Fluent Bit the privileged SCC + patch DaemonSet to run as privileged on OpenShift
# Date: 2026-04-11 (updated 2026-04-12)
# Problem:
#   1. Fluent Bit SA has no SCC grant → defaults to restricted → can't read host log files
#   2. DaemonSet has runAsUser: 10000 hardcoded → UID 10000 can't read root-owned logs
#   3. Init container chowns DB to 10000:10000 → SQLite "readonly database" when main container runs as root
#   4. SELinux on OpenShift blocks hostPath reads even with root UID → needs privileged: true
#   5. FluxCD HelmRelease reconciles and reverts patches → must suspend first
# Solution:
#   1. Suspend FluxCD HelmRelease to prevent reconciliation reverting patches
#   2. Grant privileged SCC to fluent-bit SA
#   3. Patch DaemonSet: privileged: true, runAsUser: 0, runAsNonRoot: false, allowPrivilegeEscalation: true
#   4. Patch init container: chown 0:0
#
# Prerequisites: kubectl with cluster-admin, KUBECONFIG set

set -euo pipefail

NAMESPACE="choreo-observability"
SA="fluent-bit"

echo "=== Step 1: Suspend FluxCD HelmRelease to prevent reconciliation ==="
kubectl patch helmrelease choreo-fluent-bit -n "${NAMESPACE}" --type=merge \
  -p '{"spec":{"suspend":true}}'

echo "=== Step 2: Grant privileged SCC to ${SA} in ${NAMESPACE} ==="
# Using kubectl patch since oc may not be available
# This is idempotent-safe: will fail silently if already granted
kubectl patch scc privileged --type=json \
  -p "[{\"op\":\"add\",\"path\":\"/users/-\",\"value\":\"system:serviceaccount:${NAMESPACE}:${SA}\"}]" 2>/dev/null || echo "  (SCC may already be granted, continuing...)"

echo "=== Step 3: Patch DaemonSet — privileged: true, runAsUser: 0 ==="
kubectl patch daemonset fluent-bit -n "${NAMESPACE}" --type='json' -p='[
  {"op":"replace","path":"/spec/template/spec/containers/0/securityContext","value":{"privileged":true,"runAsUser":0,"runAsNonRoot":false,"readOnlyRootFilesystem":false,"allowPrivilegeEscalation":true}}
]'

echo "=== Step 4: Patch init container — chown 0:0 ==="
kubectl patch daemonset fluent-bit -n "${NAMESPACE}" --type='json' -p='[
  {"op":"replace","path":"/spec/template/spec/initContainers/0/command","value":["sh","-c","chown -R 0:0 /var/lib/fluent-bit/db"]}
]'

echo "=== Step 5: Wait for rollout ==="
kubectl rollout status daemonset/fluent-bit -n "${NAMESPACE}" --timeout=180s

echo "=== Done. Verify with: ==="
echo "  kubectl logs -n ${NAMESPACE} -l app.kubernetes.io/name=fluent-bit --tail=10"
echo "  kubectl exec opensearch-data-0 -n ${NAMESPACE} -- curl -s -k -u admin:<password> 'https://localhost:9200/_cat/indices?v' | grep container-logs"
echo ""
echo "NOTE: FluxCD HelmRelease is suspended. To resume:"
echo "  kubectl patch helmrelease choreo-fluent-bit -n ${NAMESPACE} --type=merge -p '{\"spec\":{\"suspend\":false}}'"
echo "  (This will revert patches — Helm values must be updated first for permanence)"
