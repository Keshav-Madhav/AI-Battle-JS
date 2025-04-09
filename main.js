import { createConstantFPSGameLoop } from './utils/createConstantFPSGameLoop.js';
import { getDeltaTime } from './utils/deltaTime.js';
import { Battle } from './classes/Battle.js';
import { resizeCanvas } from './utils/resizeCanvas.js';
import { drawFPS } from './utils/fpsDisplay.js';
import { Soldier } from './classes/Soldier.js';
import { Army } from './classes/Army.js';

// Get DOM elements
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const dom = {
  armyCount: document.getElementById('armyCount'),
  soldiersPerArmy: document.getElementById('soldiersPerArmy'),
  startBtn: document.getElementById('startBtn'),
  resetBtn: document.getElementById('resetBtn'),
  battleSpeed: document.getElementById('battleSpeed'),
  statsElement: document.getElementById('stats'),
  armyBuilder: document.getElementById('armyBuilder'),
  colorButtons: document.querySelectorAll('.color-btn'),
  unitButtons: document.querySelectorAll('.unit-btn'),
  currentColor: document.getElementById('currentColor'),
  basicControls: document.querySelector('.basic-controls')
};

let selectedColor = '#ff5252';
let selectedUnit = 'melee';
let isBattleActive = false;
let isDrawing = false;
let lastDrawnPosition = { x: 0, y: 0 };
let armyIdCounter = 0;
let placedArmies = new Map();
let placedSoldiers = [];

window.addEventListener('load', () => {
  resizeCanvas({ canvasArray: [canvas] });
  setupArmyBuilderControls();
  setupCanvasDrawingControls();
});

window.addEventListener('resize', () => {
  resizeCanvas({ canvasArray: [canvas] });
});

function setupArmyBuilderControls() {
  dom.colorButtons[0].classList.add('selected');
  
  // Setup color selection
  dom.colorButtons.forEach(button => {
    button.addEventListener('click', () => {
      dom.colorButtons.forEach(btn => btn.classList.remove('selected'));
      button.classList.add('selected');
      
      selectedColor = button.getAttribute('data-color');
      dom.currentColor.style.backgroundColor = selectedColor;
    });
  });
  
  // Setup unit selection
  dom.unitButtons.forEach(button => {
    button.addEventListener('click', () => {
      dom.unitButtons.forEach(btn => btn.classList.remove('selected'));
      button.classList.add('selected');
      
      selectedUnit = button.getAttribute('data-unit');
    });
  });
}

function setupCanvasDrawingControls() {
  canvas.addEventListener('mousedown', (e) => {
    if (isBattleActive) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    isDrawing = true;
    lastDrawnPosition = { x, y };
    
    // Place a soldier at the initial position
    placeSoldier(x, y);
  });
  
  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || isBattleActive) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Calculate distance from last point
    const dx = x - lastDrawnPosition.x;
    const dy = y - lastDrawnPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const spacing = 10;
    if (distance >= spacing) {
      // Calculate number of points to fill the gap
      const numPoints = Math.floor(distance / spacing);
      
      for (let i = 1; i <= numPoints; i++) {
        const t = i / numPoints;
        const pointX = lastDrawnPosition.x + dx * t;
        const pointY = lastDrawnPosition.y + dy * t;
        
        placeSoldier(pointX, pointY);
      }
      
      lastDrawnPosition = { x, y };
    }
  });
  
  canvas.addEventListener('mouseup', () => {
    isDrawing = false;
    updateStats();
  });
  
  canvas.addEventListener('mouseleave', () => {
    isDrawing = false;
  });
}

function placeSoldier(x, y) {
  let armyId;
  if (placedArmies.has(selectedColor)) {
    armyId = placedArmies.get(selectedColor).id;
  } else {
    armyId = armyIdCounter++;
    const newArmy = new Army(armyId, 0, selectedColor);
    placedArmies.set(selectedColor, newArmy);
  }
  
  // Create soldier at the given position
  const soldier = new Soldier(x, y, armyId, selectedColor, placedSoldiers, selectedUnit);
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  soldier.direction = Math.atan2(centerY - y, centerX - x);
  
  if (selectedUnit === 'berserker') {
    soldier.baseAttackDamage = soldier.attackDamage;
    soldier.baseSpeed = soldier.speed;
  }
  
  placedSoldiers.push(soldier);
  
  const army = placedArmies.get(selectedColor);
  army.soldierCount++;
  army.aliveCount++;
}

function toggleArmyBuilder(show) {
  if (show) {
    dom.armyBuilder.classList.remove('hidden');
    dom.basicControls.classList.remove('hidden');
    isBattleActive = false;
  } else {
    dom.armyBuilder.classList.add('hidden');
    dom.basicControls.classList.add('hidden');
    isBattleActive = true;
  }
}

let lastStatsUpdate = 0;
const battle = new Battle();

dom.startBtn.addEventListener('click', () => {
  if (placedSoldiers.length === 0) {
    const armyCount = parseInt(dom.armyCount.value) || 2;
    const soldiersPerArmy = parseInt(dom.soldiersPerArmy.value) || 50;
    
    battle.start(armyCount, soldiersPerArmy);
  } else {
    // Transfer our placed soldiers to the battle
    battle.armies = Array.from(placedArmies.values());
    battle.soldiers = [...placedSoldiers];
  }
  
  battle.isRunning = true;
  toggleArmyBuilder(false);
});

