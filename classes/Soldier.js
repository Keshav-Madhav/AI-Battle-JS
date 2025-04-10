import { BattleAI } from './BattleAI.js';

export class Soldier {
  constructor(x, y, armyId, color, allSoldiers, type) {
    this.x = x;
    this.y = y;
    this.armyId = armyId;
    this.color = color;
    this.type = type;
    this.ai = new BattleAI(allSoldiers, armyId);
    this.isAlive = true;
    this.isAttacking = false;
    this.isHealing = false;
    this.actionTimer = 0;
    this.target = null;
    this.lastDamageDealt = 0;
    this.recentlyHealedTargets = [];
    this.size = 4;
    
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
      this.attackDamage = 5;
      this.attackRange = 50;
      this.speed = 50;
      this.healAmount = 10;
      this.healingRange = 30;
      this.visionRange = 150;
    } else if (type === 'berserker'){
      this.health = 200;
      this.attackDamage = 60;
      this.attackRange = 10;
      this.speed = 50;
      this.visionRange = 75;
      this.size = 6;
      this.damageResistance = 0.15;
    } else if (type === 'tank') {
      this.health = 275;
      this.attackDamage = 10;
      this.attackRange = 20;
      this.speed = 30;
      this.visionRange = 75;
      this.protectionRange = 100;
      this.tauntRange = 80;
      this.size = 5;
      this.damageResistance = 0.3;
    }

    this.maxHealth = this.health;
    this.attackCooldown = 0;
    this.attackRate = 1;
    
    // Add animation properties
    this.pulseSize = 0;
    this.pulseDirection = 1;
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
    
