// client/src/lib/galaxy-catalog.ts
import { Body } from "./galaxy-schema";

export const BODIES: Body[] = [
  { id: "SOL", name: "Sol / Local Bubble", x_pc: 0, y_pc: 0, kind: "station" },
  { id: "ORI_OB1", name: "Orion OB1", x_pc: 400, y_pc: -120, kind: "ob-assoc" },
  { id: "VEL_OB2", name: "Vela OB2", x_pc: -160, y_pc: -280, kind: "ob-assoc" },
  { id: "BETEL", name: "Betelgeuse", x_pc: 197, y_pc: -31, kind: "star" },
  { id: "CAS_A", name: "Cassiopeia A (SNR)", x_pc: -1000, y_pc: 900, kind: "snr" },
  { id: "VELA_SNR", name: "Vela Supernova Remnant", x_pc: -290, y_pc: -250, kind: "snr" },
  { id: "RIGEL", name: "Rigel", x_pc: 260, y_pc: -86, kind: "star" },
  { id: "SIRIUS", name: "Sirius", x_pc: 2.6, y_pc: -8.6, kind: "star" },
  { id: "CANOPUS", name: "Canopus", x_pc: -95, y_pc: -310, kind: "star" },
  { id: "ALDEBARAN", name: "Aldebaran", x_pc: 20, y_pc: 65, kind: "star" },
  { id: "ANTARES", name: "Antares", x_pc: 170, y_pc: -550, kind: "star" },
  { id: "PROXIMA", name: "Proxima Centauri", x_pc: 1.3, y_pc: -1.2, kind: "star" },
];