dom.resetBtn.addEventListener('click', () => {
  // Clear all placed soldiers
  placedSoldiers = [];
  placedArmies = new Map();
  
  // Reset the battle
  battle.reset();
  toggleArmyBuilder(true);
});

dom.battleSpeed.addEventListener('input', (e) => {
  battle.battleSpeed = parseFloat(e.target.value);
});

function renderSoldiers(soldiers) {
  soldiers.forEach(soldier => {
    if (soldier.isAlive) {
      soldier.drawSoldier(ctx);
    }
  });
  
  // Draw berserker effects after all soldiers for proper layering
  if (soldiers.some(s => s.type === 'berserker' && s.isAlive)) {
    battle.drawBerserkerEffects(ctx);
  }
}

function updateStats() {
  if (isBattleActive) {
    // Use battle's stats during active battle
    const stats = battle.getStats();
    renderStats(stats);
  } else {
    // Otherwise show placed armies stats
    const placementStats = Array.from(placedArmies.values()).map(army => {
      const armySoldiers = placedSoldiers.filter(s => s.armyId === army.id);
      
      return {
        id: army.id,
        color: army.color,
        aliveCount: armySoldiers.length,
        soldierCount: armySoldiers.length,
        percentage: 100,
        healerCount: armySoldiers.filter(s => s.type === 'healer').length,
        archerCount: armySoldiers.filter(s => s.type === 'archer').length,
        meleeCount: armySoldiers.filter(s => s.type === 'melee').length,
        tankCount: armySoldiers.filter(s => s.type === 'tank').length,
        berserkerCount: armySoldiers.filter(s => s.type === 'berserker').length,
        enragedBerserkers: 0
      };
    });
    
    renderStats(placementStats);
  }
}


function renderStats(stats) {
  let statsHTML = `
    <div class="stats-header">
      <h3>Army Statistics</h3>
      ${isBattleActive ? `<div class="battle-speed">Speed: ${battle.battleSpeed.toFixed(1)}x</div>` : ''}
    </div>
    <div class="army-stats-container">
  `;
  
  stats.forEach(army => {
    const isDefeated = army.aliveCount === 0;
    const armyClass = isDefeated ? 'army-defeated' : '';
    
    statsHTML += `
      <div class="army-stat ${armyClass}" style="border-left: 4px solid ${army.color}">
        <div class="army-header">
          <span class="army-title" style="color:${army.color}">Army ${army.id}</span>

          <div class="army-numbers">
            <div class="soldier-count">
              <span class="count">${army.aliveCount}</span>
              <span class="total"> / ${army.soldierCount}</span>
              <span class="percentage"> (${army.percentage}%)</span>
            </div>
          </div>
        </div>

        <div class="unit-type">
          <span class="unit-label">Melee:</span>
          <span class="unit-count">${army.meleeCount}</span>
        </div>

        <div class="unit-type">
          <span class="unit-label">Healers:</span>
          <span class="unit-count">${army.healerCount}</span>
        </div>

        <div class="unit-type">
          <span class="unit-label">Archers:</span>
          <span class="unit-count">${army.archerCount}</span>
        </div>

        <div class="unit-type">
          <span class="unit-label">Tanks:</span>
          <span class="unit-count">${army.tankCount}</span>
        </div>
        
        <div class="special-units">
          <div class="unit-type">
            <span class="unit-label">Berserkers:</span>
            <span class="unit-count">${army.berserkerCount}</span>
          </div>
          <div class="unit-type">
            <span class="unit-label">Enraged:</span>
            <span class="unit-count ${army.enragedBerserkers > 0 ? 'enraged' : ''}">
              ${army.enragedBerserkers}
            </span>
          </div>
        </div>
        
        <div class="health-bar-container">
          <div class="health-bar" style="width: ${army.percentage}%; background: ${army.color}"></div>
        </div>
      </div>
    `;
  });
  
  statsHTML += `</div>`; // Close container

  dom.statsElement.innerHTML = statsHTML;
}

const draw = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw the fight area border
  const canvasSize = Math.min(canvas.width, canvas.height);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const halfSquareSize = canvasSize / 2;
  const padding = 20 - 4; // -4 to account for soldier size

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(centerX - halfSquareSize + padding, centerY - halfSquareSize + padding, canvasSize - padding * 2, canvasSize - padding * 2);
  ctx.setLineDash([]);

  // Draw label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('BATTLE ARENA', centerX, centerY - halfSquareSize - 10);

  const deltaTime = getDeltaTime();
  
  if (isBattleActive) {
    battle.update(deltaTime);
    renderSoldiers(battle.soldiers);
    
    // Update stats periodically
    const now = Date.now();
    if (now - lastStatsUpdate > 250) {
      updateStats();
      lastStatsUpdate = now;
    }
  } else {
    renderSoldiers(placedSoldiers);
  }

  drawFPS(canvas.width, canvas.height, ctx);
}

createConstantFPSGameLoop(60, draw);