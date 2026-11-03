#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="weather-monitoring-system:latest"
NAMESPACE="weather-system"
KEDA_VERSION="2.15.1"

echo "============================================================"
echo "🚀 Deploying Weather Telemetry Monitoring System to K3s"
echo "============================================================"

# 1. Build the monorepo Docker image
echo ""
echo "📦 [1/5] Building production Docker image (${IMAGE_NAME})..."
docker build -t "${IMAGE_NAME}" .

# 2. Import image into K3s containerd (if k3s is installed on this host)
if command -v k3s >/dev/null 2>&1; then
  echo ""
  echo "📥 [2/5] Importing ${IMAGE_NAME} into K3s containerd runtime..."
  docker save "${IMAGE_NAME}" | sudo k3s ctr images import -
else
  echo ""
  echo "ℹ️  [2/5] 'k3s' binary not found on PATH; skipping 'k3s ctr images import'."
  echo "    (If using kind/minikube, run: kind load docker-image ${IMAGE_NAME} or minikube image load ${IMAGE_NAME})"
fi

# 3. Ensure KEDA is installed in the cluster
echo ""
echo "⚡ [3/5] Checking KEDA operator installation..."
if ! kubectl get crd scaledobjects.keda.sh >/dev/null 2>&1; then
  echo "   Installing KEDA v${KEDA_VERSION}..."
  kubectl apply --server-side -f "https://github.com/kedacore/keda/releases/download/v${KEDA_VERSION}/keda-${KEDA_VERSION}.yaml"
  echo "   Waiting for KEDA operator to become ready..."
  kubectl wait --for=condition=available --timeout=120s deployment/keda-operator -n keda
else
  echo "   ✅ KEDA CRD already installed."
fi

# 4. Apply Namespace, ConfigMaps, Secrets & Stateful Infrastructure
echo ""
echo "🗄️  [4/5] Deploying Namespace, Configs, RabbitMQ, TimescaleDB & Redis..."
kubectl apply -f k8s/00-namespace-and-config.yaml
kubectl apply -f k8s/01-infrastructure.yaml

echo "   Waiting for stateful backing services (RabbitMQ, TimescaleDB, Redis) to be ready..."
kubectl rollout status deployment/rabbitmq -n "${NAMESPACE}" --timeout=120s
kubectl rollout status statefulset/timescaledb -n "${NAMESPACE}" --timeout=120s
kubectl rollout status deployment/redis -n "${NAMESPACE}" --timeout=60s

# 5. Deploy the 4 NestJS Microservices + HPA & KEDA Autoscalers
echo ""
echo "🌐 [5/5] Deploying Microservices, HPA & KEDA ScaledObject..."
kubectl apply -f k8s/02-microservices.yaml
kubectl apply -f k8s/autoscaling/hpa-ingestion.yaml
kubectl apply -f k8s/autoscaling/keda-processing-scaledobject.yaml

echo ""
echo "============================================================"
echo "✅ Deployment Complete! Current cluster status in '${NAMESPACE}':"
echo "============================================================"
kubectl get pods,svc,hpa,scaledobject -n "${NAMESPACE}"
