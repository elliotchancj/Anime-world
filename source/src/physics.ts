import RAPIER from '@dimforge/rapier3d-compat';

export class Physics {
  world!: RAPIER.World;
  R = RAPIER;
  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }
  addBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY = 0): RAPIER.Collider {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz);
    if (rotY) d.setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) });
    return this.world.createCollider(d);
  }
  /** Ramp collider: a thin box rotated about X axis */
  addRampZ(cx: number, cy: number, cz: number, hx: number, halfLen: number, angle: number): RAPIER.Collider {
    const d = RAPIER.ColliderDesc.cuboid(hx, 0.05, halfLen).setTranslation(cx, cy, cz)
      .setRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) });
    return this.world.createCollider(d);
  }
  addCylinder(cx: number, cy: number, cz: number, halfH: number, r: number) {
    return this.world.createCollider(RAPIER.ColliderDesc.cylinder(halfH, r).setTranslation(cx, cy, cz));
  }
}
