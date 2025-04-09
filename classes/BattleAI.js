export class BattleAI {
  constructor(allSoldiers, armyId) {
    this.allSoldiers = allSoldiers;
    this.armyId = armyId;
    this.state = 'seek';
    this.currentTarget = null;
    this.lastDecisionTime = 0;
    this.decisionInterval = 0.4;
    this.wanderTarget = null;
    this.protectionAssignment = null; // For tanks - keeps track of who they're protecting
    this.protectionStickiness = 0; // Makes tanks stick to their protection target longer
  }

  update(soldier, deltaTime, allSoldiers) {
    this.allSoldiers = allSoldiers;
    this.lastDecisionTime += deltaTime;

    if (this.lastDecisionTime >= this.decisionInterval) {
      this.makeDecision(soldier, deltaTime);
      this.lastDecisionTime = 0;
    }

    this.executeBehavior(soldier, deltaTime);
  }

  makeDecision(soldier, deltaTime) {
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

    if (soldier.type === 'berserker') {
      // If health is critical (<20%), attack ANYONE including allies
      const targets = soldier.health < soldier.maxHealth * 0.2 ? 
        [...enemies, ...allies] : 
        enemies;
        
      if (targets.length > 0) {
        this.currentTarget = targets.reduce((closest, target) => {
          const dist = soldier.distanceTo(target);
          return dist < closest.dist ? { target, dist } : closest;
        }, { target: null, dist: Infinity }).target;
        
        const distance = soldier.distanceTo(this.currentTarget);
        if (distance <= soldier.attackRange) {
          this.state = 'attack';
        } else if (distance <= (soldier.health < soldier.maxHealth * 0.2 ? soldier.visionRange * 2 : soldier.visionRange)) {
          this.state = 'seek';
        } else {
          this.state = 'wander';
        }
        return;
      }
    }

    if (soldier.type === 'tank') {
      // Only consider archers and healers for protection
      const protectableAllies = allies.filter(ally => 
        (ally.type === 'archer' || ally.type === 'healer') && ally.isAlive
      );

      // Get all tanks in our army (including this one)
      const allTanks = this.allSoldiers.filter(s => 
        s.isAlive && s.armyId === this.armyId && s.type === 'tank'
      );
      
      // Find which allies are already being protected by other tanks
      const protectedAlliesMap = new Map();
      
      allTanks.forEach(tank => {
        if (tank !== soldier && tank.ai?.protectionAssignment) {
          const protectedAlly = tank.ai.protectionAssignment;
          
          if (!protectedAlliesMap.has(protectedAlly.id)) {
            protectedAlliesMap.set(protectedAlly.id, []);
          }
          
          protectedAlliesMap.get(protectedAlly.id).push(tank);
        }
      });

      // If we have a current protection assignment, check if it's still valid
      if (this.protectionAssignment && this.protectionAssignment.isAlive) {
        const currentAssignment = this.protectionAssignment;
        const isStillProtectable = protectableAllies.includes(currentAssignment);
        
        // Check how many tanks are protecting this target 
        const protectorsCount = protectedAlliesMap.has(currentAssignment.id) ? 
          protectedAlliesMap.get(currentAssignment.id).length : 0;
          
        // If there are too many tanks on this target and stickiness is expired, find a new target
        const tooManyProtectors = protectorsCount >= 2;
        
        // Only reconsider protection assignment if stickiness timer is up or assignment is invalid
        if ((this.protectionStickiness <= 0 && tooManyProtectors) || !isStillProtectable) {
          this.protectionAssignment = null;
        } else {
          this.protectionStickiness -= deltaTime;
        }
      }

      // Find new protection assignment if needed
      if (!this.protectionAssignment && protectableAllies.length > 0) {
        // Calculate threat and protection scores for each ally
        const allyScores = protectableAllies.map(ally => {
          // Calculate threat level based on proximity to enemies
          const closestEnemyDist = Math.min(
            ...enemies.map(enemy => enemy.distanceTo(ally)),
            Infinity
          );
          
          // How many tanks are already protecting this ally
          const currentProtectors = protectedAlliesMap.has(ally.id) ? 
            protectedAlliesMap.get(ally.id).length : 0;
          
          // Calculate protection score (higher = needs more protection)
          // Prioritize allies with fewer protectors
          const protectionPenalty = currentProtectors * 50;
          
          // Prioritize healers slightly more than archers
          const typePriority = ally.type === 'healer' ? 20 : 0;
          
          // Lower health allies need more protection
          const healthFactor = (1 - (ally.health / ally.maxHealth)) * 40;
          
          // Closer enemies = more threat
          const threatScore = 500 - closestEnemyDist;
          
          // Final score calculation
          const protectionScore = threatScore + typePriority + healthFactor - protectionPenalty;
          
          return { ally, protectionScore, currentProtectors };
        });
        
        // Sort by protection score (highest first)
        allyScores.sort((a, b) => b.protectionScore - a.protectionScore);
        
        // Choose the ally with highest protection score who doesn't already have too many protectors
        const bestMatch = allyScores.find(entry => entry.currentProtectors < 2) || allyScores[0];
        
        if (bestMatch) {
          this.protectionAssignment = bestMatch.ally;
          
          // Set stickiness timer (2-4 seconds)
          this.protectionStickiness = 2 + Math.random() * 2;
        }
      }

      // If we have a protection assignment, focus on protecting them
      if (this.protectionAssignment) {
        const ally = this.protectionAssignment;
        const enemiesThreateningAlly = enemies.filter(enemy => 
          enemy.distanceTo(ally) < enemy.attackRange * 1.5
        );

        // If there are immediate threats to our protected ally
        if (enemiesThreateningAlly.length > 0) {
          // Target the closest threat to our protected ally
          this.currentTarget = enemiesThreateningAlly.reduce((closest, enemy) => 
            enemy.distanceTo(ally) < closest.dist ? 
            { enemy, dist: enemy.distanceTo(ally) } : 
            closest
          , { enemy: null, dist: Infinity }).enemy;

          const distanceToTarget = soldier.distanceTo(this.currentTarget);
          
          if (distanceToTarget <= soldier.attackRange) {
            this.state = 'attack';
          } else {
            this.state = 'protect';
          }
          return;
        }

        // No immediate threats, guard the ally
        this.state = 'guard';
        this.currentTarget = null;
        return;
      }

      // No protectable allies left - act as melee
      this.currentTarget = enemies.reduce((closest, enemy) => {
        const dist = soldier.distanceTo(enemy);
        return dist < closest.dist ? { enemy, dist } : closest;
      }, { enemy: null, dist: Infinity }).enemy;

      const distance = soldier.distanceTo(this.currentTarget);
      if (distance <= soldier.attackRange) {
        this.state = 'attack';
      } else {
        this.state = 'seek';
      }
      return;
    }
  
    // Default behavior for other soldier types
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
        const healableAllies = this.allSoldiers.filter(ally =>
          ally.isAlive &&
          ally.armyId === soldier.armyId &&
          ally !== soldier &&
          ally.health < ally.maxHealth &&
          soldier.distanceTo(ally) <= soldier.healingRange
        );

        if (healableAllies.length > 0) {
          for (const ally of healableAllies) {
            soldier.heal(ally);
          }
        } else if (this.currentTarget && this.currentTarget.isAlive) {
          soldier.moveTowards(this.currentTarget.x, this.currentTarget.y, deltaTime);
        } else {
          const woundedAllies = this.allSoldiers.filter(ally =>
            ally.isAlive &&
            ally.armyId === soldier.armyId &&
            ally !== soldier &&
            ally.health < ally.maxHealth
          );

          if (woundedAllies.length > 0) {
            const closest = woundedAllies.reduce((a, b) =>
              soldier.distanceTo(a) < soldier.distanceTo(b) ? a : b
            );
            this.currentTarget = closest;
            soldier.moveTowards(closest.x, closest.y, deltaTime);
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
            if (soldier.type === 'berserker') {
              // Berserker special attack - damage all in range
              const allInRange = this.allSoldiers.filter(s => 
                s.isAlive && 
                soldier.distanceTo(s) <= soldier.attackRange
              );
              
              for (const target of allInRange) {
                // If health is critical (<20%), attack everyone
                if (soldier.health < soldier.maxHealth * 0.2) {
                  target.takeDamage(soldier.attackDamage);
                } 
                // Otherwise just attack enemies
                else if (target.armyId !== soldier.armyId) {
                  target.takeDamage(soldier.attackDamage);
                }
              }
            } else {
              soldier.attack(this.currentTarget);
            }
          } else {
            // Berserker charges faster when low health
            const speedMultiplier = (soldier.type === 'berserker' && soldier.health < soldier.maxHealth * 0.2) ? 1.5 : 1;
            soldier.moveTowards(this.currentTarget.x, this.currentTarget.y, deltaTime * speedMultiplier);
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

      case 'protect':
        if (this.currentTarget && this.protectionAssignment) {
          // Position between the threat and our protected ally
          const ally = this.protectionAssignment;
          const angle = Math.atan2(
            ally.y - this.currentTarget.y,
            ally.x - this.currentTarget.x
          );
          
          // Position slightly closer to the ally than the enemy
          const protectDistance = 30;
          const protectX = this.currentTarget.x + Math.cos(angle) * protectDistance;
          const protectY = this.currentTarget.y + Math.sin(angle) * protectDistance;
          
          if (soldier.distanceTo({x: protectX, y: protectY}) > 10) {
            soldier.moveTowards(protectX, protectY, deltaTime);
          } else {
            // If in position, attack the threat
            const distance = soldier.distanceTo(this.currentTarget);
            if (distance <= soldier.attackRange) {
              this.state = 'attack';
            }
          }
        }
        break;

      case 'guard':
        if (this.protectionAssignment && this.protectionAssignment.isAlive) {
          const ally = this.protectionAssignment;
          const guardDistance = 35;
          
          // Find position between ally and nearest enemy
          const nearestEnemy = this.allSoldiers
            .filter(s => s.isAlive && s.armyId !== this.armyId)
            .reduce((nearest, enemy) => 
              enemy.distanceTo(ally) < nearest.dist ? 
              { enemy, dist: enemy.distanceTo(ally) } : 
              nearest
            , { enemy: null, dist: Infinity }).enemy;
          
          if (nearestEnemy) {
            const angle = Math.atan2(
              ally.y - nearestEnemy.y,
              ally.x - nearestEnemy.x
            );
            
            // Add some variation to each tank's guarding position by using the soldier's id
            // This prevents tanks from stacking on top of each other
            const tankId = soldier.id || Math.random();
            const angleOffset = (tankId % 10) / 10 * Math.PI * 0.5; // 0 to π/2 offset
            const adjustedAngle = angle + angleOffset;
            
            const guardX = ally.x + Math.cos(adjustedAngle) * guardDistance;
            const guardY = ally.y + Math.sin(adjustedAngle) * guardDistance;
            
            if (soldier.distanceTo({x: guardX, y: guardY}) > 10) {
              soldier.moveTowards(guardX, guardY, deltaTime);
            }
          } else {
            // No enemies nearby, just orbit the ally slowly
            const orbitDistance = 25;
            
            // Different starting angles for different tanks
            if (!this.guardAngle) {
              const tankId = soldier.id || Math.random();
              this.guardAngle = (tankId % 10) / 10 * Math.PI * 2; // 0 to 2π
            }
            
            this.guardAngle = (this.guardAngle || 0) + deltaTime * 0.3;
            const orbitX = ally.x + Math.cos(this.guardAngle) * orbitDistance;
            const orbitY = ally.y + Math.sin(this.guardAngle) * orbitDistance;
            soldier.moveTowards(orbitX, orbitY, deltaTime * 0.7);
          }
          
          // Taunt nearby enemies
          const enemiesInRange = this.allSoldiers.filter(s => 
            s.isAlive && 
            s.armyId !== this.armyId &&
            soldier.distanceTo(s) < soldier.tauntRange
          );
          
          for (const enemy of enemiesInRange) {
            // Higher chance to taunt enemies targeting our protected ally
            if (enemy.ai?.currentTarget === this.protectionAssignment || Math.random() < 0.4) {
              enemy.ai.currentTarget = soldier;
            }
          }
        } else {
          // Lost our protection assignment
          this.protectionAssignment = null;
          this.state = 'seek';
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