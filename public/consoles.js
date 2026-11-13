/* MicDesk — catálogo das mesas digitais mais usadas (valores por defeito, editáveis depois)
   inputs = canais de entrada para mistura · buses = mix/aux · matrix = matrizes · mains = saídas principais
   bus/mtx = como cada marca chama os buses e as matrizes */
window.CONSOLES = [
  { brand: 'Behringer', models: [
    { model: 'WING', bus: 'Bus', mtx: 'Matrix', versions: [
      { v: 'WING (fullsize)', inputs: 48, buses: 16, matrix: 8, mains: ['Main 1', 'Main 2', 'Main 3', 'Main 4'], local: 8, note: '40 canais + 8 aux' },
      { v: 'WING Compact', inputs: 48, buses: 16, matrix: 8, mains: ['Main 1', 'Main 2', 'Main 3', 'Main 4'], local: 24, note: '40 canais + 8 aux' },
      { v: 'WING Rack', inputs: 48, buses: 16, matrix: 8, mains: ['Main 1', 'Main 2', 'Main 3', 'Main 4'], local: 24, note: '40 canais + 8 aux' },
    ] },
    { model: 'X32', bus: 'Bus', mtx: 'Matrix', versions: [
      { v: 'X32 (fullsize)', inputs: 40, buses: 16, matrix: 6, mains: ['Main LR', 'Mono/Centre'], local: 32, note: '32 canais + 8 aux' },
      { v: 'X32 Compact', inputs: 40, buses: 16, matrix: 6, mains: ['Main LR', 'Mono/Centre'], local: 16, note: '32 canais + 8 aux' },
      { v: 'X32 Producer', inputs: 40, buses: 16, matrix: 6, mains: ['Main LR', 'Mono/Centre'], local: 16, note: '32 canais + 8 aux' },
      { v: 'X32 Rack', inputs: 40, buses: 16, matrix: 6, mains: ['Main LR', 'Mono/Centre'], local: 16, note: '32 canais + 8 aux' },
    ] },
    { model: 'X Air', bus: 'Aux', mtx: 'Matrix', versions: [
      { v: 'XR18', inputs: 18, buses: 6, matrix: 0, mains: ['Main LR'], local: 16 },
    ] },
  ] },
  { brand: 'Midas', models: [
    { model: 'M32', bus: 'Bus', mtx: 'Matrix', versions: [
      { v: 'M32 / M32 Live', inputs: 40, buses: 16, matrix: 6, mains: ['Main LR', 'Mono/Centre'], local: 32, note: '32 canais + 8 aux' },
      { v: 'M32R / M32R Live', inputs: 40, buses: 16, matrix: 6, mains: ['Main LR', 'Mono/Centre'], local: 16, note: '32 canais + 8 aux' },
      { v: 'M32C', inputs: 40, buses: 16, matrix: 6, mains: ['Main LR', 'Mono/Centre'], local: 0, note: 'só via stagebox' },
    ] },
    { model: 'MR', bus: 'Aux', mtx: 'Matrix', versions: [
      { v: 'MR18', inputs: 18, buses: 6, matrix: 0, mains: ['Main LR'], local: 16 },
    ] },
  ] },
  { brand: 'Yamaha', models: [
    { model: 'DM7', bus: 'Mix', mtx: 'Matrix', versions: [
      { v: 'DM7', inputs: 120, buses: 48, matrix: 12, mains: ['Stereo A', 'Stereo B'], local: 32 },
      { v: 'DM7 Compact', inputs: 72, buses: 48, matrix: 12, mains: ['Stereo A', 'Stereo B'], local: 16 },
    ] },
    { model: 'DM3', bus: 'Mix', mtx: 'Matrix', versions: [
      { v: 'DM3 / DM3 Standard', inputs: 18, buses: 6, matrix: 2, mains: ['Stereo'], local: 16, note: '16 mono + 1 estéreo' },
    ] },
    { model: 'CL', bus: 'Mix', mtx: 'Matrix', versions: [
      { v: 'CL5', inputs: 80, buses: 24, matrix: 8, mains: ['Stereo', 'Mono'], local: 8, note: '72 mono + 8 estéreo' },
      { v: 'CL3', inputs: 72, buses: 24, matrix: 8, mains: ['Stereo', 'Mono'], local: 8, note: '64 mono + 8 estéreo' },
      { v: 'CL1', inputs: 56, buses: 24, matrix: 8, mains: ['Stereo', 'Mono'], local: 8, note: '48 mono + 8 estéreo' },
    ] },
    { model: 'QL', bus: 'Mix', mtx: 'Matrix', versions: [
      { v: 'QL5', inputs: 72, buses: 16, matrix: 8, mains: ['Stereo', 'Mono'], local: 32, note: '64 mono + 8 estéreo' },
      { v: 'QL1', inputs: 40, buses: 16, matrix: 8, mains: ['Stereo', 'Mono'], local: 16, note: '32 mono + 8 estéreo' },
    ] },
    { model: 'TF', bus: 'AUX', mtx: 'Matrix', versions: [
      { v: 'TF5', inputs: 48, buses: 20, matrix: 0, mains: ['Stereo', 'Sub'], local: 32, note: '40 mono + 2 estéreo + 2 returns' },
      { v: 'TF3', inputs: 48, buses: 20, matrix: 0, mains: ['Stereo', 'Sub'], local: 24, note: '40 mono + 2 estéreo + 2 returns' },
      { v: 'TF1', inputs: 40, buses: 20, matrix: 0, mains: ['Stereo', 'Sub'], local: 16, note: '32 mono + 2 estéreo + 2 returns' },
      { v: 'TF-Rack', inputs: 40, buses: 20, matrix: 0, mains: ['Stereo', 'Sub'], local: 16, note: '32 mono + 2 estéreo + 2 returns' },
    ] },
  ] },
  { brand: 'Allen & Heath', models: [
    { model: 'SQ', bus: 'Mix', mtx: 'Matrix', versions: [
      { v: 'SQ-5', inputs: 48, buses: 12, matrix: 3, mains: ['Main LR'], local: 16, note: '12 mixes estéreo + 3 matrizes estéreo' },
      { v: 'SQ-6', inputs: 48, buses: 12, matrix: 3, mains: ['Main LR'], local: 24, note: '12 mixes estéreo + 3 matrizes estéreo' },
      { v: 'SQ-7', inputs: 48, buses: 12, matrix: 3, mains: ['Main LR'], local: 32, note: '12 mixes estéreo + 3 matrizes estéreo' },
    ] },
    { model: 'Avantis', bus: 'Mix', mtx: 'Matrix', versions: [
      { v: 'Avantis / Avantis Solo', inputs: 64, buses: 24, matrix: 8, mains: ['Main LR'], local: 12, note: '42 buses configuráveis' },
    ] },
    { model: 'dLive', bus: 'Aux', mtx: 'Matrix', versions: [
      { v: 'dLive C1500 / C2500 / C3500', inputs: 128, buses: 32, matrix: 8, mains: ['Main LR'], local: 0, note: '64 buses configuráveis (MixRack)' },
      { v: 'dLive S5000 / S7000', inputs: 128, buses: 32, matrix: 8, mains: ['Main LR'], local: 0, note: '64 buses configuráveis (MixRack)' },
    ] },
  ] },
  { brand: 'DiGiCo', models: [
    { model: 'S-Series', bus: 'Aux', mtx: 'Matrix', versions: [
      { v: 'S21', inputs: 40, buses: 16, matrix: 8, mains: ['Master L/R', 'Mono'], local: 24 },
    ] },
    { model: 'SD / Quantum', bus: 'Aux', mtx: 'Matrix', versions: [
      { v: 'SD12', inputs: 72, buses: 36, matrix: 12, mains: ['Master L/R', 'Mono'], local: 0 },
      { v: 'Quantum 225', inputs: 72, buses: 36, matrix: 12, mains: ['Master L/R', 'Mono'], local: 0 },
    ] },
  ] },
  { brand: 'Soundcraft', models: [
    { model: 'Ui', bus: 'Aux', mtx: 'Matrix', versions: [
      { v: 'Ui24R', inputs: 24, buses: 10, matrix: 0, mains: ['Master L/R'], local: 20 },
    ] },
  ] },
];
