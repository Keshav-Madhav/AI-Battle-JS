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
  
    // Archer shoot-flee logic when below 50% health
    if (soldier.type === 'archer' && soldier.health < soldier.maxHealth * 0.5) {
      const nearestEnemy = enemies.reduce((closest, enemy) => {
        const dist = soldier.distanceTo(enemy);
        return dist < closest.dist ? { enemy, dist } : closest;
      }, { enemy: null, dist: Infinity });

      if (nearestEnemy.enemy && nearestEnemy.dist <= soldier.visionRange) {
        this.currentTarget = nearestEnemy.enemy;
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
        } else if (distance <= (soldier.health < soldier.maxHealth * 0.2 ? soldier.visionRange * 3 : soldier.visionRange)) {
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
      // When wandering, there's a small chance to seek the closest target regardless of vision range
      if (Math.random() < 0.02) { // 2% chance per decision interval
        const closestEnemy = enemies.reduce((closest, enemy) => {
          const dist = soldier.distanceTo(enemy);
          return dist < closest.dist ? { enemy, dist } : closest;
        }, { enemy: null, dist: Infinity }).enemy;
        
        if (closestEnemy) {
          this.currentTarget = closestEnemy;
          this.state = 'seek';
        } else {
          this.state = 'wander';
        }
      } else {
        this.state = 'wander';
      }
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
          let speedMultiplier = soldier.health < soldier.maxHealth * 0.5 ? 0.7 : 0.5;
          
          if (distance <= soldier.attackRange) {
            if (soldier.attack(this.currentTarget)) {
              // Backpedal faster after shooting
              speedMultiplier = 0.9;
            }
          }
        
          // Move away while maintaining attack range
          const idealDistance = soldier.attackRange * 0.8;
          if (distance < idealDistance) {
            const dx = soldier.x - this.currentTarget.x;
            const dy = soldier.y - this.currentTarget.y;
            const mag = Math.sqrt(dx * dx + dy * dy);
            const fleeX = soldier.x + (dx / mag) * idealDistance;
            const fleeY = soldier.y + (dy / mag) * idealDistance;
            soldier.moveTowards(fleeX, fleeY, deltaTime * speedMultiplier);
          } else {
            // Strafe sideways while retreating
            const angle = Math.atan2(
              this.currentTarget.y - soldier.y,
              this.currentTarget.x - soldier.x
            ) + (Math.random() - 0.5) * Math.PI/4;
            
            const strafeX = soldier.x - Math.cos(angle) * soldier.speed * deltaTime;
            const strafeY = soldier.y - Math.sin(angle) * soldier.speed * deltaTime;
            soldier.moveTowards(strafeX, strafeY, deltaTime * speedMultiplier);
          }
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
      s => s.isAlive && 
      s.armyId !== soldier.armyId && 
      soldier.distanceTo(s) < soldier.visionRange * 1.5
    );
  
    // First priority: seek healers with path adjustment
    const nearbyHealers = this.allSoldiers.filter(s => 
      s.isAlive && 
      s.armyId === soldier.armyId && 
      s.type === 'healer' && 
      soldier.distanceTo(s) < soldier.visionRange * 2
    );
  
    if (nearbyHealers.length > 0) {
      const closestHealer = nearbyHealers.reduce((closest, healer) => 
        soldier.distanceTo(healer) < closest.dist ? 
        { healer, dist: soldier.distanceTo(healer) } : closest,
        { healer: null, dist: Infinity }
      );
  
      if (closestHealer.healer) {
        // Calculate path with enemy avoidance
        const toHealerX = closestHealer.healer.x - soldier.x;
        const toHealerY = closestHealer.healer.y - soldier.y;
        const toHealerDist = Math.hypot(toHealerX, toHealerY);
        
        let desiredX = toHealerX / toHealerDist;
        let desiredY = toHealerY / toHealerDist;
  
        // Add repulsion from nearby enemies
        nearbyEnemies.forEach(enemy => {
          const enemyDist = soldier.distanceTo(enemy);
          const dx = soldier.x - enemy.x;
          const dy = soldier.y - enemy.y;
          const weight = 1 / Math.max(enemyDist, 1);
          
          desiredX += (dx / enemyDist) * weight;
          desiredY += (dy / enemyDist) * weight;
        });
  
        // Normalize direction
        const dirLength = Math.hypot(desiredX, desiredY);
        if (dirLength > 0) {
          desiredX /= dirLength;
          desiredY /= dirLength;
          
          const targetX = soldier.x + desiredX * 100;
          const targetY = soldier.y + desiredY * 100;
          soldier.moveTowards(targetX, targetY, deltaTime * 0.9);
          return;
        }
      }
    }
  
    // Second priority: move towards strongest ally cluster
    const nearbyAllies = this.allSoldiers.filter(
      s => s !== soldier && 
      s.isAlive && 
      s.armyId === soldier.armyId && 
      soldier.distanceTo(s) < soldier.visionRange * 2
    );
  
    if (nearbyAllies.length > 0) {
      // Find safest cluster (most allies in 100px radius)
      const clusterMap = new Map();
      nearbyAllies.forEach(ally => {
        const key = `${Math.floor(ally.x/50)}-${Math.floor(ally.y/50)}`;
        clusterMap.set(key, (clusterMap.get(key) || 0) + 1);
      });
  
      const bestCluster = [...clusterMap.entries()].reduce((best, [key, count]) => 
        count > best.count ? { key, count } : best, 
        { key: null, count: 0 }
      );
  
      if (bestCluster.key) {
        const [gridX, gridY] = bestCluster.key.split('-').map(Number);
        const clusterCenter = {
          x: (gridX * 50) + 25,
          y: (gridY * 50) + 25
        };
        
        // Move towards cluster center while avoiding enemies
        let desiredX = clusterCenter.x - soldier.x;
        let desiredY = clusterCenter.y - soldier.y;
        const distToCluster = Math.hypot(desiredX, desiredY);
        desiredX /= distToCluster;
        desiredY /= distToCluster;
  
        nearbyEnemies.forEach(enemy => {
          const enemyDist = soldier.distanceTo(enemy);
          const dx = soldier.x - enemy.x;
          const dy = soldier.y - enemy.y;
          const weight = 1 / Math.max(enemyDist, 1);
          
          desiredX += (dx / enemyDist) * weight * 1.2;
          desiredY += (dy / enemyDist) * weight * 1.2;
        });
  
        const dirLength = Math.hypot(desiredX, desiredY);
        if (dirLength > 0) {
          desiredX /= dirLength;
          desiredY /= dirLength;
          soldier.moveTowards(
            soldier.x + desiredX * 100,
            soldier.y + desiredY * 100,
            deltaTime * 0.85
          );
          return;
        }
      }
    }
  
    // Final fallback: smart enemy avoidance
    if (nearbyEnemies.length > 0) {
      let desiredX = 0;
      let desiredY = 0;
  
      // Calculate weighted flee direction
      nearbyEnemies.forEach(enemy => {
        const dx = soldier.x - enemy.x;
        const dy = soldier.y - enemy.y;
        const distance = Math.hypot(dx, dy);
        const weight = 1 / (distance * distance);
        
        desiredX += (dx / distance) * weight;
        desiredY += (dy / distance) * weight;
      });
  
      // Add some random angle to avoid deadlocks
      const angleVariation = Math.PI * 0.25;
      const randAngle = (Math.random() - 0.5) * angleVariation;
      const cos = Math.cos(randAngle);
      const sin = Math.sin(randAngle);
      const rotatedX = desiredX * cos - desiredY * sin;
      const rotatedY = desiredX * sin + desiredY * cos;
  
      const dirLength = Math.hypot(rotatedX, rotatedY);
      if (dirLength > 0) {
        const targetX = soldier.x + (rotatedX / dirLength) * 200;
        const targetY = soldier.y + (rotatedY / dirLength) * 200;
        soldier.moveTowards(targetX, targetY, deltaTime * 0.8);
        return;
      }
    }
  
    // Default wander behavior if no threats
    this.handleWandering(soldier, deltaTime);
  }

  handleWandering(soldier, deltaTime) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    if (!this.wanderTarget || Math.random() < 0.01) {
      const range = 75;
      const buffer = 20;

      // Reduced center bias (from 0.2 to 0.05)
      const biasFactor = 0.05; // Much weaker attraction to center
      const targetX = soldier.x + (Math.random() - 0.5) * range + (centerX - soldier.x) * biasFactor;
      const targetY = soldier.y + (Math.random() - 0.5) * range + (centerY - soldier.y) * biasFactor;

      this.wanderTarget = {
        x: Math.min(canvas.width - buffer, Math.max(buffer, targetX)),
        y: Math.min(canvas.height - buffer, Math.max(buffer, targetY)),
      };
    }

    soldier.moveTowards(this.wanderTarget.x, this.wanderTarget.y, deltaTime);
  }

  broadcastTarget(soldier, target) {
    const baseAlertRange = 120;
    const alertRange = soldier.type === 'archer' ? baseAlertRange * 1.8 : baseAlertRange;
  
    // Get all allies except this soldier
    const nearbyAllies = this.allSoldiers.filter(s =>
      s !== soldier &&
      s.isAlive &&
      s.armyId === soldier.armyId &&
      soldier.distanceTo(s) <= alertRange
    );
  
    for (const ally of nearbyAllies) {
      if (!ally.ai || ally.ai.state === 'flee' || ally.ai.state === 'heal') continue;
  
      // Always update target if current target is null or if the new target is closer
      const currentTargetDist = ally.ai.currentTarget ? 
        ally.distanceTo(ally.ai.currentTarget) : Infinity;
      const newTargetDist = soldier.distanceTo(target);
      
      // Different rules for different unit types
      const isArcher = ally.type === 'archer';
      const isTank = ally.type === 'tank';
      const isIdleOrWandering = ally.ai.state === 'wander' || ally.ai.state === 'idle';
      
      // Tanks only update if they don't have a protection assignment
      const tankCanUpdate = isTank && !ally.ai.protectionAssignment;
      
      // Update conditions:
      // 1. If ally has no target
      // 2. If new target is closer than current target
      // 3. If ally is idle/wandering (unless it's a tank with assignment)
      // 4. If it's an archer (they're more responsive)
      const shouldUpdate = 
        !ally.ai.currentTarget || 
        newTargetDist < currentTargetDist || 
        isIdleOrWandering ||
        isArcher ||
        tankCanUpdate;
  
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