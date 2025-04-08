export class BattleAI {
  constructor(allSoldiers, armyId) {
    this.allSoldiers = allSoldiers;
    this.armyId = armyId;
    this.state = 'seek';
    this.currentTarget = null;
    this.lastDecisionTime = 0;
    this.decisionInterval = 0.4;
    this.wanderTarget = null;
  }

  update(soldier, deltaTime, allSoldiers) {
    this.allSoldiers = allSoldiers;
    this.lastDecisionTime += deltaTime;

    if (this.lastDecisionTime >= this.decisionInterval) {
      this.makeDecision(soldier);
      this.lastDecisionTime = 0;
    }

    this.executeBehavior(soldier, deltaTime);
  }

  makeDecision(soldier) {
    const enemies = this.allSoldiers.filter(s => s.isAlive && s.armyId !== this.armyId);
    const allies = this.allSoldiers.filter(s => s.isAlive && s.armyId === this.armyId && s !== soldier);

    if (soldier.type === 'healer') {
      const woundedAlly = allies.find(ally => ally.health < ally.maxHealth);
      if (woundedAlly) {
        this.state = 'heal';
        this.currentTarget = woundedAlly;
        return;
      }
    }

    if (enemies.length === 0) {
      this.state = 'idle';
      this.currentTarget = null;
      return;
    }

    // Prioritize closest and weakest enemy
    this.currentTarget = enemies.reduce((closest, enemy) => {
      const dist = soldier.distanceTo(enemy);
      const score = dist - (enemy.health * 0.5); // closer + lower health = better
      return score < closest.score ? { soldier: enemy, score } : closest;
    }, { soldier: null, score: Infinity }).soldier;

    const distance = soldier.distanceTo(this.currentTarget);
    if (soldier.health < soldier.maxHealth * 0.3) {
      this.state = 'flee';
    } else if (distance <= soldier.attackRange) {
      this.state = 'attack';
    } else if (distance <= soldier.visionRange) {
      this.state = 'seek';
    } else {
      this.state = 'wander';
    }
  }

  executeBehavior(soldier, deltaTime) {
    switch (this.state) {
      case 'heal':
        if (this.currentTarget && this.currentTarget.isAlive) {
          this.currentTarget.health = Math.min(
            this.currentTarget.maxHealth,
            this.currentTarget.health + soldier.healAmount
          );
        }
        break;

      case 'seek':
        if (this.currentTarget) {
          soldier.moveTowards(this.currentTarget.x, this.currentTarget.y, deltaTime);
        }
        break;

      case 'attack':
        if (this.currentTarget && this.currentTarget.isAlive) {
          const distance = soldier.distanceTo(this.currentTarget);
          if (distance <= soldier.attackRange) {
            soldier.attack(this.currentTarget);
          } else {
            soldier.moveTowards(this.currentTarget.x, this.currentTarget.y, deltaTime);
          }
        }
        break;

      case 'flee':
        this.fleeFromThreat(soldier, deltaTime);
        break;

      case 'wander':
        this.handleWandering(soldier, deltaTime);
        break;

      case 'idle':
      default:
        // do nothing
        break;
    }
  }

  fleeFromThreat(soldier, deltaTime) {
    const nearbyEnemies = this.allSoldiers.filter(
      s => s.isAlive && s.armyId !== soldier.armyId && soldier.distanceTo(s) < soldier.visionRange
    );
  
    const nearbyAllies = this.allSoldiers.filter(
      s => s !== soldier && s.isAlive && s.armyId === soldier.armyId &&
           soldier.distanceTo(s) < soldier.visionRange
    );
  
    // 🏥 Seek nearby healers if any
    const nearbyHealers = nearbyAllies.filter(ally => ally.type === 'healer');
    if (nearbyHealers.length > 0) {
      // Choose closest healer
      const closestHealer = nearbyHealers.reduce((closest, healer) => {
        const dist = soldier.distanceTo(healer);
        return dist < closest.dist ? { healer, dist } : closest;
      }, { healer: null, dist: Infinity }).healer;
  
      if (closestHealer) {
        soldier.moveTowards(closestHealer.x, closestHealer.y, deltaTime);
        return;
      }
    }
  
    // 👇 Rest of the flee logic continues if no healer found
    const chaserCount = nearbyEnemies.length;
    const allyFleeCount = nearbyAllies.filter(s => s.ai?.state === 'flee').length;
    const criticalHealth = soldier.maxHealth * 0.1;
  
    if (soldier.health <= criticalHealth && chaserCount >= 2) {
      let baseFlipChance = 0.3 + 0.1 * (chaserCount - 2);
      const allyPenalty = Math.min(allyFleeCount * 0.15, 0.5);
      const finalFlipChance = baseFlipChance * (1 - allyPenalty);
  
      if (Math.random() < finalFlipChance) {
        const willingChasers = nearbyEnemies.filter(e => Math.random() < 0.7);
        if (willingChasers.length > 0) {
          const newArmyId = willingChasers[0].armyId;
          soldier.armyId = newArmyId;
          soldier.color = willingChasers[0].color;
          soldier.ai.armyId = newArmyId;
  
          console.log(`🤝 Soldier flipped allegiance to Army ${newArmyId}`);
          this.state = 'seek';
          return;
        }
      }
    }
  
    const avgEnemyX = nearbyEnemies.reduce((sum, e) => sum + e.x, 0) / nearbyEnemies.length || soldier.x;
    const avgEnemyY = nearbyEnemies.reduce((sum, e) => sum + e.y, 0) / nearbyEnemies.length || soldier.y;
  
    const dx = soldier.x - avgEnemyX;
    const dy = soldier.y - avgEnemyY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const safeDist = 150;
  
    if (distance > safeDist) return;
  
    const fleeX = soldier.x + (dx / distance) * 100;
    const fleeY = soldier.y + (dy / distance) * 100;
    soldier.moveTowards(fleeX, fleeY, deltaTime);
  }   

  handleWandering(soldier, deltaTime) {
    if (!this.wanderTarget || Math.random() < 0.01) {
      const range = 75;
      const buffer = 20;
      this.wanderTarget = {
        x: Math.min(CANVAS_WIDTH - buffer, Math.max(buffer, soldier.x + (Math.random() - 0.5) * range)),
        y: Math.min(CANVAS_HEIGHT - buffer, Math.max(buffer, soldier.y + (Math.random() - 0.5) * range)),
      };
    }

    soldier.moveTowards(this.wanderTarget.x, this.wanderTarget.y, deltaTime);
  }
}
