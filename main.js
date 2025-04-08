import { createConstantFPSGameLoop } from './utils/createConstantFPSGameLoop.js';
import { getDeltaTime } from './utils/deltaTime.js';
import { Battle } from './classes/Battle.js';
import { resizeCanvas } from './utils/resizeCanvas.js';
import { drawFPS } from './utils/fpsDisplay.js';

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
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  soldiers.forEach(soldier => {
    if (soldier.isAlive) {
      renderSoldier(ctx, soldier);
    }
  });
}

function renderSoldier(ctx, soldier) {
  ctx.fillStyle = soldier.color;

  if (soldier.type === 'melee') {
    // Draw circle for melee
    ctx.beginPath();
    ctx.arc(soldier.x, soldier.y, soldier.size, 0, Math.PI * 2);
    ctx.fill();
  } else if (soldier.type === 'archer') {
    // Draw triangle for archer
    ctx.beginPath();
    ctx.moveTo(soldier.x, soldier.y - soldier.size);
    ctx.lineTo(soldier.x - soldier.size, soldier.y + soldier.size);
    ctx.lineTo(soldier.x + soldier.size, soldier.y + soldier.size);
    ctx.closePath();
    ctx.fill();
  } else if (soldier.type === 'healer') {
    // Draw plus for healer
    const size = soldier.size;
    ctx.fillRect(soldier.x - size / 4, soldier.y - size, size / 2, size * 2);
    ctx.fillRect(soldier.x - size, soldier.y - size / 4, size * 2, size / 2);
  }

  // Draw health bar (unchanged)
  const healthPercentage = soldier.health / soldier.maxHealth;
  ctx.fillStyle = healthPercentage > 0.6 ? 'lime' : 
                  healthPercentage > 0.3 ? 'yellow' : 'red';

  const barWidth = soldier.size * 2;
  const barHeight = 2;

  ctx.fillRect(
    soldier.x - barWidth / 2,
    soldier.y - soldier.size - 5,
    barWidth * healthPercentage,
    barHeight
  );

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.strokeRect(
    soldier.x - barWidth / 2,
    soldier.y - soldier.size - 5,
    barWidth,
    barHeight
  );
}

function updateStats(stats) {
  let statsHTML = '<h3>Army Stats</h3>';
  stats.forEach(army => {
    statsHTML += `
      <div style="color:${army.color}">
        Army ${army.id}: ${army.aliveCount}/${army.soldierCount} (${army.percentage}%)
      </div>
    `;
  });
  dom.statsElement.innerHTML = statsHTML;
}

const draw = () =>{
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