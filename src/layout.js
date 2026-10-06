// Constantes de distribución del mapa (metros). Norte = -Z. El jugador avanza de sur a norte.

export const MAP = { cx: 0, cz: 3, size: 152 }; // área cubierta por el mapa de control del suelo

export const ROAD = { halfW: 4.5, zSouth: 76, zNorth: 16 };

// Recinto vallado de la base.
export const BASE = { x0: -46, x1: 46, z0: -62, z1: 16 };

export const WAREHOUSE = {
  x0: -24, x1: 16, z0: -58, z1: -34, // huella
  wallH: 8, ridgeH: 11.2,
  doorX0: -7, doorX1: 3, doorH: 5.4,
};

export const PARKING = { x0: -41, x1: -11, z0: -7, z1: 12, stall: 3.0 };

export const OFFICE = { x0: -31, x1: -13, z0: 31, z1: 45, h: 7.2 };

export const SPAWN = { x: 1.2, z: 66, yaw: 0 };

export const OBJECTIVE = { x: -4, z: -54.5 };

// Zonas de aparición por equipo en partidas en línea (centro, radio y orientación inicial).
// Esquinas opuestas del recinto, sin línea de visión entre ellas; cada equipo sale mirando al centro.
export const TEAM_SPAWN = [
  { x: -32.2, z: 9, r: 3, yaw: -0.85 }, // ALFA: aparcamiento (suroeste), entre los camiones
  { x: 39.5, z: -47, r: 4.5, yaw: 2.17 }, // BRAVO: esquina noreste, tras los contenedores
];
