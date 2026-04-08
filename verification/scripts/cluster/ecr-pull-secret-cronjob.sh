#!/bin/bash
set -e

# ECR Pull Secret CronJob Setup
# Creates a CronJob that refreshes the OpenShift global pull secret
# with a fresh ECR token every 10 hours (tokens expire every 12 hours).
#
# Reads AWS_REGISTRY, AWS_REGISTRY_USER, AWS_REGISTRY_PASSWORD from .env
# The CronJob pod uses `aws ecr get-login-password` to exchange IAM creds
# for a temporary token, then patches the global pull secret.
#
# Usage: KUBECONFIG=kubeconfig bash ecr-pull-secret-cronjob.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

ENV_FILE="$SCRIPT_DIR/../../.env"

if [ ! -f "$ENV_FILE" ]; then
  fail "Missing .env file at $ENV_FILE"
  exit 1
fi

# Load ECR vars from .env
AWS_REGISTRY=$(grep '^AWS_REGISTRY=' "$ENV_FILE" | cut -d= -f2-)
AWS_REGISTRY_USER=$(grep '^AWS_REGISTRY_USER=' "$ENV_FILE" | cut -d= -f2-)
AWS_REGISTRY_PASSWORD=$(grep '^AWS_REGISTRY_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)

if [ -z "$AWS_REGISTRY" ] || [ -z "$AWS_REGISTRY_USER" ] || [ -z "$AWS_REGISTRY_PASSWORD" ]; then
  fail "AWS_REGISTRY, AWS_REGISTRY_USER, AWS_REGISTRY_PASSWORD must be set in .env"
  exit 1
fi

# Extract region from registry URL (e.g. 567870626192.dkr.ecr.us-east-1.amazonaws.com)
AWS_REGION=$(echo "$AWS_REGISTRY" | sed 's/.*\.ecr\.\(.*\)\.amazonaws\.com/\1/')
if [ -z "$AWS_REGION" ]; then
  fail "Could not extract AWS region from registry URL: $AWS_REGISTRY"
  exit 1
fi

PULL_SECRET_NS="openshift-config"
PULL_SECRET_NAME="pull-secret"
CRONJOB_NS="kube-system"
CRONJOB_NAME="ecr-pull-secret-refresh"
SA_NAME="ecr-pull-secret-refresh-sa"

verify_cluster

log "Registry: $AWS_REGISTRY"
log "Region:   $AWS_REGION"
log "IAM User: $AWS_REGISTRY_USER"

# --- Step 1: AWS credentials secret ---
log "Creating AWS credentials secret in $CRONJOB_NS..."
kubectl create secret generic ecr-aws-credentials \
  --namespace "$CRONJOB_NS" \
  --from-literal=AWS_ACCESS_KEY_ID="$AWS_REGISTRY_USER" \
  --from-literal=AWS_SECRET_ACCESS_KEY="$AWS_REGISTRY_PASSWORD" \
  --from-literal=AWS_DEFAULT_REGION="$AWS_REGION" \
  --from-literal=ECR_REGISTRY="$AWS_REGISTRY" \
  --dry-run=client -o yaml | kubectl apply -f -

# --- Step 2: ServiceAccount + RBAC ---
log "Creating ServiceAccount and RBAC..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: $SA_NAME
  namespace: $CRONJOB_NS
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ecr-pull-secret-refresh
rules:
- apiGroups: [""]
  resources: ["secrets"]
  resourceNames: ["$PULL_SECRET_NAME"]
  verbs: ["get", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ecr-pull-secret-refresh
subjects:
- kind: ServiceAccount
  name: $SA_NAME
  namespace: $CRONJOB_NS
roleRef:
  kind: ClusterRole
  name: ecr-pull-secret-refresh
  apiGroup: rbac.authorization.k8s.io
EOF

# --- Step 3: CronJob ---
# The inner script is in a single-quoted heredoc so shell vars are NOT expanded
# at apply time. Placeholders (__X__) are replaced by sed for static config,
# while $AWS_ACCESS_KEY_ID etc. are resolved at pod runtime from the envFrom secret.
log "Creating CronJob (schedule: every 10 hours)..."
cat <<'CRONJOB_EOF' | sed \
  -e "s|__CRONJOB_NS__|$CRONJOB_NS|g" \
  -e "s|__CRONJOB_NAME__|$CRONJOB_NAME|g" \
  -e "s|__SA_NAME__|$SA_NAME|g" \
  -e "s|__PULL_SECRET_NS__|$PULL_SECRET_NS|g" \
  -e "s|__PULL_SECRET_NAME__|$PULL_SECRET_NAME|g" \
  | kubectl apply -f -
apiVersion: batch/v1
kind: CronJob
metadata:
  name: __CRONJOB_NAME__
  namespace: __CRONJOB_NS__
spec:
  schedule: "0 */10 * * *"
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 3
      template:
        spec:
          serviceAccountName: __SA_NAME__
          restartPolicy: OnFailure
          containers:
          - name: refresh
            image: amazon/aws-cli:latest
            envFrom:
            - secretRef:
                name: ecr-aws-credentials
            command: ["/bin/bash", "-c"]
            args:
            - |
              set -e

              echo "[INFO] Starting ECR pull secret refresh at $(date)"
              echo "[INFO] Registry: $ECR_REGISTRY | Region: $AWS_DEFAULT_REGION"

              # 1. Exchange IAM credentials for a temporary ECR token
              ECR_TOKEN=$(aws ecr get-login-password --region "$AWS_DEFAULT_REGION")
              if [ -z "$ECR_TOKEN" ]; then
                echo "[FAIL] aws ecr get-login-password returned empty"
                exit 1
              fi
              echo "[INFO] Got ECR token (length: ${#ECR_TOKEN})"

              # 2. Build docker auth: base64("AWS:<token>")
              export AUTH=$(printf 'AWS:%s' "$ECR_TOKEN" | base64 -w 0)

              # 3. Install kubectl
              echo "[INFO] Installing kubectl..."
              curl -sLO "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
              chmod +x kubectl && mv kubectl /usr/local/bin/

              # 4. Read current global pull secret
              echo "[INFO] Reading current pull secret..."
              CURRENT=$(kubectl get secret __PULL_SECRET_NAME__ \
                -n __PULL_SECRET_NS__ \
                -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d)

              # 5. Merge ECR entry into the pull secret JSON
              UPDATED=$(echo "$CURRENT" | python3 -c "
              import json, sys, os
              data = json.load(sys.stdin)
              data['auths'][os.environ['ECR_REGISTRY']] = {
                  'auth': os.environ['AUTH'],
                  'email': 'ecr-refresh@choreo.dev'
              }
              print(json.dumps(data))
              ")

              # 6. Patch the global pull secret
              ENCODED=$(echo -n "$UPDATED" | base64 -w 0)
              echo "[INFO] Patching global pull secret..."
              kubectl patch secret __PULL_SECRET_NAME__ \
                -n __PULL_SECRET_NS__ \
                --type merge \
                -p "{\"data\":{\".dockerconfigjson\":\"${ENCODED}\"}}"

              echo "[INFO] Done! ECR pull secret refreshed at $(date)"
CRONJOB_EOF

# --- Step 4: Run it now ---
log "Triggering initial token refresh..."
kubectl delete job "${CRONJOB_NAME}-init" -n "$CRONJOB_NS" --ignore-not-found 2>/dev/null
kubectl create job --from="cronjob/$CRONJOB_NAME" \
  "${CRONJOB_NAME}-init" -n "$CRONJOB_NS"

log "Waiting for initial job to complete (timeout: 120s)..."
if kubectl wait --for=condition=complete "job/${CRONJOB_NAME}-init" \
  -n "$CRONJOB_NS" --timeout=120s 2>/dev/null; then
  log "=== ECR pull secret refreshed successfully! ==="
else
  warn "Job not complete yet. Check logs:"
  warn "  kubectl logs -n $CRONJOB_NS -l job-name=${CRONJOB_NAME}-init"
fi

log ""
log "Setup complete! CronJob runs every 10 hours."
log "  Status:        kubectl get cronjob $CRONJOB_NAME -n $CRONJOB_NS"
log "  Last job logs: kubectl logs -n $CRONJOB_NS -l job-name=${CRONJOB_NAME}-init"
log "  Manual run:    kubectl create job --from=cronjob/$CRONJOB_NAME manual-refresh -n $CRONJOB_NS"
