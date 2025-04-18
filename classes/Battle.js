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
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.3;
  
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
      { type: 'melee', proportion: 0.5 },
      { type: 'healer', proportion: 0.1 },
      { type: 'archer', proportion: 0.2 },
      { type: 'berserker', proportion: 0.1 },
      { type: 'tank', proportion: 0.1 }
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
    
    // Distribute remaining soldiers to melee and berserkers
    for (let i = 0; i < remaining; i++) {
      typeCounts[(i % 2 === 0) ? 0 : 3].count++; // Alternate between melee and berserkers
    }
    
    // Calculate direction vectors to the center
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const dirX = centerX - spawnX;
    const dirY = centerY - spawnY;
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
    const normalizedDirX = dirX / dirLen;
    const normalizedDirY = dirY / dirLen;
    
    // Calculate perpendicular direction for columns
    const perpX = -normalizedDirY;
    const perpY = normalizedDirX;
    
    // Dynamic formation calculation
    const baseSpacing = 10;
    let spacing = baseSpacing;
    
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
    
    const healerRows = Math.ceil(typeCounts[1].count / cols);
    rowOffset += healerRows;
    
    // Place tanks in front of archers and healers
    this.placeSoldierGroup(
      typeCounts[4].count, 
      cols, 
      rowOffset, 
      spacing * 1.5, // Tanks are bigger so need more spacing
      spawnX, spawnY, 
      perpX, perpY, 
      normalizedDirX, normalizedDirY, 
      army, 
      'tank'
    );
    
    const tankRows = Math.ceil(typeCounts[4].count / cols);
    rowOffset += tankRows;
    
    // Place berserkers in front of melee
    this.placeSoldierGroup(
      typeCounts[3].count, 
      cols, 
      rowOffset, 
      spacing, 
      spawnX, spawnY, 
      perpX, perpY, 
      normalizedDirX, normalizedDirY, 
      army, 
      'berserker'
    );
    
    const berserkerRows = Math.ceil(typeCounts[3].count / cols);
    rowOffset += berserkerRows;
    
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
        // Calculate position in formation
        const colOffset = (col - cols / 2) * spacing;
        const rowPos = rowOffset + row;
        
        // Small random offset for more natural look, except for tanks which stay in strict formation
        const randomOffset = (type === 'berserker' && Math.random() < 0.7) ? 
          (Math.random() * spacing * 0.3 - spacing * 0.15) : 0;
        
        // Calculate final position
        const x = spawnX + perpX * (colOffset + randomOffset) + normalizedDirX * rowPos * spacing;
        const y = spawnY + perpY * (colOffset + randomOffset) + normalizedDirY * rowPos * spacing;
        
        const soldier = new Soldier(x, y, army.id, army.color, this.soldiers, type);
        
        // Face towards center
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        soldier.direction = Math.atan2(centerY - y, centerX - x);
        
        // Store original stats for berserkers
        if (type === 'berserker') {
          soldier.baseAttackDamage = soldier.attackDamage;
          soldier.baseSpeed = soldier.speed;
        }
        
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
    
    // Update berserker states
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
      const armySoldiers = this.soldiers.filter(s => s.armyId === army.id);
      const berserkers = armySoldiers.filter(s => s.type === 'berserker');
      const healers = armySoldiers.filter(s => s.type === 'healer');
      const archers = armySoldiers.filter(s => s.type === 'archer');
      const melee = armySoldiers.filter(s => s.type === 'melee');
      const tanks = armySoldiers.filter(s => s.type === 'tank');
      const enragedBerserkers = berserkers.filter(s => 
        s.health < s.maxHealth * s.berserkerRageThreshold
      );
      
      const percentage = (army.aliveCount / army.soldierCount * 100).toFixed(1);
      return {
        id: army.id,
        color: army.color,
        aliveCount: army.aliveCount,
        soldierCount: army.soldierCount,
        percentage,
        healerCount: healers.length,
        archerCount: archers.length,
        meleeCount: melee.length,
        tankCount: tanks.length,
        berserkerCount: berserkers.length,
        enragedBerserkers: enragedBerserkers.length,
      };
    });
  }
}