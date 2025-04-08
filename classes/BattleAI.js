export class BattleAI {
  constructor(allSoldiers, armyId) {
    this.allSoldiers = allSoldiers;
    this.armyId = armyId;
    this.state = 'seek';
    this.currentTarget = null;
    this.lastDecisionTime = 0;
    this.decisionInterval = 0.5;
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
    const enemies = this.allSoldiers.filter(s => 
      s.isAlive && s.armyId !== this.armyId
    );
    
    if (enemies.length === 0) {
      this.state = 'idle';
      this.currentTarget = null;
      return;
    }
    
    let closestEnemy = null;
    let closestDistance = Infinity;
    
    for (const enemy of enemies) {
      const distance = soldier.distanceTo(enemy);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestEnemy = enemy;
      }
    }
    
    this.currentTarget = closestEnemy;
    
    if (closestDistance < soldier.attackRange) {
      this.state = 'attack';
    } else if (closestDistance < soldier.visionRange) {
      this.state = 'seek';
    } else {
      this.state = 'wander';
    }
    
    if (soldier.health < soldier.maxHealth * 0.3) {
      this.state = 'flee';
    }
  }

  executeBehavior(soldier, deltaTime) {
    switch (this.state) {
      case 'seek':
        if (this.currentTarget) {
          soldier.moveTowards(this.currentTarget.x, this.currentTarget.y, deltaTime);
        }
        break;
          
      case 'attack':
        if (this.currentTarget && soldier.distanceTo(this.currentTarget) <= soldier.attackRange) {
          soldier.attack(this.currentTarget);
        } else if (this.currentTarget) {
          soldier.moveTowards(this.currentTarget.x, this.currentTarget.y, deltaTime);
        }
        break;
          
      case 'flee':
        if (this.currentTarget) {
          const dx = soldier.x - this.currentTarget.x;
          const dy = soldier.y - this.currentTarget.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
      
          if (distance > 0) {
            const directionX = dx / distance;
            const directionY = dy / distance;
      
            // Move away from the enemy using moveTowards (with inverted target)
            const fleeTargetX = soldier.x + directionX * 100;
            const fleeTargetY = soldier.y + directionY * 100;
            soldier.moveTowards(fleeTargetX, fleeTargetY, deltaTime);
          }
        }
        break;
        
      case 'wander':
        if (Math.random() < 0.02) {
          this.wanderTarget = {
            x: soldier.x + (Math.random() - 0.5) * 100,
            y: soldier.y + (Math.random() - 0.5) * 100
          };
        }
        
        if (this.wanderTarget) {
          soldier.moveTowards(this.wanderTarget.x, this.wanderTarget.y, deltaTime);
        }
        break;
    }
  }
}