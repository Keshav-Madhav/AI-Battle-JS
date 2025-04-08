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
  
    // Check if any melee is targeting this archer
    if (soldier.type === 'archer') {
      const pursuingMelee = enemies.find(e => e.type === 'melee' && e.currentTarget === soldier);
      if (pursuingMelee) {
        this.currentTarget = pursuingMelee;
        this.state = 'shoot-flee';
        return;
      }
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
      this.broadcastTarget(soldier, this.currentTarget);
    } else if (distance <= soldier.visionRange) {
      this.state = 'seek';
      this.broadcastTarget(soldier, this.currentTarget);
    } else {
      this.state = 'wander';
    }
  }  

  executeBehavior(soldier, deltaTime) {
    switch (this.state) {
      case 'heal':
        if (this.currentTarget && this.currentTarget.isAlive) {
          const distance = soldier.distanceTo(this.currentTarget);
          if (distance <= soldier.healingRange) {
            this.currentTarget.health = Math.min(
              this.currentTarget.maxHealth,
              this.currentTarget.health + soldier.healAmount
            );
          } else {
            soldier.moveTowards(this.currentTarget.x, this.currentTarget.y, deltaTime);
          }
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

      case 'shoot-flee':
        if (this.currentTarget && this.currentTarget.isAlive) {
          const distance = soldier.distanceTo(this.currentTarget);
          const halfSpeed = soldier.speed * 0.5;
          const halfCooldown = soldier.attackCooldown * 2; // reduce firerate

          if (distance <= soldier.attackRange) {
            if (!soldier.lastAttackTime) soldier.lastAttackTime = 0;
            soldier.lastAttackTime += deltaTime;
            if (soldier.lastAttackTime >= halfCooldown) {
              soldier.attack(this.currentTarget);
              soldier.lastAttackTime = 0;
            }
          }

          // Move away while shooting
          const dx = soldier.x - this.currentTarget.x;
          const dy = soldier.y - this.currentTarget.y;
          const mag = Math.sqrt(dx * dx + dy * dy);
          const fleeX = soldier.x + (dx / mag) * 100;
          const fleeY = soldier.y + (dy / mag) * 100;
          soldier.moveTowards(fleeX, fleeY, deltaTime * 0.5); // half speed
        }
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
  
    // Seek nearby healers if any
    const nearbyHealers = nearbyAllies.filter(ally => ally.type === 'healer');
    if (nearbyHealers.length > 0) {
      const closestHealer = nearbyHealers.reduce((closest, healer) => {
        const dist = soldier.distanceTo(healer);
        return dist < closest.dist ? { healer, dist } : closest;
      }, { healer: null, dist: Infinity });

      if (closestHealer && closestHealer.dist > closestHealer.healer.healingRange - 5) {
        soldier.moveTowards(closestHealer.healer.x, closestHealer.healer.y, deltaTime);
        return;
      } else {
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

  broadcastTarget(soldier, target) {
    const baseAlertRange = 120;
    const alertRange = soldier.type === 'archer' ? baseAlertRange * 1.8 : baseAlertRange;
  
    const nearbyAllies = this.allSoldiers.filter(s =>
      s !== soldier &&
      s.isAlive &&
      s.armyId === soldier.armyId &&
      soldier.distanceTo(s) <= alertRange
    );
  
    for (const ally of nearbyAllies) {
      if (!ally.ai || ally.ai.state === 'flee' || ally.ai.state === 'heal') continue;
  
      const isArcher = ally.type === 'archer';
      const isIdleOrWandering = ally.ai.state === 'wander' || ally.ai.state === 'idle';
      const shouldUpdate =
        !ally.ai.currentTarget || isIdleOrWandering || isArcher;
  
      if (shouldUpdate) {
        ally.ai.currentTarget = target;
        const dist = ally.distanceTo(target);
        ally.ai.state = dist <= ally.attackRange ? 'attack'
                       : dist <= ally.visionRange ? 'seek'
                       : 'wander';
      }
    }
  }  
}
