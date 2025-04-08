export class Army {
  constructor(id, soldierCount, color) {
    this.id = id;
    this.color = color;
    this.soldierCount = soldierCount;
    this.aliveCount = soldierCount;
  }

  updateAliveCount(soldiers) {
    this.aliveCount = soldiers.filter(s => s.armyId === this.id && s.isAlive).length;
  }
}