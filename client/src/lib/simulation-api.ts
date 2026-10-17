import { apiRequest } from "./queryClient";
import { SimulationParameters, SimulationResult } from "@shared/schema";

export async function createSimulation(parameters: SimulationParameters): Promise<SimulationResult> {
  const response = await apiRequest("POST", "/api/simulations", parameters);
  return response.json();
}

export async function startSimulation(id: string): Promise<void> {
  await apiRequest("POST", `/api/simulations/${id}/start`);
}

export async function generateScuffgeo(id: string): Promise<string> {
  const response = await apiRequest("POST", `/api/simulations/${id}/generate`);
  return response.text();
}

export async function downloadFile(simulationId: string, fileId: string): Promise<Blob> {
  const response = await apiRequest("GET", `/api/simulations/${simulationId}/files/${fileId}`);
  return response.blob();
}

export async function downloadAllFiles(simulationId: string): Promise<Blob> {
  const response = await apiRequest("GET", `/api/simulations/${simulationId}/download`);
  return response.blob();
}

export function createWebSocketConnection(simulationId: string): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws?simulationId=${encodeURIComponent(simulationId)}`;
  return new WebSocket(wsUrl);
}
