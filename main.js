import { createConstantFPSGameLoop } from './utils/createConstantFPSGameLoop.js';
import { getDeltaTime } from './utils/deltaTime.js';
import { Battle } from './classes/Battle.js';
import { resizeCanvas } from './utils/resizeCanvas.js';
import { drawFPS } from './utils/fpsDisplay.js';

// Get DOM elements
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const dom = {
  armyCount: document.getElementById('armyCount'),
  soldiersPerArmy: document.getElementById('soldiersPerArmy'),
  startBtn: document.getElementById('startBtn'),
  resetBtn: document.getElementById('resetBtn'),
  battleSpeed: document.getElementById('battleSpeed'),
  statsElement: document.getElementById('stats')
};

window.addEventListener('load', () => {
  resizeCanvas({ canvasArray: [canvas] });
})

window.addEventListener('resize', () => {
  resizeCanvas({ canvasArray: [canvas] });
});

let lastStatsUpdate = 0;
const battle = new Battle();

dom.startBtn.addEventListener('click', () => {
  const armyCount = parseInt(dom.armyCount.value);
  const soldiersPerArmy = parseInt(dom.soldiersPerArmy.value);
  battle.start(armyCount, soldiersPerArmy);
});

dom.resetBtn.addEventListener('click', () => battle.reset());
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
  if (battle.soldiers.some(s => s.type === 'berserker' && s.isAlive)) {
    battle.drawBerserkerEffects(ctx);
  }
}

function updateStats(stats) {
  let statsHTML = `
    <div class="stats-header">
      <h3>Army Statistics</h3>
      <div class="battle-speed">Speed: ${battle.battleSpeed.toFixed(1)}x</div>
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
  
  // Add winner announcement if battle ended
  const aliveArmies = stats.filter(army => army.aliveCount > 0);
  if (aliveArmies.length === 1) {
    statsHTML += `
      <div class="victory-message" style="color:${aliveArmies[0].color}">
        Army ${aliveArmies[0].id} is victorious!
      </div>
    `;
  } else if (aliveArmies.length === 0 && stats.length > 0) {
    statsHTML += `
      <div class="victory-message">
        All armies have been defeated!
      </div>
    `;
  }
  
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

  // Optional: Add label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('BATTLE ARENA', centerX, centerY - halfSquareSize - 10);

  const deltaTime = getDeltaTime();
  
  battle.update(deltaTime);
  renderSoldiers(battle.soldiers);
  
  // Update stats periodically
  const now = Date.now();
  if (now - lastStatsUpdate > 250) {
    updateStats(battle.getStats());
    lastStatsUpdate = now;
  }

  drawFPS(canvas.width, canvas.height, ctx);
}

createConstantFPSGameLoop(60, draw);