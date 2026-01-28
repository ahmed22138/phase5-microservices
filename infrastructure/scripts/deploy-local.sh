#!/bin/bash
# Local Development Deployment Script
# Task: P5-T-108
# Deploys Phase 5 services to local Minikube cluster

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
K8S_DIR="$PROJECT_ROOT/infrastructure/kubernetes"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing=()

    command -v minikube &> /dev/null || missing+=("minikube")
    command -v kubectl &> /dev/null || missing+=("kubectl")
    command -v docker &> /dev/null || missing+=("docker")
    command -v kustomize &> /dev/null || missing+=("kustomize")

    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing[*]}"
        log_info "Please install the missing tools and try again."
        exit 1
    fi

    log_success "All prerequisites installed"
}

# Start Minikube if not running
start_minikube() {
    log_info "Checking Minikube status..."

    if ! minikube status &> /dev/null; then
        log_info "Starting Minikube..."
        minikube start \
            --cpus=4 \
            --memory=8192 \
            --disk-size=20g \
            --driver=docker \
            --kubernetes-version=v1.28.0
        log_success "Minikube started"
    else
        log_success "Minikube already running"
    fi

    # Configure Docker to use Minikube's Docker daemon
    log_info "Configuring Docker environment..."
    eval $(minikube docker-env)
}

# Install Strimzi Kafka Operator
install_strimzi() {
    log_info "Installing Strimzi Kafka Operator..."

    if kubectl get namespace strimzi-system &> /dev/null 2>&1; then
        log_info "Strimzi namespace exists, checking operator..."
        if kubectl get deployment strimzi-cluster-operator -n strimzi-system &> /dev/null 2>&1; then
            log_success "Strimzi already installed"
            return
        fi
    fi

    # Create strimzi namespace
    kubectl create namespace strimzi-system --dry-run=client -o yaml | kubectl apply -f -

    # Install Strimzi operator
    kubectl apply -f "https://strimzi.io/install/latest?namespace=strimzi-system" -n strimzi-system

    # Wait for operator to be ready
    log_info "Waiting for Strimzi operator..."
    kubectl wait deployment/strimzi-cluster-operator \
        -n strimzi-system \
        --for=condition=available \
        --timeout=300s

    log_success "Strimzi installed"
}

# Build Docker images
build_images() {
    log_info "Building Docker images..."

    local services=("chatbot" "task-service" "reminder-service" "recurrence-service" "audit-service")

    for service in "${services[@]}"; do
        log_info "Building $service..."
        docker build -t "phase5/${service}:dev" "$PROJECT_ROOT/services/${service}"
    done

    log_success "All images built"
}

# Deploy infrastructure components
deploy_infrastructure() {
    log_info "Deploying infrastructure components..."

    # Create dev namespace
    kubectl apply -f "$K8S_DIR/overlays/dev/namespace.yaml"

    # Deploy Kafka
    log_info "Deploying Kafka..."
    kubectl apply -k "$K8S_DIR/overlays/dev/kafka" -n phase5-dev

    # Wait for Kafka to be ready
    log_info "Waiting for Kafka cluster..."
    kubectl wait kafka/phase5-kafka \
        -n phase5-dev \
        --for=condition=Ready \
        --timeout=600s || {
            log_warn "Kafka not ready yet, continuing anyway..."
        }

    # Deploy PostgreSQL instances
    log_info "Deploying PostgreSQL databases..."
    kubectl apply -k "$K8S_DIR/overlays/dev/postgres" -n phase5-dev

    # Wait for databases to be ready
    local dbs=("postgres-task" "postgres-reminder" "postgres-recurrence" "postgres-audit")
    for db in "${dbs[@]}"; do
        log_info "Waiting for $db..."
        kubectl wait statefulset/$db \
            -n phase5-dev \
            --for=jsonpath='{.status.readyReplicas}'=1 \
            --timeout=300s || {
                log_warn "$db not ready yet, continuing anyway..."
            }
    done

    # Deploy secrets
    kubectl apply -f "$K8S_DIR/overlays/dev/secrets.yaml" -n phase5-dev

    log_success "Infrastructure deployed"
}

# Deploy Dapr
deploy_dapr() {
    log_info "Installing Dapr..."

    if kubectl get namespace dapr-system &> /dev/null 2>&1; then
        log_success "Dapr already installed"
        return
    fi

    # Check if dapr CLI is available
    if command -v dapr &> /dev/null; then
        dapr init -k --wait
    else
        log_warn "Dapr CLI not found, installing via Helm..."
        helm repo add dapr https://dapr.github.io/helm-charts/
        helm repo update
        helm upgrade --install dapr dapr/dapr \
            --namespace dapr-system \
            --create-namespace \
            --wait
    fi

    log_success "Dapr installed"
}

# Deploy Dapr components
deploy_dapr_components() {
    log_info "Deploying Dapr components..."

    # Create Kafka pub/sub component
    cat <<EOF | kubectl apply -n phase5-dev -f -
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: pubsub
spec:
  type: pubsub.kafka
  version: v1
  metadata:
    - name: brokers
      value: "phase5-kafka-kafka-bootstrap:9092"
    - name: consumerGroup
      value: "phase5-consumers"
    - name: authRequired
      value: "false"
EOF

    log_success "Dapr components deployed"
}

# Deploy services
deploy_services() {
    log_info "Deploying Phase 5 services..."

    # Apply the dev overlay
    kubectl apply -k "$K8S_DIR/overlays/dev" -n phase5-dev

    # Wait for deployments
    local deployments=("chatbot" "task-service" "reminder-service" "recurrence-service" "audit-service")
    for deployment in "${deployments[@]}"; do
        log_info "Waiting for $deployment..."
        kubectl wait deployment/$deployment \
            -n phase5-dev \
            --for=condition=available \
            --timeout=300s || {
                log_warn "$deployment not ready yet..."
            }
    done

    log_success "Services deployed"
}

# Show status
show_status() {
    log_info "Deployment status:"
    echo ""

    echo "=== Pods ==="
    kubectl get pods -n phase5-dev -o wide
    echo ""

    echo "=== Services ==="
    kubectl get services -n phase5-dev
    echo ""

    echo "=== StatefulSets ==="
    kubectl get statefulsets -n phase5-dev
    echo ""

    # Get Minikube service URLs
    log_info "Service URLs (use 'minikube service <name> -n phase5-dev' to access):"
    echo "  - chatbot: minikube service chatbot -n phase5-dev"
    echo "  - task-service: minikube service task-service -n phase5-dev"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up Phase 5 deployment..."

    kubectl delete namespace phase5-dev --ignore-not-found=true

    log_success "Cleanup complete"
}

# Main function
main() {
    local action="${1:-deploy}"

    case "$action" in
        deploy)
            check_prerequisites
            start_minikube
            install_strimzi
            deploy_dapr
            build_images
            deploy_infrastructure
            deploy_dapr_components
            deploy_services
            show_status
            log_success "Phase 5 local deployment complete!"
            ;;
        cleanup)
            cleanup
            ;;
        status)
            show_status
            ;;
        build)
            check_prerequisites
            eval $(minikube docker-env)
            build_images
            ;;
        *)
            echo "Usage: $0 {deploy|cleanup|status|build}"
            echo ""
            echo "Commands:"
            echo "  deploy  - Full deployment of Phase 5 to Minikube"
            echo "  cleanup - Remove Phase 5 from Minikube"
            echo "  status  - Show current deployment status"
            echo "  build   - Build Docker images only"
            exit 1
            ;;
    esac
}

main "$@"