    // Update pulse animation for healers and berzerkers
    if (this.type === 'healer' && this.isHealing || this.type === 'berserker' && this.isAttacking) {
      this.pulseSize += deltaTime * 3 * this.pulseDirection;
      if (this.pulseSize > 1) {
        this.pulseSize = 1;
        this.pulseDirection = -1;
      } else if (this.pulseSize < 0) {
        this.pulseSize = 0;
        this.pulseDirection = 1;
      }
    } else {
      this.pulseSize = 0;
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
      const canvasSize = Math.min(canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
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
    let effectiveDamage = amount;

    if (this.damageResistance) {
      effectiveDamage *= (1 - this.damageResistance);
    }

    // Berserker special case: 50% damage resistance if health is below 20%
    if (this.type === 'berserker' && this.health / this.maxHealth < 0.2) {
      effectiveDamage *= 0.5;
    }

    this.health -= effectiveDamage;

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
    // Draw healing aura if healer is healing
    if (this.isHealing && this.type === 'healer') {
      const gradient = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, this.healingRange
      );
      gradient.addColorStop(0, 'rgba(100, 255, 100, 0.2)');
      gradient.addColorStop(1, 'rgba(100, 255, 100, 0)');
      
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.healingRange, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Apply color adjustments based on unit type
    let fillColor = this.color;
    let strokeColor = 'rgba(0, 0, 0, 0.7)';
    let lineWidth = 1;
    
    // Create base and highlight colors for each unit
    const baseColor = this.color;
    const highlightColor = this.getLighterColor(this.color, 30);
    const shadowColor = this.getDarkerColor(this.color, 30);

    // Melee - Simple circle with subtle gradient
    if (this.type === 'melee') {
      const gradient = ctx.createRadialGradient(
        this.x - this.size/3, this.y - this.size/3, 0,
        this.x, this.y, this.size
      );
      gradient.addColorStop(0, highlightColor);
      gradient.addColorStop(1, baseColor);
      
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      
      // Simple indicator of melee type - small dot in center
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = shadowColor;
      ctx.fill();
    } 
    // Archer - Improved triangle
    else if (this.type === 'archer') {
      // Draw triangle
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - this.size * 1.2);
      ctx.lineTo(this.x - this.size, this.y + this.size * 0.6);
      ctx.lineTo(this.x + this.size, this.y + this.size * 0.6);
      ctx.closePath();
      
      // Create gradient for triangle
      const gradient = ctx.createLinearGradient(
        this.x, this.y - this.size, 
        this.x, this.y + this.size
      );
      gradient.addColorStop(0, highlightColor);
      gradient.addColorStop(1, baseColor);
      
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      
      // Add a small dot to indicate bow position
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = shadowColor;
      ctx.fill();
    } 
    // Healer - Cross with glowing effect
    else if (this.type === 'healer') {
      const s = this.size;
      const pulseGlow = this.isHealing ? this.pulseSize * 3 : 0;
      
      // Base cross
      ctx.fillStyle = baseColor;
      ctx.fillRect(this.x - s / 3, this.y - s, s * 2/3, s * 2);
      ctx.fillRect(this.x - s, this.y - s / 3, s * 2, s * 2/3);
      
      // Highlight on top edges
      ctx.fillStyle = highlightColor;
      ctx.fillRect(this.x - s / 3, this.y - s, s * 2/3, s * 0.3);
      ctx.fillRect(this.x - s, this.y - s / 3, s * 0.3, s * 2/3);
      
      // Border
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(this.x - s / 3, this.y - s, s * 2/3, s * 2);
      ctx.strokeRect(this.x - s, this.y - s / 3, s * 2, s * 2/3);
      
      // Healing glow effect
      if (this.isHealing) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, s + pulseGlow, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 255, 100, ${0.2 * (1 - this.pulseSize)})`;
        ctx.fill();
      }
    } 
    // Berzerker - Spiked circle with rage effect
    else if (this.type === 'berserker') {
      const spikes = 8;
      const outerRadius = this.size + (this.isAttacking ? this.pulseSize * 2 : 0);
      const innerRadius = this.size * 0.6;
      
      // Draw spiked circle
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (Math.PI * 2 * i) / (spikes * 2);
        const x = this.x + Math.cos(angle) * radius;
        const y = this.y + Math.sin(angle) * radius;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      
      // Create gradient for berzerker
      const gradient = ctx.createRadialGradient(
        this.x, this.y, innerRadius,
        this.x, this.y, outerRadius
      );
      
      if (this.isAttacking) {
        gradient.addColorStop(0, 'rgba(255, 50, 50, 0.9)');
        gradient.addColorStop(0.7, baseColor);
        gradient.addColorStop(1, highlightColor);
      } else {
        gradient.addColorStop(0, shadowColor);
        gradient.addColorStop(0.7, baseColor);
        gradient.addColorStop(1, highlightColor);
      }
      
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      
      // Rage effect
      if (this.isAttacking) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, outerRadius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 0, 0, ${0.5 * (1 - this.pulseSize)})`;
        ctx.lineWidth = 1 + this.pulseSize;
        ctx.stroke();
      }
    } 
    // Tank - Shield shape with improved details
    else if (this.type === 'tank') {
      // Shield shape parameters
      const shieldWidth = this.size * 2;
      const shieldHeight = this.size * 2.5;
      const topCurve = this.size * 0.8;
      
      // Create gradient for shield
      const gradient = ctx.createLinearGradient(
        this.x - shieldWidth/2, this.y,
        this.x + shieldWidth/2, this.y
      );
      gradient.addColorStop(0, shadowColor);
      gradient.addColorStop(0.3, baseColor);
      gradient.addColorStop(0.7, baseColor);
      gradient.addColorStop(1, highlightColor);
      
      // Draw shield shape
      ctx.beginPath();
      
      // Start at top center of shield
      ctx.moveTo(this.x, this.y - shieldHeight/2);
      
      // Draw right curved top
      ctx.quadraticCurveTo(
        this.x + shieldWidth/4, this.y - shieldHeight/2,
        this.x + shieldWidth/2, this.y - shieldHeight/2 + topCurve
      );
      
      // Draw right side
      ctx.lineTo(this.x + shieldWidth/2, this.y + shieldHeight/3);
      
      // Draw bottom point (tapered)
      ctx.quadraticCurveTo(
        this.x + shieldWidth/4, this.y + shieldHeight/2,
        this.x, this.y + shieldHeight/2
      );
      
      // Draw left side (mirror of right)
      ctx.quadraticCurveTo(
        this.x - shieldWidth/4, this.y + shieldHeight/2,
        this.x - shieldWidth/2, this.y + shieldHeight/3
      );
      
      // Draw left curved top
      ctx.lineTo(this.x - shieldWidth/2, this.y - shieldHeight/2 + topCurve);
      
      // Connect back to start
      ctx.quadraticCurveTo(
        this.x - shieldWidth/4, this.y - shieldHeight/2,
        this.x, this.y - shieldHeight/2
      );
      
      // Fill and outline the shield
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      
      // Add emblem to center of shield
      ctx.beginPath();
      ctx.arc(this.x, this.y - shieldHeight/6, this.size * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = shadowColor;
      ctx.fill();
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = highlightColor;
      ctx.stroke();
    }

    // Health bar with improved appearance
    const healthPercentage = this.health / this.maxHealth;
    
    // Create health bar gradient based on health percentage
    const barWidth = this.size * 2;
    const barHeight = 2;
    const barX = this.x - barWidth / 2;
    const barY = this.y - this.size - 5;
    
    // Health bar background (slightly transparent black)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    // Health bar foreground with gradient
    const healthGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    
    if (healthPercentage > 0.6) {
      healthGradient.addColorStop(0, '#00ff00');
      healthGradient.addColorStop(1, '#80ff80');
    } else if (healthPercentage > 0.3) {
      healthGradient.addColorStop(0, '#ffff00');
      healthGradient.addColorStop(1, '#ffff80');
    } else {
      healthGradient.addColorStop(0, '#ff0000');
      healthGradient.addColorStop(1, '#ff8080');
    }
    
    ctx.fillStyle = healthGradient;
    ctx.fillRect(barX, barY, barWidth * healthPercentage, barHeight);
    
    // Add thin white outline to health bar
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    // VISUALS FOR ATTACKS/HEALING
    if (this.isAttacking && this.target) {
      if (this.type === 'archer') {
        // Draw arrow projectile
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.target.x, this.target.y);
        
        // Create gradient for arrow
        const arrowGradient = ctx.createLinearGradient(this.x, this.y, this.target.x, this.target.y);
        arrowGradient.addColorStop(0, this.color);
        arrowGradient.addColorStop(1, 'rgba(255, 255, 255, 0.7)');
        
        ctx.strokeStyle = arrowGradient;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Add damage text with drop shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`-${this.lastDamageDealt}`, (this.x + this.target.x) / 2, (this.y + this.target.y) / 2 - 5);
        ctx.shadowColor = 'transparent';
      }
    }

    if (this.isHealing) {
      for (const target of this.recentlyHealedTargets) {
        // Create subtle healing effect
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.size + 3, 0, Math.PI * 2);
        const healGradient = ctx.createRadialGradient(
          target.x, target.y, target.size,
          target.x, target.y, target.size + 3
        );
        healGradient.addColorStop(0, 'rgba(100, 255, 100, 0.5)');
        healGradient.addColorStop(1, 'rgba(100, 255, 100, 0)');
        
        ctx.fillStyle = healGradient;
        ctx.fill();
        
        // Add healing amount text
        ctx.fillStyle = 'rgba(100, 255, 100, 0.8)';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`+${this.healAmount}`, target.x, target.y - target.size - 5);
      }
    }
  }
  
  // Helper methods for color manipulation
  getLighterColor(color, percent) {
    return this.adjustColor(color, percent);
  }
  
  getDarkerColor(color, percent) {
    return this.adjustColor(color, -percent);
  }
  
  adjustColor(color, percent) {
    // Convert color to RGB if it's in hex format
    let r, g, b;
    
    if (color.startsWith('#')) {
      // Handle hex colors
      const hex = color.substring(1);
      r = parseInt(hex.substr(0, 2), 16);
      g = parseInt(hex.substr(2, 2), 16);
      b = parseInt(hex.substr(4, 2), 16);
    } else if (color.startsWith('rgb')) {
      // Handle rgb/rgba colors
      const matches = color.match(/\d+/g);
      r = parseInt(matches[0]);
      g = parseInt(matches[1]);
      b = parseInt(matches[2]);
    } else {
      // Default fallback
      return color;
    }
    
    // Adjust color
    r = Math.max(0, Math.min(255, r + Math.floor(percent * 2.55)));
    g = Math.max(0, Math.min(255, g + Math.floor(percent * 2.55)));
    b = Math.max(0, Math.min(255, b + Math.floor(percent * 2.55)));
    
    return `rgb(${r}, ${g}, ${b})`;
  }
}