# Compatibility Testing Checklist

Short tracker for a single Cilium compatibility verification run. Copy this file per cluster/run and tick as you go. Full step details: [`verification-steps.md`](./verification-steps.md).

**Cluster:** `_______________`  **Date:** `_______________`  **Tester:** `_______________`

---

## 0. Prep

- [ ] `kubectl` reaches the target cluster (`kubectl cluster-info`)
- [ ] `verification/.env` filled in (see `.env.example`)
- [ ] `bash scripts/setup.sh` ran clean
- [ ] `npm run login` — Google SSO session saved

---

## 1. Infra (`bash scripts/track-infra.sh`)

- [ ] Step 1/7 — Cluster info
- [ ] Step 2/7 — CoreDNS
- [ ] Step 3/7 — Transparent encryption (WireGuard)
- [ ] Step 4/7 — Hubble observability (CLI + Prometheus)
- [ ] Step 5/7 — Metadata endpoint blocked (`169.254.169.254`)
- [ ] Step 6/7 — Cross-namespace isolation
- [ ] Step 7/7 — Cross-node communication (~5 min)
- [ ] Optional — Gateway error monitor (~10 min)

---

## 2. Tester (`bash scripts/track-tester.sh`)

- [ ] Components created (org, public, project, webapp, tester)
- [ ] Builds succeeded
- [ ] Connections created (tester → org / public / project)
- [ ] Tester redeployed and ACTIVE
- [ ] `/test/public` — 200
- [ ] `/test/org` — 200 *(known broken in DEV CDP)*
- [ ] `/test/project` — 200 (covers project-level S2S + scale-to-zero cold start)
- [ ] `/test/webapp` — 200
- [ ] Webapp reachable in browser
- [ ] Logs + metrics flowing (observability check)

---

## 3. Manual / not-yet-automated

- [ ] HTTP retries (deploy 500-returning service, configure retry, verify in logs)

---

## Result

- [ ] **PASS** — all required checks green
- [ ] **PASS w/ caveats** — note below
- [ ] **FAIL** — note below

**Notes / failures:**

```
```
