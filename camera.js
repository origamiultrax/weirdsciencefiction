/* =========================================================
   camera.js — Camera presets, orbit, DOF params
   ========================================================= */
(function (global) {
  const W = global.WSF;

  class Camera {
    constructor() {
      this.yaw = -0.5;       // horizontal rotation
      this.pitch = 0.35;     // vertical
      this.distance = 1.8;   // distance from target
      this.target = [0.5, 0.3, 0.5];
      this.fov = 60;
      this.dof = 0;
      this.focus = 0.8;
      this.exposure = 1.0;
    }

    preset(name) {
      switch (name) {
        case 'wide':
          this.fov = 80; this.pitch = 0.3; this.distance = 2.0; break;
        case 'tele':
          this.fov = 28; this.pitch = 0.2; this.distance = 3.0; break;
        case 'aerial':
          this.fov = 60; this.pitch = 1.1; this.distance = 2.2; break;
      }
    }

    reset() {
      this.yaw = -0.5;
      this.pitch = 0.35;
      this.distance = 1.8;
      this.fov = 60;
    }

    orbit(dx, dy) {
      this.yaw += dx * 0.005;
      this.pitch = Math.max(0.02, Math.min(1.4, this.pitch + dy * 0.005));
    }

    zoom(dz) {
      this.distance = Math.max(0.6, Math.min(4.5, this.distance + dz));
    }

    // Compute the eye position from yaw/pitch/distance
    position() {
      const cy = Math.cos(this.pitch);
      const sy = Math.sin(this.pitch);
      const cx = Math.cos(this.yaw);
      const sx = Math.sin(this.yaw);
      return [
        this.target[0] + this.distance * cy * cx,
        this.target[1] + this.distance * sy,
        this.target[2] + this.distance * cy * sx,
      ];
    }

    // Project a 3D point to 2D screen coords
    // Returns { x, y, z (depth) } or null if behind camera
    project(p, w, h) {
      const eye = this.position();
      // Forward (from eye to target)
      const fx = this.target[0] - eye[0];
      const fy = this.target[1] - eye[1];
      const fz = this.target[2] - eye[2];
      const fl = Math.hypot(fx, fy, fz);
      const Fx = fx / fl, Fy = fy / fl, Fz = fz / fl;
      // Up-ish
      const upY = 1;
      // Right = forward x up
      let Rx = Fz * 0 - Fy * 0;   // placeholder, recompute below
      // Right = normalize(cross(forward, up(0,1,0)))
      Rx =  Fz;
      let Ry =  0;
      let Rz = -Fx;
      const rl = Math.hypot(Rx, Ry, Rz) || 1;
      Rx /= rl; Ry /= rl; Rz /= rl;
      // Up = cross(right, forward)
      const Ux = Ry * Fz - Rz * Fy;
      const Uy = Rz * Fx - Rx * Fz;
      const Uz = Rx * Fy - Ry * Fx;

      // Point relative to eye
      const vx = p[0] - eye[0];
      const vy = p[1] - eye[1];
      const vz = p[2] - eye[2];

      // Camera-space coords
      const csx = vx * Rx + vy * Ry + vz * Rz;
      const csy = vx * Ux + vy * Uy + vz * Uz;
      const csz = vx * Fx + vy * Fy + vz * Fz;

      if (csz < 0.01) return null;

      const aspect = w / h;
      const f = 1 / Math.tan((this.fov * Math.PI / 180) * 0.5);
      const sx = (csx * f / aspect) / csz;
      const sy = (csy * f) / csz;

      return {
        x: (sx * 0.5 + 0.5) * w,
        y: (0.5 - sy * 0.5) * h,
        z: csz,
      };
    }
  }

  W.Camera = Camera;
})(window);
