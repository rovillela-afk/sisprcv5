// src/data/dameplan.ts
// src/data/dameplan.ts

// GRANDES UNIDADES
export const GU_COEF: Record<string, [number, number]> = {
    "Bda Inf Bld (nossas)": [9.6, 13.2],
    "Bda Inf Bld (ini)":    [9.6, 13.2],
 
    "Bda Inf L (nossas)":   [3.0, 4.2],
    "Bda Inf L (ini)":      [3.0, 4.2],

    "Bda Inf Mec (nossas)": [5.8, 8.1],
    "Bda Inf Mec (ini)":    [5.8, 8.1],
  
    "Bda Inf Mtz (nossas)": [3.3, 4.5],
    "Bda Inf Mtz (ini)":    [3.3, 4.5],
  
    "Bda Inf Pqdt (nossas)": [3.3, 4.5],
    "Bda Inf Pqdt (ini)":    [3.3, 4.5],

    "Bda C Mec (nossas)":   [5.8, 8.1],
    "Bda C Mec (ini)":      [5.8, 8.1],

    "Bda C Bld (nossas)":   [9.6, 13.2],
    "Bda C Bld (ini)":      [9.6, 13.2],
  
    "Bda Inf Sl (nossas)": [3.3, 4.5],
    "Bda Inf Sl (ini)":    [3.3, 4.5],
  
    "Bda Inf Fron (nossas)": [3.3, 4.5],
    "Bda Inf Fron (ini)":    [3.3, 4.5],
  };

// UNIDADES
export const U_COEF: Record<string, [number, number]> = {
  // Infantaria
  "BIL (nossas)": [0.9, 1.4],
  "BIL (ini)":    [0.9, 1.4],

  "BI Mtz (nossas)": [1.1, 1.5],
  "BI Mtz (ini)":    [1.1, 1.5],

  "BI Pqdt (nossas)": [0.9, 1.4],
  "BI Pqdt (ini)":    [0.9, 1.4],

  "BIB (nossas)": [2.2, 3.1],
  "BIB (ini)":    [2.2, 3.1],

  "BI Mec (nossas)": [1.4, 1.8],
  "BI Mec (ini)":    [1.4, 1.8],

  "BIS (nossas)": [0.9, 1.4],
  "BIS (ini)":    [0.9, 1.4],

  "BI Fron (nossas)": [1.1, 1.5],
  "BI Fron (ini)":    [1.1, 1.5],

  // Cavalaria
  "RCC SR (nossas)": [2.1, 2.9],
  "RCC SR (ini)":    [2.1, 2.9],

  "RCC (nossas)": [2.6, 3.5],
  "RCC (ini)":    [2.6, 3.5],

  "RCB (nossas)": [2.4, 3.3],
  "RCB (ini)":    [2.4, 3.3],

  "RC Mec (nossas)": [1.7, 2.4],
  "RC Mec (ini)":    [1.7, 2.4],

  // Outros
  "Btl FN (nossas)": [1.4, 1.9],
  "Btl FN (ini)":    [1.4, 1.9],

  "Esqd Av Ex (HA-2) (nossas)": [4.0, 4.0],
  "Esqd Av Ex (HA-2) (ini)":    [4.0, 4.0],
};

// --- SUBUNIDADES (SU) — DAMEPLAN CE 5.80 ---
// Formato: "Nome (nossas|ini)": [Ofs, Def]
export const SU_COEF: Record<string, [number, number]> = {
  "Cia Fuz Bld (nossas)": [0.5, 0.7],
  "Cia Fuz Bld (ini)":    [0.5, 0.7],

  "Cia Fuz Mec (nossas)": [0.4, 0.5],
  "Cia Fuz Mec (ini)":    [0.4, 0.5],

  "Cia Fuz (nossas)":     [0.3, 0.4],
  "Cia Fuz (ini)":        [0.3, 0.4],

  "Esqd CC (nossas)":     [0.6, 0.8],
  "Esqd CC (ini)":        [0.6, 0.8],

  "Esqd C Mec (nossas)":  [0.5, 0.7],
  "Esqd C Mec (ini)":     [0.5, 0.7],

  "Esqd CC (SK-105) (FN) (nossas)": [0.6, 0.8],
  "Esqd CC (SK-105) (FN) (ini)":    [0.6, 0.8],

  "Esqd CC SR (nossas)":  [0.6, 0.8],
  "Esqd CC SR (ini)":     [0.6, 0.8],

  "Esqda Rec Atq (HA-1) (nossas)": [0.5, 0.5],
  "Esqda Rec Atq (HA-1) (ini)":    [0.5, 0.5],

  "Esqda Rec Atq (HA-2) (nossas)": [1.0, 1.0],
  "Esqda Rec Atq (HA-2) (ini)":    [1.0, 1.0],
};

// --- APOIO DE FOGO (APF) — DAMEPLAN CE 5.80 ---
// Formato: "Nome (nossas|ini)": valor
export const APF_COEF: Record<string, number> = {
  "GAC 155 AP (1) (nossas)": 3.9,
  "GAC 155 AP (1) (ini)":    3.9,

  "GAC 155 AP (nossas)": 2.8,
  "GAC 155 AP (ini)":    2.8,

  "GAC 155 AR (nossas)": 2.5,
  "GAC 155 AR (ini)":    2.5,

  "GAC 105 AP (nossas)": 2.0,
  "GAC 105 AP (ini)":    2.0,

  "GAC 105 (nossas)": 1.6,
  "GAC 105 (ini)":    1.6,

  "GAC LMF (nossas)": 8.0,
  "GAC LMF (ini)":    8.0,

  "GMF (nossas)": 12.0,
  "GMF (ini)":    12.0,

  "Bia 155 (nossas)": 0.8,
  "Bia 155 (ini)":    0.8,

  "Bia 105 (nossas)": 0.6,
  "Bia 105 (ini)":    0.6,

  "Bia LMF (nossas)": 2.5,
  "Bia LMF (ini)":    2.5,

  "Bia Mrt P (nossas)": 0.3,
  "Bia Mrt P (ini)":    0.3,
};