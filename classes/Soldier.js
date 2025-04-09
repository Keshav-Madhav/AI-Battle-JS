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
    this.isAttacking = false;
    this.isHealing = false;
    this.actionTimer = 0;
    this.target = null;
    this.lastDamageDealt = 0;
    this.recentlyHealedTargets = [];

    // Adjust stats based on type
    if (type === 'melee') {
      this.health = 150;
      this.attackDamage = 25;
      this.attackRange = 15;
      this.speed = 40;
      this.visionRange = 100;
    } else if (type === 'archer') {
      this.health = 100;
      this.attackDamage = 20;
      this.attackRange = 100;
      this.speed = 60;
      this.visionRange = 150;
    } else if (type === 'healer') {
      this.health = 80;
      this.attackDamage = 0;
      this.attackRange = 50;
      this.speed = 40;
      this.healAmount = 10;
      this.healingRange = 30;
      this.visionRange = 150;
    } else if (type === 'brezerker'){
      this.health = 200;
      this.attackDamage = 60;
      this.attackRange = 10;
      this.speed = 50;
      this.visionRange = 75;
    }

    this.maxHealth = this.health;
    this.size = 4;
    this.attackCooldown = 0;
    this.attackRate = 1;
  }

  update(deltaTime, allSoldiers) {
    if (!this.isAlive) return;

    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }

    if (this.actionTimer > 0) {
      this.actionTimer -= deltaTime;
      if (this.actionTimer <= 0) {
        this.isAttacking = false;
        this.isHealing = false;
        this.target = null;
        this.lastDamageDealt = 0;
        this.recentlyHealedTargets = [];
      }
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
  
      // Calculate centered square boundaries
      const canvasSize = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT);
      const centerX = CANVAS_WIDTH / 2;
      const centerY = CANVAS_HEIGHT / 2;
      const buffer = canvasSize / 2 - 20;
      
      // Keep within centered square
      this.x = Math.max(centerX - buffer, Math.min(centerX + buffer, this.x));
      this.y = Math.max(centerY - buffer, Math.min(centerY + buffer, this.y));
    }
  }

  attack(target) {
    if (this.attackCooldown <= 0) {
      target.takeDamage(this.attackDamage);
      this.attackCooldown = 1 / this.attackRate;
      this.isAttacking = true;
      this.actionTimer = 0.4;
      this.target = target;
      this.lastDamageDealt = this.attackDamage;
      return true;
    }
    return false;
  }

  heal(target) {
    target.health = Math.min(target.maxHealth, target.health + this.healAmount);
    this.isHealing = true;
    this.actionTimer = 0.4;
    this.recentlyHealedTargets.push(target);
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

  drawSoldier(ctx) {
    // Draw healing range if healer is healing
    if (this.isHealing && this.type === 'healer') {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
      ctx.lineWidth = 1;
      ctx.arc(this.x, this.y, this.healingRange, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.isAttacking && this.type === 'brezerker') {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.attackRange, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Blood splatter effect
      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = this.size + Math.random() * this.attackRange/2;
        ctx.beginPath();
        ctx.arc(
          this.x + Math.cos(angle) * dist,
          this.y + Math.sin(angle) * dist,
          1 + Math.random() * 2,
          0, Math.PI * 2
        );
        ctx.fillStyle = 'rgba(200, 0, 0, 0.7)';
        ctx.fill();
      }
    }

    // Main body
    ctx.fillStyle = this.color;

    if (this.type === 'melee') {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'black';
      ctx.stroke();
    } else if (this.type === 'archer') {
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - this.size);
      ctx.lineTo(this.x - this.size, this.y + this.size);
      ctx.lineTo(this.x + this.size, this.y + this.size);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'black';
      ctx.stroke();
    } else if (this.type === 'healer') {
      const s = this.size;
      ctx.fillRect(this.x - s / 4, this.y - s, s / 2, s * 2);
      ctx.fillRect(this.x - s, this.y - s / 4, s * 2, s / 2);
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(this.x - s / 4, this.y - s, s / 2, s * 2);
      ctx.strokeRect(this.x - s, this.y - s / 4, s * 2, s / 2);
    } else if (this.type === 'brezerker') {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size*1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'black';
      ctx.stroke();

      // transparent center for donut effect
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size*0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fill();
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = 'black';
      ctx.stroke();
  }

    // Health bar
    const healthPercentage = this.health / this.maxHealth;
    ctx.fillStyle = healthPercentage > 0.6 ? 'lime' :
                    healthPercentage > 0.3 ? 'yellow' : 'red';

    const barWidth = this.size * 2;
    const barHeight = 2;

    ctx.fillRect(
      this.x - barWidth / 2,
      this.y - this.size - 5,
      barWidth * healthPercentage,
      barHeight
    );

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.strokeRect(
      this.x - barWidth / 2,
      this.y - this.size - 5,
      barWidth,
      barHeight
    );

    // VISUALS
    if (this.isAttacking && this.target) {
      if (this.type === 'archer') {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.target.x, this.target.y);
        ctx.strokeStyle = 'orange';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = 'orange';
        ctx.font = '10px Arial';
        ctx.fillText(`-${this.lastDamageDealt}`, (this.x + this.target.x) / 2, (this.y + this.target.y) / 2);
      }

      if (this.type === 'melee') {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size + 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    if (this.isHealing) {
      for (const target of this.recentlyHealedTargets) {
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.size + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'lime';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }
}
