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

      this.createSoldiersForArmy(army, soldiersPerArmy, spawnX, spawnY, armyAngle);
    }
  }  

  createSoldiersForArmy(army, count, spawnX, spawnY, armyAngle) {
    const soldierTypes = [
      { type: 'melee', proportion: 0.7 },
      { type: 'healer', proportion: 0.1 },
      { type: 'archer', proportion: 0.2 }
    ];
    
    // Calculate counts for each type
    const typeCounts = soldierTypes.map(typeInfo => {
      return {
        ...typeInfo,
        count: Math.floor(count * typeInfo.proportion)
      };
    });
    
    // Adjust for rounding errors
    let allocatedCount = typeCounts.reduce((sum, type) => sum + type.count, 0);
    let remaining = count - allocatedCount;
    
    // Distribute remaining soldiers
    for (let i = 0; i < remaining; i++) {
      typeCounts[i % typeCounts.length].count++;
    }
    
    // Calculate direction vectors to the center
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;
    const dirX = centerX - spawnX;
    const dirY = centerY - spawnY;
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
    const normalizedDirX = dirX / dirLen;
    const normalizedDirY = dirY / dirLen;
    
    // Calculate perpendicular direction for columns
    const perpX = -normalizedDirY;
    const perpY = normalizedDirX;
    
    // Dynamic formation calculation
    const baseSpacing = 10; // Base distance between soldiers
    let spacing = baseSpacing;
    
    // Adjust spacing based on army size
    if (count > 100) spacing = 10;
    if (count > 500) spacing = 5;
    if (count > 1000) spacing = 3;
    
    const formationWidth = Math.sqrt(count) * 1.5;
    let cols = Math.ceil(formationWidth);
    
    let rowOffset = 0;
    
    // Place archers in back rows
    this.placeSoldierGroup(
      typeCounts[2].count, 
      cols, 
      rowOffset, 
      spacing, 
      spawnX, spawnY, 
      perpX, perpY, 
      normalizedDirX, normalizedDirY, 
      army, 
      'archer'
    );
    
    // Calculate rows needed for archers
    const archerRows = Math.ceil(typeCounts[2].count / cols);
    rowOffset += archerRows;
    
    // Place healers in middle rows
    this.placeSoldierGroup(
      typeCounts[1].count, 
      cols, 
      rowOffset, 
      spacing, 
      spawnX, spawnY, 
      perpX, perpY, 
      normalizedDirX, normalizedDirY, 
      army, 
      'healer'
    );
    
    // Calculate rows needed for healers
    const healerRows = Math.ceil(typeCounts[1].count / cols);
    rowOffset += healerRows;
    
    // Place melee in front rows
    this.placeSoldierGroup(
      typeCounts[0].count, 
      cols, 
      rowOffset, 
      spacing, 
      spawnX, spawnY, 
      perpX, perpY, 
      normalizedDirX, normalizedDirY, 
      army, 
      'melee'
    );
  }
  
  placeSoldierGroup(count, cols, rowOffset, spacing, spawnX, spawnY, perpX, perpY, normalizedDirX, normalizedDirY, army, type) {
    let soldierCount = 0;
    let row = 0;
    
    while (soldierCount < count) {
      for (let col = 0; col < cols && soldierCount < count; col++) {
        const colOffset = (col - cols / 2) * spacing;
        const rowPos = rowOffset + row;
        
        const x = spawnX + perpX * colOffset + normalizedDirX * rowPos * spacing;
        const y = spawnY + perpY * colOffset + normalizedDirY * rowPos * spacing;
        
        const soldier = new Soldier(x, y, army.id, army.color, this.soldiers, type);
        
        // Set the direction the soldier is facing (toward center)
        const centerX = CANVAS_WIDTH / 2;
        const centerY = CANVAS_HEIGHT / 2;
        soldier.direction = Math.atan2(centerY - y, centerX - x);
        
        this.soldiers.push(soldier);
        soldierCount++;
      }
      row++;
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