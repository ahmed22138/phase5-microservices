# Phase 5 Cloud Deployment Guide
**Task: P5-T-117**

This guide covers deploying Phase 5 services to a cloud Kubernetes cluster (AWS EKS, Azure AKS, or GCP GKE).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Secrets Management](#secrets-management)
4. [Database Configuration](#database-configuration)
5. [Kafka Setup](#kafka-setup)
6. [Deployment Steps](#deployment-steps)
7. [Verification](#verification)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools
- `kubectl` v1.28+
- `kustomize` v5.0+
- `helm` v3.0+
- Cloud CLI (aws, az, or gcloud)

### Cluster Requirements
- Kubernetes 1.28+
- 3+ worker nodes (4 vCPU, 16GB RAM each recommended)
- Network policy support (Calico, Cilium, or cloud-native)
- Ingress controller (NGINX, ALB, or cloud-native)

## Infrastructure Setup

### 1. Create Kubernetes Cluster

#### AWS EKS
```bash
eksctl create cluster \
  --name phase5-staging \
  --region us-east-1 \
  --version 1.28 \
  --nodegroup-name workers \
  --node-type t3.xlarge \
  --nodes 3 \
  --nodes-min 2 \
  --nodes-max 5
```

#### Azure AKS
```bash
az aks create \
  --resource-group phase5-rg \
  --name phase5-staging \
  --node-count 3 \
  --node-vm-size Standard_D4s_v3 \
  --kubernetes-version 1.28 \
  --enable-managed-identity
```

#### GCP GKE
```bash
gcloud container clusters create phase5-staging \
  --region us-central1 \
  --num-nodes 3 \
  --machine-type e2-standard-4 \
  --cluster-version 1.28
```

### 2. Install Dapr

```bash
# Add Dapr Helm repo
helm repo add dapr https://dapr.github.io/helm-charts/
helm repo update

# Install Dapr
helm upgrade --install dapr dapr/dapr \
  --namespace dapr-system \
  --create-namespace \
  --set global.mtls.enabled=true \
  --set global.ha.enabled=true \
  --wait
```

### 3. Install External Secrets Operator (Optional)

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets \
  external-secrets/external-secrets \
  --namespace external-secrets \
  --create-namespace
```

## Secrets Management

### Option 1: External Secrets Operator

Configure your cloud secret store:

#### AWS Secrets Manager
```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-store
  namespace: phase5-staging
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
```

Create external secret references:
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: task-db-credentials
  namespace: phase5-staging
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-store
    kind: SecretStore
  target:
    name: task-db-credentials
  data:
    - secretKey: host
      remoteRef:
        key: phase5/staging/task-db
        property: host
    - secretKey: username
      remoteRef:
        key: phase5/staging/task-db
        property: username
    - secretKey: password
      remoteRef:
        key: phase5/staging/task-db
        property: password
```

### Option 2: Sealed Secrets

```bash
# Install Sealed Secrets controller
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets \
  --namespace kube-system

# Create sealed secrets
kubeseal --format=yaml < secret.yaml > sealed-secret.yaml
```

### Option 3: Manual Secrets (Not Recommended for Production)

Replace placeholders in `overlays/staging/secrets.yaml` and apply:
```bash
kubectl apply -f secrets.yaml -n phase5-staging
```

## Database Configuration

### Option 1: Managed Databases (Recommended)

#### AWS RDS PostgreSQL
```bash
aws rds create-db-instance \
  --db-instance-identifier phase5-task-db \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 15 \
  --master-username admin \
  --master-user-password <password> \
  --allocated-storage 20
```

Create databases for each service:
- `task_db` - Task Service
- `reminder_db` - Reminder Service
- `recurrence_db` - Recurrence Service
- `audit_db` - Audit Service (use TimescaleDB)

#### TimescaleDB for Audit Service
Use Timescale Cloud or self-managed TimescaleDB for the audit service.

### Option 2: In-Cluster PostgreSQL

Apply the staging overlay with StatefulSets (for testing only):
```bash
kubectl apply -k infrastructure/kubernetes/overlays/dev/postgres -n phase5-staging
```

## Kafka Setup

### Option 1: Managed Kafka (Recommended)

#### AWS MSK
```bash
aws kafka create-cluster \
  --cluster-name phase5-kafka \
  --broker-node-group-info \
    instanceType=kafka.m5.large,clientSubnets=subnet-xxx,securityGroups=sg-xxx \
  --kafka-version 3.6.0 \
  --number-of-broker-nodes 3
```

#### Confluent Cloud
Follow Confluent Cloud documentation to create a cluster.

### Option 2: Strimzi Operator

```bash
# Install Strimzi
kubectl create namespace kafka
kubectl apply -f 'https://strimzi.io/install/latest?namespace=kafka' -n kafka

# Apply Kafka CR from staging overlay
kubectl apply -k infrastructure/kubernetes/overlays/staging/kafka -n kafka
```

### Create Topics

Required topics:
- `task-events` - Task domain events
- `reminder-events` - Reminder domain events
- `recurrence-events` - Recurrence domain events

## Deployment Steps

### 1. Configure Context

```bash
# Set kubectl context
kubectl config use-context phase5-staging

# Create namespace
kubectl apply -f infrastructure/kubernetes/overlays/staging/namespace.yaml
```

### 2. Deploy Secrets

```bash
# Using External Secrets
kubectl apply -f external-secrets/ -n phase5-staging

# Or manual secrets
kubectl apply -f infrastructure/kubernetes/overlays/staging/secrets.yaml -n phase5-staging
```

### 3. Deploy Dapr Components

```bash
# Configure Kafka pub/sub component
kubectl apply -f - <<EOF
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: pubsub
  namespace: phase5-staging
spec:
  type: pubsub.kafka
  version: v1
  metadata:
    - name: brokers
      value: "<kafka-bootstrap-servers>"
    - name: consumerGroup
      value: "phase5-consumers"
    - name: authType
      value: "password"
    - name: saslUsername
      secretKeyRef:
        name: kafka-credentials
        key: sasl-username
    - name: saslPassword
      secretKeyRef:
        name: kafka-credentials
        key: sasl-password
EOF
```

### 4. Deploy Services

```bash
# Build and push images
docker build -t <registry>/phase5/chatbot:staging services/chatbot
docker build -t <registry>/phase5/task-service:staging services/task-service
docker build -t <registry>/phase5/reminder-service:staging services/reminder-service
docker build -t <registry>/phase5/recurrence-service:staging services/recurrence-service
docker build -t <registry>/phase5/audit-service:staging services/audit-service

docker push <registry>/phase5/chatbot:staging
# ... push all images

# Update image references in kustomization.yaml
# Then deploy
kubectl apply -k infrastructure/kubernetes/overlays/staging -n phase5-staging
```

### 5. Configure Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: phase5-ingress
  namespace: phase5-staging
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - chatbot.phase5.example.com
      secretName: chatbot-tls
  rules:
    - host: chatbot.phase5.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: chatbot
                port:
                  number: 3000
```

## Verification

### Check Pod Status
```bash
kubectl get pods -n phase5-staging
kubectl get hpa -n phase5-staging
```

### Check Service Health
```bash
# Port-forward to test locally
kubectl port-forward svc/chatbot 3000:3000 -n phase5-staging

# Test health endpoint
curl http://localhost:3000/health
```

### Check Dapr
```bash
kubectl get components -n phase5-staging
kubectl logs -l app=chatbot -c daprd -n phase5-staging
```

### Verify Event Flow
```bash
# Check Kafka topics
kubectl exec -it phase5-kafka-0 -n kafka -- \
  kafka-topics.sh --list --bootstrap-server localhost:9092

# Check audit service received events
kubectl logs -l app=audit-service -n phase5-staging
```

## Monitoring

### Prometheus & Grafana

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace
```

### Key Metrics to Monitor

| Metric | Threshold | Action |
|--------|-----------|--------|
| Pod CPU > 80% | 70% | HPA scales up |
| Pod Memory > 85% | 80% | HPA scales up |
| Kafka lag > 1000 | 500 | Scale consumers |
| DB connections > 80% | 70% | Scale connection pool |
| Error rate > 1% | 0.5% | Investigate |

### Alerts

Configure PagerDuty/Slack alerts for:
- Pod restarts > 3 in 5 minutes
- HPA at max replicas
- Kafka consumer lag increasing
- Database connection failures

## Troubleshooting

### Common Issues

#### Pods Not Starting
```bash
kubectl describe pod <pod-name> -n phase5-staging
kubectl logs <pod-name> -n phase5-staging
```

#### Database Connection Failures
```bash
# Check secrets
kubectl get secret task-db-credentials -n phase5-staging -o yaml

# Test connection from pod
kubectl exec -it <pod> -- psql -h <host> -U <user> -d <db>
```

#### Kafka Connection Issues
```bash
# Check Dapr component
kubectl get component pubsub -n phase5-staging -o yaml

# Check Dapr sidecar logs
kubectl logs <pod> -c daprd -n phase5-staging
```

#### Network Policy Issues
```bash
# Temporarily disable policies
kubectl delete networkpolicy --all -n phase5-staging

# Test connectivity, then re-enable policies
kubectl apply -f network-policies.yaml -n phase5-staging
```

### Rollback

```bash
# Rollback deployment
kubectl rollout undo deployment/chatbot -n phase5-staging

# Check rollout history
kubectl rollout history deployment/chatbot -n phase5-staging
```

## Security Checklist

- [ ] All secrets stored in external secret manager
- [ ] Network policies enabled
- [ ] Pod security policies/standards enforced
- [ ] RBAC configured (least privilege)
- [ ] TLS enabled for all ingress
- [ ] Database SSL connections required
- [ ] Kafka SASL authentication enabled
- [ ] Container images scanned for vulnerabilities
- [ ] Resource limits set on all pods
