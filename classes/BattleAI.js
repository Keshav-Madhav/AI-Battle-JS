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
    
    // Pre-allocated arrays and objects to reduce garbage collection
    this._enemies = [];
    this._allies = [];
    this._woundedAllies = [];
    this._protectableAllies = [];
    this._tanks = [];
    this._protectedAlliesMap = new Map();
    this._healableAllies = [];
    this._nearbyEnemies = [];
    this._nearbyHealers = [];
    this._nearbyAllies = [];
    this._clusterMap = new Map();
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
    // Reuse pre-allocated arrays instead of creating new ones
    const enemies = this._enemies;
    const allies = this._allies;
    const woundedAllies = this._woundedAllies;
    
    // Clear arrays
    enemies.length = 0;
    allies.length = 0;
    woundedAllies.length = 0;
    
    let protectableAllies = null;
    const tanks = soldier.type === 'tank' ? this._tanks : null;
    const protectedAlliesMap = soldier.type === 'tank' ? this._protectedAlliesMap : null;
    
    if (tanks) tanks.length = 0;
    if (protectedAlliesMap) protectedAlliesMap.clear();
    
    // Single pass through allSoldiers to categorize everyone
    const allSoldiers = this.allSoldiers;
    const armyId = this.armyId;
    const isTank = soldier.type === 'tank';
    
    for (let i = 0; i < allSoldiers.length; i++) {
      const s = allSoldiers[i];
      if (!s.isAlive) continue;
      
      if (s.armyId === armyId) {
        if (s !== soldier) {
          allies.push(s);
          
          // Track wounded allies for healers
          if (s.health < s.maxHealth) {
            woundedAllies.push(s);
          }
          
          // Track protectable allies for tanks
          if (isTank && (s.type === 'archer' || s.type === 'healer')) {
            if (!protectableAllies) {
              protectableAllies = this._protectableAllies;
              protectableAllies.length = 0;
            }
            protectableAllies.push(s);
          }
          
          // Track tanks and their protection assignments
          if (isTank && s.type === 'tank' && s !== soldier && s.ai?.protectionAssignment) {
            tanks.push(s);
            
            const protectedAlly = s.ai.protectionAssignment;
            if (!protectedAlliesMap.has(protectedAlly.id)) {
              protectedAlliesMap.set(protectedAlly.id, []);
            }
            protectedAlliesMap.get(protectedAlly.id).push(s);
          }
        }
      } else {
        enemies.push(s);
      }
    }
  
    // Healer logic
    if (soldier.type === 'healer' && woundedAllies.length > 0) {
      this.state = 'heal';
      this.currentTarget = woundedAllies[0]; // Take the first wounded ally
      return;
    }
  
    if (enemies.length === 0) {
      this.state = 'idle';
      this.currentTarget = null;
      return;
    }
  
    // Archer shoot-flee logic when below 50% health
    if (soldier.type === 'archer' && soldier.health < soldier.maxHealth * 0.5) {
      let closestEnemy = null;
      let minDist = Infinity;
      
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        const dist = soldier.distanceTo(enemy);
        if (dist < minDist) {
          minDist = dist;
          closestEnemy = enemy;
        }
      }

      if (closestEnemy && minDist <= soldier.visionRange) {
        this.currentTarget = closestEnemy;
        this.state = 'shoot-flee';
        return;
      }
    }

    // Berserker logic
    if (soldier.type === 'berserker') {
      // If health is critical , attack ANYONE including allies
      const targets = soldier.health < soldier.maxHealth * soldier.berserkerRageThreshold ? 
        [...enemies, ...allies] : 
        enemies;
        
      if (targets.length > 0) {
        // Find closest target
        let closestTarget = null;
        let minDist = Infinity;
        
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const dist = soldier.distanceTo(target);
          if (dist < minDist) {
            minDist = dist;
            closestTarget = target;
          }
        }
        
        this.currentTarget = closestTarget;
        
        // Set state based on distance
        if (minDist <= soldier.attackRange) {
          this.state = 'attack';
        } else if (minDist <= (soldier.health < soldier.maxHealth * 0.2 ? soldier.visionRange * 3 : soldier.visionRange)) {
          this.state = 'seek';
        } else {
          this.state = 'wander';
        }
        return;
      }
    }

    // Tank logic
    if (soldier.type === 'tank') {
      // Check if current protection assignment is still valid
      if (this.protectionAssignment && this.protectionAssignment.isAlive) {
        const currentAssignment = this.protectionAssignment;
        
        // Pre-calculate before the loop to avoid repeated checks
        let isStillProtectable = false;
        if (protectableAllies) {
          for (let i = 0; i < protectableAllies.length; i++) {
            if (protectableAllies[i] === currentAssignment) {
              isStillProtectable = true;
              break;
            }
          }
        }
        
        // Check protectors count once
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
      if (!this.protectionAssignment && protectableAllies && protectableAllies.length > 0) {
        // Calculate scores using pre-allocated arrays
        const allyScores = [];
        
        for (let i = 0; i < protectableAllies.length; i++) {
          const ally = protectableAllies[i];
          
          // Find closest enemy to this ally
          let closestEnemyDist = Infinity;
          for (let j = 0; j < enemies.length; j++) {
            const enemy = enemies[j];
            const dist = enemy.distanceTo(ally);
            if (dist < closestEnemyDist) {
              closestEnemyDist = dist;
            }
          }
          
          // How many tanks are already protecting this ally
          const currentProtectors = protectedAlliesMap.has(ally.id) ? 
            protectedAlliesMap.get(ally.id).length : 0;
          
          // Calculate protection score (higher = needs more protection)
          const protectionPenalty = currentProtectors * 50;
          const typePriority = ally.type === 'healer' ? 20 : 0;
          const healthFactor = (1 - (ally.health / ally.maxHealth)) * 40;
          const threatScore = 500 - closestEnemyDist;
          
          const protectionScore = threatScore + typePriority + healthFactor - protectionPenalty;
          
          allyScores.push({ ally, protectionScore, currentProtectors });
        }
        
        // Sort by protection score (highest first)
        allyScores.sort((a, b) => b.protectionScore - a.protectionScore);
        
        // Choose the ally with highest protection score who doesn't already have too many protectors
        let bestMatch = null;
        for (let i = 0; i < allyScores.length; i++) {
          if (allyScores[i].currentProtectors < 2) {
            bestMatch = allyScores[i];
            break;
          }
        }
        
        if (!bestMatch && allyScores.length > 0) {
          bestMatch = allyScores[0];
        }
        
        if (bestMatch) {
          this.protectionAssignment = bestMatch.ally;
          this.protectionStickiness = 2 + Math.random() * 2;
        }
      }

      // If we have a protection assignment, focus on protecting them
      if (this.protectionAssignment) {
        const ally = this.protectionAssignment;
        
        // Find enemies threatening the ally (using a single pass)
        const enemiesThreateningAlly = [];
        let closestThreat = null;
        let minThreatDist = Infinity;
        
        for (let i = 0; i < enemies.length; i++) {
          const enemy = enemies[i];
          const distToAlly = enemy.distanceTo(ally);
          if (distToAlly < enemy.attackRange * 1.5) {
            enemiesThreateningAlly.push(enemy);
            
            if (distToAlly < minThreatDist) {
              minThreatDist = distToAlly;
              closestThreat = enemy;
            }
          }
        }

        // If there are immediate threats to our protected ally
        if (enemiesThreateningAlly.length > 0) {
          this.currentTarget = closestThreat;
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
      let closestEnemy = null;
      let minDist = Infinity;
      
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        const dist = soldier.distanceTo(enemy);
        if (dist < minDist) {
          minDist = dist;
          closestEnemy = enemy;
        }
      }
      
      this.currentTarget = closestEnemy;

      if (minDist <= soldier.attackRange) {
        this.state = 'attack';
      } else {
        this.state = 'seek';
      }
      return;
    }
  
    // Default behavior for other soldier types
    // Find best target based on distance and health
    let bestTarget = null;
    let bestScore = Infinity;
    
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      const dist = soldier.distanceTo(enemy);
      const score = dist - (enemy.health * 0.5); // closer + lower health = better
      
      if (score < bestScore) {
        bestScore = score;
        bestTarget = enemy;
      }
    }
    
    this.currentTarget = bestTarget;
    
    if (!bestTarget) {
      this.state = 'wander';
      return;
    }
  
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
        let closestEnemy = null;
        let minDist = Infinity;
        
        for (let i = 0; i < enemies.length; i++) {
          const enemy = enemies[i];
          const dist = soldier.distanceTo(enemy);
          if (dist < minDist) {
            minDist = dist;
            closestEnemy = enemy;
          }
        }
        
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
        // Reuse pre-allocated arrays
        const healableAllies = this._healableAllies;
        healableAllies.length = 0;
        
        let closestWoundedAlly = null;
        let minWoundedDist = Infinity;
        
        // Single pass with early returns
        const allSoldiers = this.allSoldiers;
        const armyId = this.armyId;
        const healingRange = soldier.healingRange;
        
        for (let i = 0; i < allSoldiers.length; i++) {
          const ally = allSoldiers[i];
          if (!ally.isAlive || ally.armyId !== armyId || ally === soldier) continue;
          
          if (ally.health < ally.maxHealth) {
            const dist = soldier.distanceTo(ally);
            
            // Track for immediate healing
            if (dist <= healingRange) {
              healableAllies.push(ally);
            }
            
            // Track closest wounded ally for movement
            if (dist < minWoundedDist) {
              minWoundedDist = dist;
              closestWoundedAlly = ally;
            }
          }
        }

        if (healableAllies.length > 0) {
          for (let i = 0; i < healableAllies.length; i++) {
            soldier.heal(healableAllies[i]);
          }
        } else if (this.currentTarget && this.currentTarget.isAlive) {
          soldier.moveTowards(this.currentTarget.x, this.currentTarget.y, deltaTime);
        } else if (closestWoundedAlly) {
          this.currentTarget = closestWoundedAlly;
          soldier.moveTowards(closestWoundedAlly.x, closestWoundedAlly.y, deltaTime);
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
              // Berserker special attack - damage all in range (single pass)
              const isCritical = soldier.health < soldier.maxHealth * soldier.berserkerRageThreshold;
              const allSoldiers = this.allSoldiers;
              const attackRange = soldier.attackRange;
              const armyId = this.armyId;
              const attackDamage = soldier.attackDamage;
              
              for (let i = 0; i < allSoldiers.length; i++) {
                const target = allSoldiers[i];
                if (!target.isAlive) continue;
                
                const inRange = soldier.distanceTo(target) <= attackRange;
                if (!inRange) continue;
                
                // Attack criteria
                const isEnemy = target.armyId !== armyId;
                
                // If critical health, attack everyone; otherwise just enemies
                if (isCritical || isEnemy) {
                  target.takeDamage(attackDamage);
                }
              }
            } else {
              soldier.attack(this.currentTarget);
            }
          } else {
            // Berserker charges faster when low health
            const speedMultiplier = (soldier.type === 'berserker' && soldier.health < soldier.maxHealth * soldier.berserkerRageThreshold) ? 1.5 : 1;
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
            // Avoid unnecessary division by zero
            if (mag > 0.001) {
              const fleeX = soldier.x + (dx / mag) * idealDistance;
              const fleeY = soldier.y + (dy / mag) * idealDistance;
              soldier.moveTowards(fleeX, fleeY, deltaTime * speedMultiplier);
            }
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
          let nearestEnemy = null;
          let minDist = Infinity;
          
          const allSoldiers = this.allSoldiers;
          const armyId = this.armyId;
          
          for (let i = 0; i < allSoldiers.length; i++) {
            const s = allSoldiers[i];
            if (!s.isAlive || s.armyId === armyId) continue;
            
            const dist = s.distanceTo(ally);
            if (dist < minDist) {
              minDist = dist;
              nearestEnemy = s;
            }
          }
          
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
          
          // Taunt nearby enemies (one pass)
          const tauntRange = soldier.tauntRange;
          for (let i = 0; i < allSoldiers.length; i++) {
            const s = allSoldiers[i];
            if (!s.isAlive || s.armyId === armyId) continue;
            
            const inTauntRange = soldier.distanceTo(s) < tauntRange;
            if (!inTauntRange) continue;
            
            // Higher chance to taunt enemies targeting our protected ally
            if (s.ai?.currentTarget === this.protectionAssignment || Math.random() < 0.4) {
              s.ai.currentTarget = soldier;
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
    // Reuse pre-allocated arrays
    const nearbyEnemies = this._nearbyEnemies;
    const nearbyHealers = this._nearbyHealers;
    const nearbyAllies = this._nearbyAllies;
    
    // Clear arrays
    nearbyEnemies.length = 0;
    nearbyHealers.length = 0;
    nearbyAllies.length = 0;
    
    // Cache frequently accessed values
    const allSoldiers = this.allSoldiers;
    const armyId = this.armyId;
    const visionRange = soldier.visionRange;
    const doubleVisionRange = visionRange * 2;
    const extendedVisionRange = visionRange * 1.5;
    
    // Single pass through soldiers
    for (let i = 0; i < allSoldiers.length; i++) {
      const s = allSoldiers[i];
      if (!s.isAlive) continue;
      
      const dist = soldier.distanceTo(s);
      
      if (s.armyId !== armyId) {
        if (dist < extendedVisionRange) {
          nearbyEnemies.push({ enemy: s, dist });
        }
      } else if (s !== soldier) {
        if (s.type === 'healer' && dist < doubleVisionRange) {
          nearbyHealers.push({ healer: s, dist });
        }
        
        if (dist < doubleVisionRange) {
          nearbyAllies.push({ ally: s, dist });
        }
      }
    }
  
    // First priority: seek healers with path adjustment
    if (nearbyHealers.length > 0) {
      // Find closest healer
      let closestHealer = null;
      let minDist = Infinity;
      
      for (let i = 0; i < nearbyHealers.length; i++) {
        const { healer, dist } = nearbyHealers[i];
        if (dist < minDist) {
          minDist = dist;
          closestHealer = healer;
        }
      }
  
      if (closestHealer) {
        // Calculate path with enemy avoidance
        const toHealerX = closestHealer.x - soldier.x;
        const toHealerY = closestHealer.y - soldier.y;
        const toHealerDist = Math.hypot(toHealerX, toHealerY);
        
        // Avoid division by zero
        if (toHealerDist > 0.001) {
          let desiredX = toHealerX / toHealerDist;
          let desiredY = toHealerY / toHealerDist;
    
          // Add repulsion from nearby enemies
          for (let i = 0; i < nearbyEnemies.length; i++) {
            const { enemy, dist } = nearbyEnemies[i];
            const dx = soldier.x - enemy.x;
            const dy = soldier.y - enemy.y;
            const weight = 1 / Math.max(dist, 1);
            
            desiredX += (dx / dist) * weight;
            desiredY += (dy / dist) * weight;
          }
    
          // Normalize direction
          const dirLength = Math.hypot(desiredX, desiredY);
          if (dirLength > 0.001) {
            desiredX /= dirLength;
            desiredY /= dirLength;
            
            const targetX = soldier.x + desiredX * 100;
            const targetY = soldier.y + desiredY * 100;
            soldier.moveTowards(targetX, targetY, deltaTime * 0.9);
            return;
          }
        }
      }
    }
  
    // Second priority: move towards strongest ally cluster
    if (nearbyAllies.length > 0) {
      // Find safest cluster - optimize with a grid system
      const gridSize = 50;
      const clusterMap = this._clusterMap;
      clusterMap.clear();
      
      for (let i = 0; i < nearbyAllies.length; i++) {
        const { ally } = nearbyAllies[i];
        const gridX = Math.floor(ally.x / gridSize);
        const gridY = Math.floor(ally.y / gridSize);
        const key = `${gridX}-${gridY}`;
        
        clusterMap.set(key, (clusterMap.get(key) || 0) + 1);
      }
  
      // Find best cluster (most allies)
      let bestKey = null;
      let bestCount = 0;
      
      for (const [key, count] of clusterMap.entries()) {
        if (count > bestCount) {
          bestCount = count;
          bestKey = key;
        }
      }
  
      if (bestKey) {
        const [gridX, gridY] = bestKey.split('-').map(Number);
        const clusterCenter = {
          x: (gridX * gridSize) + gridSize/2,
          y: (gridY * gridSize) + gridSize/2
        };
        
        // Move towards cluster center while avoiding enemies
        let desiredX = clusterCenter.x - soldier.x;
        let desiredY = clusterCenter.y - soldier.y;
        const distToCluster = Math.hypot(desiredX, desiredY);
        
        if (distToCluster > 0.001) {
          desiredX /= distToCluster;
          desiredY /= distToCluster;

          for (let i = 0; i < nearbyEnemies.length; i++) {
            const { enemy, dist } = nearbyEnemies[i];
            const dx = soldier.x - enemy.x;
            const dy = soldier.y - enemy.y;
            const normalizedDist = Math.max(dist, 1);
            const weight = 1 / normalizedDist;
            
            desiredX += (dx / normalizedDist) * weight * 1.2;
            desiredY += (dy / normalizedDist) * weight * 1.2;
          }
        
          const dirLength = Math.hypot(desiredX, desiredY);
          if (dirLength > 0.001) {
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
    }

    // Final fallback: smart enemy avoidance
    if (nearbyEnemies.length > 0) {
      let desiredX = 0;
      let desiredY = 0;
  
      // Calculate weighted flee direction
      for (let i = 0; i < nearbyEnemies.length; i++) {
        const { enemy, dist } = nearbyEnemies[i];
        const dx = soldier.x - enemy.x;
        const dy = soldier.y - enemy.y;
        // Avoid division by zero and optimize using squared distance
        if (dist > 0.001) {
          const weight = 1 / (dist * dist);
          
          desiredX += (dx / dist) * weight;
          desiredY += (dy / dist) * weight;
        }
      }
  
      // Add some random angle to avoid deadlocks
      const angleVariation = Math.PI * 0.25;
      const randAngle = (Math.random() - 0.5) * angleVariation;
      const cos = Math.cos(randAngle);
      const sin = Math.sin(randAngle);
      const rotatedX = desiredX * cos - desiredY * sin;
      const rotatedY = desiredX * sin + desiredY * cos;
  
      const dirLength = Math.hypot(rotatedX, rotatedY);
      if (dirLength > 0.001) {
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
    // Cache canvas dimensions
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    if (!this.wanderTarget || Math.random() < 0.01) {
      const range = 75;
      const buffer = 20;

      // Reduced center bias (from 0.2 to 0.05)
      const biasFactor = 0.05; // Much weaker attraction to center
      const targetX = soldier.x + (Math.random() - 0.5) * range + (centerX - soldier.x) * biasFactor;
      const targetY = soldier.y + (Math.random() - 0.5) * range + (centerY - soldier.y) * biasFactor;

      // Reuse existing object or create new one only when needed
      if (!this.wanderTarget) {
        this.wanderTarget = {
          x: Math.min(canvasWidth - buffer, Math.max(buffer, targetX)),
          y: Math.min(canvasHeight - buffer, Math.max(buffer, targetY)),
        };
      } else {
        this.wanderTarget.x = Math.min(canvasWidth - buffer, Math.max(buffer, targetX));
        this.wanderTarget.y = Math.min(canvasHeight - buffer, Math.max(buffer, targetY));
      }
    }

    soldier.moveTowards(this.wanderTarget.x, this.wanderTarget.y, deltaTime);
  }

  broadcastTarget(soldier, target) {
    const baseAlertRange = 220;
    const alertRange = soldier.type === 'archer' ? baseAlertRange * 1.8 : baseAlertRange;
    const allSoldiers = this.allSoldiers;
    const armyId = this.armyId;
    
    // Single pass for ally checking and updating
    for (let i = 0; i < allSoldiers.length; i++) {
      const s = allSoldiers[i];
      if (s === soldier || !s.isAlive || s.armyId !== armyId) continue;
      
      const dist = soldier.distanceTo(s);
      if (dist > alertRange) continue;
      
      const ally = s;
      if (!ally.ai || ally.ai.state === 'flee' || ally.ai.state === 'heal') continue;
  
      // Calculate current and new target distances once
      const currentTargetDist = ally.ai.currentTarget ? ally.distanceTo(ally.ai.currentTarget) : Infinity;
      const newTargetDist = soldier.distanceTo(target);
      
      // Different rules for different unit types
      const isArcher = ally.type === 'archer';
      const isTank = ally.type === 'tank';
      const isIdleOrWandering = ally.ai.state === 'wander' || ally.ai.state === 'idle';
      
      // Tanks only update if they don't have a protection assignment
      const tankCanUpdate = isTank && !ally.ai.protectionAssignment;
      
      // Update conditions - evaluate all at once to avoid short-circuit evaluation overhead
      const shouldUpdate = 
        !ally.ai.currentTarget || 
        newTargetDist < currentTargetDist || 
        isIdleOrWandering ||
        isArcher ||
        tankCanUpdate;
  
      if (shouldUpdate) {
        ally.ai.currentTarget = target;
        const dist = ally.distanceTo(target);
        
        // Set state in one go - avoid nested if conditions
        if (dist <= ally.attackRange) {
          ally.ai.state = 'attack';
        } else if (dist <= ally.visionRange) {
          ally.ai.state = 'seek';
        } else {
          ally.ai.state = 'wander';
        }
      }
    }
  }  
}