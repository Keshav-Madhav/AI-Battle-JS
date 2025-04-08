import { Army } from './Army.js';
import { Soldier } from './Soldier.js';

export class Battle {
  constructor() {
    this.armies = [];
    this.soldiers = [];
    this.isRunning = false;
    this.battleSpeed = 1;
    this.lastUpdateTime = 0;
  }

  start(armyCount, soldiersPerArmy) {
    this.reset();
    this.createArmies(armyCount, soldiersPerArmy);
    this.isRunning = true;
  }

  reset() {
    this.armies = [];
    this.soldiers = [];
    this.isRunning = false;
  }

  createArmies(armyCount, soldiersPerArmy) {
    const colors = this.generateDistinctColors(armyCount);
    const angleStep = (Math.PI * 2) / armyCount;
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;
    const radius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.3;

    for (let i = 0; i < armyCount; i++) {
      const army = new Army(i, soldiersPerArmy, colors[i]);
      this.armies.push(army);

      const armyAngle = angleStep * i;
      const spawnX = centerX + Math.cos(armyAngle) * radius;
      const spawnY = centerY + Math.sin(armyAngle) * radius;

      this.createSoldiersForArmy(army, soldiersPerArmy, spawnX, spawnY);
    }
  }  

  createSoldiersForArmy(army, count, spawnX, spawnY) {
    const clusterRadius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.1;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * clusterRadius;
      const x = spawnX + Math.cos(angle) * distance;
      const y = spawnY + Math.sin(angle) * distance;

      const soldier = new Soldier(x, y, army.id, army.color, this.soldiers);
      this.soldiers.push(soldier);
    }
  }


  generateDistinctColors(count) {
    const colors = [];
    const hueStep = 360 / count;
    
    for (let i = 0; i < count; i++) {
      const hue = i * hueStep;
      colors.push(`hsl(${hue}, 100%, 50%)`);
    }
    
    return colors;
  }

  update(deltaTime) {
    if (!this.isRunning) return;
    
    deltaTime *= this.battleSpeed;
    
    this.soldiers.forEach(soldier => {
      if (soldier.isAlive) {
        soldier.update(deltaTime, this.soldiers);
      }
    });
    
    this.soldiers = this.soldiers.filter(soldier => soldier.isAlive);
    
    this.armies.forEach(army => {
      army.updateAliveCount(this.soldiers);
    });
    
    const aliveArmies = this.armies.filter(army => army.aliveCount > 0);
    if (aliveArmies.length === 1) {
      this.isRunning = false;
      console.log(`Army ${aliveArmies[0].id} wins!`);
    }
  }

  getStats() {
    return this.armies.map(army => {
      const percentage = (army.aliveCount / army.soldierCount * 100).toFixed(1);
      return {
        id: army.id,
        color: army.color,
        aliveCount: army.aliveCount,
        soldierCount: army.soldierCount,
        percentage
      };
    });
  }
}