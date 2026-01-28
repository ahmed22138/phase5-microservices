# Local Development Deployment Script (PowerShell)
# Task: P5-T-108
# Deploys Phase 5 services to local Minikube cluster

param(
    [Parameter(Position=0)]
    [ValidateSet("deploy", "cleanup", "status", "build")]
    [string]$Action = "deploy"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$K8sDir = Join-Path $ProjectRoot "infrastructure\kubernetes"

function Write-Info { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Blue }
function Write-Success { param($Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Warn { param($Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Err { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."

    $missing = @()

    if (-not (Get-Command minikube -ErrorAction SilentlyContinue)) { $missing += "minikube" }
    if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) { $missing += "kubectl" }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { $missing += "docker" }
    if (-not (Get-Command kustomize -ErrorAction SilentlyContinue)) { $missing += "kustomize" }

    if ($missing.Count -gt 0) {
        Write-Err "Missing required tools: $($missing -join ', ')"
        Write-Info "Please install the missing tools and try again."
        exit 1
    }

    Write-Success "All prerequisites installed"
}

function Start-MinikubeCluster {
    Write-Info "Checking Minikube status..."

    $status = minikube status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Info "Starting Minikube..."
        minikube start `
            --cpus=4 `
            --memory=8192 `
            --disk-size=20g `
            --driver=docker `
            --kubernetes-version=v1.28.0
        Write-Success "Minikube started"
    } else {
        Write-Success "Minikube already running"
    }

    # Configure Docker to use Minikube's Docker daemon
    Write-Info "Configuring Docker environment..."
    & minikube docker-env --shell powershell | Invoke-Expression
}

function Install-Strimzi {
    Write-Info "Installing Strimzi Kafka Operator..."

    $ns = kubectl get namespace strimzi-system 2>&1
    if ($LASTEXITCODE -eq 0) {
        $op = kubectl get deployment strimzi-cluster-operator -n strimzi-system 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Strimzi already installed"
            return
        }
    }

    # Create strimzi namespace
    kubectl create namespace strimzi-system --dry-run=client -o yaml | kubectl apply -f -

    # Install Strimzi operator
    kubectl apply -f "https://strimzi.io/install/latest?namespace=strimzi-system" -n strimzi-system

    # Wait for operator to be ready
    Write-Info "Waiting for Strimzi operator..."
    kubectl wait deployment/strimzi-cluster-operator `
        -n strimzi-system `
        --for=condition=available `
        --timeout=300s

    Write-Success "Strimzi installed"
}

function Build-Images {
    Write-Info "Building Docker images..."

    $services = @("chatbot", "task-service", "reminder-service", "recurrence-service", "audit-service")

    foreach ($service in $services) {
        Write-Info "Building $service..."
        $servicePath = Join-Path $ProjectRoot "services\$service"
        docker build -t "phase5/${service}:dev" $servicePath
    }

    Write-Success "All images built"
}

function Deploy-Infrastructure {
    Write-Info "Deploying infrastructure components..."

    # Create dev namespace
    $nsPath = Join-Path $K8sDir "overlays\dev\namespace.yaml"
    kubectl apply -f $nsPath

    # Deploy Kafka
    Write-Info "Deploying Kafka..."
    $kafkaPath = Join-Path $K8sDir "overlays\dev\kafka"
    kubectl apply -k $kafkaPath -n phase5-dev

    # Wait for Kafka to be ready (with timeout handling)
    Write-Info "Waiting for Kafka cluster (this may take a few minutes)..."
    try {
        kubectl wait kafka/phase5-kafka `
            -n phase5-dev `
            --for=condition=Ready `
            --timeout=600s
    } catch {
        Write-Warn "Kafka not ready yet, continuing anyway..."
    }

    # Deploy PostgreSQL instances
    Write-Info "Deploying PostgreSQL databases..."
    $pgPath = Join-Path $K8sDir "overlays\dev\postgres"
    kubectl apply -k $pgPath -n phase5-dev

    # Wait for databases
    $dbs = @("postgres-task", "postgres-reminder", "postgres-recurrence", "postgres-audit")
    foreach ($db in $dbs) {
        Write-Info "Waiting for $db..."
        try {
            kubectl wait statefulset/$db `
                -n phase5-dev `
                --for=jsonpath='{.status.readyReplicas}'=1 `
                --timeout=300s
        } catch {
            Write-Warn "$db not ready yet, continuing anyway..."
        }
    }

    # Deploy secrets
    $secretsPath = Join-Path $K8sDir "overlays\dev\secrets.yaml"
    kubectl apply -f $secretsPath -n phase5-dev

    Write-Success "Infrastructure deployed"
}

function Install-Dapr {
    Write-Info "Installing Dapr..."

    $ns = kubectl get namespace dapr-system 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Dapr already installed"
        return
    }

    # Check if dapr CLI is available
    if (Get-Command dapr -ErrorAction SilentlyContinue) {
        dapr init -k --wait
    } else {
        Write-Warn "Dapr CLI not found, installing via Helm..."
        helm repo add dapr https://dapr.github.io/helm-charts/
        helm repo update
        helm upgrade --install dapr dapr/dapr `
            --namespace dapr-system `
            --create-namespace `
            --wait
    }

    Write-Success "Dapr installed"
}

function Deploy-DaprComponents {
    Write-Info "Deploying Dapr components..."

    $component = @"
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
"@

    $component | kubectl apply -n phase5-dev -f -

    Write-Success "Dapr components deployed"
}

function Deploy-Services {
    Write-Info "Deploying Phase 5 services..."

    # Apply the dev overlay
    $overlayPath = Join-Path $K8sDir "overlays\dev"
    kubectl apply -k $overlayPath -n phase5-dev

    # Wait for deployments
    $deployments = @("chatbot", "task-service", "reminder-service", "recurrence-service", "audit-service")
    foreach ($deployment in $deployments) {
        Write-Info "Waiting for $deployment..."
        try {
            kubectl wait deployment/$deployment `
                -n phase5-dev `
                --for=condition=available `
                --timeout=300s
        } catch {
            Write-Warn "$deployment not ready yet..."
        }
    }

    Write-Success "Services deployed"
}

function Show-Status {
    Write-Info "Deployment status:"
    Write-Host ""

    Write-Host "=== Pods ===" -ForegroundColor Cyan
    kubectl get pods -n phase5-dev -o wide
    Write-Host ""

    Write-Host "=== Services ===" -ForegroundColor Cyan
    kubectl get services -n phase5-dev
    Write-Host ""

    Write-Host "=== StatefulSets ===" -ForegroundColor Cyan
    kubectl get statefulsets -n phase5-dev
    Write-Host ""

    Write-Info "Service URLs (use 'minikube service <name> -n phase5-dev' to access):"
    Write-Host "  - chatbot: minikube service chatbot -n phase5-dev"
    Write-Host "  - task-service: minikube service task-service -n phase5-dev"
}

function Remove-Deployment {
    Write-Info "Cleaning up Phase 5 deployment..."

    kubectl delete namespace phase5-dev --ignore-not-found=true

    Write-Success "Cleanup complete"
}

# Main execution
switch ($Action) {
    "deploy" {
        Test-Prerequisites
        Start-MinikubeCluster
        Install-Strimzi
        Install-Dapr
        Build-Images
        Deploy-Infrastructure
        Deploy-DaprComponents
        Deploy-Services
        Show-Status
        Write-Success "Phase 5 local deployment complete!"
    }
    "cleanup" {
        Remove-Deployment
    }
    "status" {
        Show-Status
    }
    "build" {
        Test-Prerequisites
        & minikube docker-env --shell powershell | Invoke-Expression
        Build-Images
    }
    default {
        Write-Host "Usage: .\deploy-local.ps1 {deploy|cleanup|status|build}"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  deploy  - Full deployment of Phase 5 to Minikube"
        Write-Host "  cleanup - Remove Phase 5 from Minikube"
        Write-Host "  status  - Show current deployment status"
        Write-Host "  build   - Build Docker images only"
        exit 1
    }
}
