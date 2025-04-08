const dom = {
  canvas: document.getElementById('canvas'),
  startBtn: document.getElementById('startBtn'),
  resetBtn: document.getElementById('resetBtn'),
  battleSpeed: document.getElementById('battleSpeed'),
  armyCount: document.getElementById('armyCount'),
  soldiersPerArmy: document.getElementById('soldiersPerArmy'),
  statsElement: document.getElementById('stats')
};

const canvas = dom.canvas;
const ctx = canvas.getContext('2d');
const startBtn = dom.startBtn;
const resetBtn = dom.resetBtn;
const battleSpeed = dom.battleSpeed;
const armyCount = dom.armyCount;
const soldiersPerArmy = dom.soldiersPerArmy;
const statsElement = dom.statsElement;