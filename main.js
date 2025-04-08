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
  soldiers.forEach(soldier => {
    if (soldier.isAlive) {
      soldier.drawSoldier(ctx);
    }
  });
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);

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