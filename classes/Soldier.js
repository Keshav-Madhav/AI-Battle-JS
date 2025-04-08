import { BattleAI } from './BattleAI.js';

export class Soldier {
  constructor(x, y, armyId, color, allSoldiers, type) {
    this.x = x;
    this.y = y;
    this.armyId = armyId;
    this.color = color;
    this.type = type; // 'melee', 'archer', or 'healer'
    this.ai = new BattleAI(allSoldiers, armyId);
    this.isAlive = true;

    // Adjust stats based on type
    if (type === 'melee') {
      this.health = 150;
      this.attackDamage = 20;
      this.attackRange = 15;
      this.speed = 40;
    } else if (type === 'archer') {
      this.health = 100;
      this.attackDamage = 15;
      this.attackRange = 100;
      this.speed = 50;
    } else if (type === 'healer') {
      this.health = 80;
      this.attackDamage = 0;
      this.attackRange = 50;
      this.speed = 40;
      this.healAmount = 10;
      this.healingRange = 30;
    }

    this.maxHealth = this.health;
    this.visionRange = 150;
    this.size = 4;
    this.attackCooldown = 0;
    this.attackRate = 1;
  }

  update(deltaTime, allSoldiers) {
    if (!this.isAlive) return;
    
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }
    
    this.ai.update(this, deltaTime, allSoldiers);
  }

  moveTowards(targetX, targetY, deltaTime) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      const directionX = dx / distance;
      const directionY = dy / distance;

      const moveDistance = Math.min(distance, this.speed * deltaTime);
      this.x += directionX * moveDistance;
      this.y += directionY * moveDistance;

      // Clamp within canvas boundaries
      const buffer = this.size * 4;
      this.x = Math.max(buffer, Math.min(CANVAS_WIDTH - buffer, this.x));
      this.y = Math.max(buffer, Math.min(CANVAS_HEIGHT - buffer, this.y));
    }
  }


  attack(target) {
    if (this.attackCooldown <= 0) {
      target.takeDamage(this.attackDamage);
      this.attackCooldown = 1 / this.attackRate;
      return true;
    }
    return false;
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.isAlive = false;
    }
  }

  distanceTo(other) {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}