import React, { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';

interface CelebrationOverlayProps {
  triggerKey?: string | number;
  autoPlay?: boolean;
}

interface RocketParticle {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  color: string;
  exploded: boolean;
  trail: { x: number; y: number; alpha: number; size: number }[];
  launchTime: number;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  decay: number;
  size: number;
}

interface FallingSparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
  swayFreq: number;
  swayPhase: number;
}

export const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({
  triggerKey,
  autoPlay = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!autoPlay) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    let animId: number;
    let startTime = performance.now();
    const cyclePeriod = 4200; // 4.2s smooth continuous loop cycle

    const palette = [
      '#facc15', // Gold
      '#00e5ff', // Cyan
      '#f43f5e', // Rose
      '#34d399', // Emerald
      '#c084fc', // Purple
      '#ffffff'  // White
    ];

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth || 360;
        canvas.height = 320; // Focused on top winner card area
      } else {
        canvas.width = window.innerWidth;
        canvas.height = 320;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const w = canvas.width;
    const startY = 250; // Launch height

    // Generate 8 upward crackers staggered across the cycle period
    const createRocketSet = (): RocketParticle[] => [
      {
        x: w * 0.22,
        y: startY,
        vy: -9.2,
        targetY: 55,
        color: '#facc15',
        exploded: false,
        trail: [],
        launchTime: 100
      },
      {
        x: w * 0.45,
        y: startY,
        vy: -9.8,
        targetY: 40,
        color: '#f43f5e',
        exploded: false,
        trail: [],
        launchTime: 500
      },
      {
        x: w * 0.75,
        y: startY,
        vy: -9.4,
        targetY: 50,
        color: '#00e5ff',
        exploded: false,
        trail: [],
        launchTime: 950
      },
      {
        x: w * 0.32,
        y: startY,
        vy: -9.0,
        targetY: 62,
        color: '#34d399',
        exploded: false,
        trail: [],
        launchTime: 1450
      },
      {
        x: w * 0.60,
        y: startY,
        vy: -9.6,
        targetY: 42,
        color: '#c084fc',
        exploded: false,
        trail: [],
        launchTime: 1950
      },
      {
        x: w * 0.82,
        y: startY,
        vy: -9.1,
        targetY: 58,
        color: '#facc15',
        exploded: false,
        trail: [],
        launchTime: 2450
      },
      {
        x: w * 0.18,
        y: startY,
        vy: -9.5,
        targetY: 48,
        color: '#f43f5e',
        exploded: false,
        trail: [],
        launchTime: 2950
      },
      {
        x: w * 0.50,
        y: startY,
        vy: -9.9,
        targetY: 38,
        color: '#ffffff',
        exploded: false,
        trail: [],
        launchTime: 3450
      }
    ];

    let rockets: RocketParticle[] = createRocketSet();
    const sparks: SparkParticle[] = [];
    const fallingSparkles: FallingSparkle[] = [];
    let lastCycleIndex = 0;

    // Spawn Burst of sparks
    const explodeRocket = (rx: number, ry: number, color: string) => {
      const sparkCount = 22;
      for (let i = 0; i < sparkCount; i++) {
        const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() * 0.2 - 0.1);
        const speed = 2.0 + Math.random() * 3.8;
        sparks.push({
          x: rx,
          y: ry,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: Math.random() > 0.3 ? color : palette[Math.floor(Math.random() * palette.length)],
          alpha: 1,
          decay: 0.016 + Math.random() * 0.02,
          size: 1.8 + Math.random() * 2.0
        });
      }

      // Spawn falling sparkling flakes around champion card
      for (let j = 0; j < 6; j++) {
        fallingSparkles.push({
          x: rx + (Math.random() * 60 - 30),
          y: ry + (Math.random() * 15 - 7),
          vx: (Math.random() - 0.5) * 0.6,
          vy: 0.7 + Math.random() * 1.2,
          color: palette[Math.floor(Math.random() * palette.length)],
          alpha: 1,
          size: 2.0 + Math.random() * 2.0,
          swayFreq: 0.03 + Math.random() * 0.03,
          swayPhase: Math.random() * Math.PI * 2
        });
      }
    };

    // Main Render Loop (Continuous Infinite Visual Loop)
    const render = (now: number) => {
      const totalElapsed = now - startTime;
      const currentCycleIndex = Math.floor(totalElapsed / cyclePeriod);
      const cycleElapsed = totalElapsed % cyclePeriod;

      // When crossing into a new cycle, reset rockets for the next loop
      if (currentCycleIndex !== lastCycleIndex) {
        lastCycleIndex = currentCycleIndex;
        rockets = createRocketSet();
      }

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Process & Draw Rockets
      rockets.forEach((r) => {
        if (r.exploded) return;

        if (cycleElapsed >= r.launchTime) {
          // Add current position to trail
          r.trail.push({ x: r.x, y: r.y, alpha: 1, size: 2.5 });
          if (r.trail.length > 7) r.trail.shift();

          // Move upward
          r.y += r.vy;
          r.vy += 0.08; // gravity

          // Draw trail
          r.trail.forEach((t, idx) => {
            t.alpha *= 0.82;
            canvasCtx.save();
            canvasCtx.globalAlpha = Math.max(0, t.alpha);
            canvasCtx.fillStyle = r.color;
            canvasCtx.shadowColor = r.color;
            canvasCtx.shadowBlur = 5;
            canvasCtx.beginPath();
            canvasCtx.arc(t.x, t.y, t.size * (idx / r.trail.length), 0, Math.PI * 2);
            canvasCtx.fill();
            canvasCtx.restore();
          });

          // Draw Rocket Head
          canvasCtx.save();
          canvasCtx.fillStyle = '#ffffff';
          canvasCtx.shadowColor = r.color;
          canvasCtx.shadowBlur = 10;
          canvasCtx.beginPath();
          canvasCtx.arc(r.x, r.y, 3, 0, Math.PI * 2);
          canvasCtx.fill();
          canvasCtx.restore();

          // Check apex / burst height
          if (r.y <= r.targetY || r.vy >= -1) {
            r.exploded = true;
            explodeRocket(r.x, r.y, r.color);
          }
        }
      });

      // 2. Draw Burst Sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.08; // Gravity
        s.vx *= 0.97;
        s.alpha -= s.decay;

        if (s.alpha <= 0) {
          sparks.splice(i, 1);
          continue;
        }

        canvasCtx.save();
        canvasCtx.globalAlpha = Math.max(0, s.alpha);
        canvasCtx.fillStyle = s.color;
        canvasCtx.shadowColor = s.color;
        canvasCtx.shadowBlur = 6;
        canvasCtx.beginPath();
        canvasCtx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        canvasCtx.fill();
        canvasCtx.restore();
      }

      // 3. Draw Falling Sparkles
      for (let i = fallingSparkles.length - 1; i >= 0; i--) {
        const f = fallingSparkles[i];
        f.y += f.vy;
        f.x += f.vx + Math.sin(f.y * f.swayFreq + f.swayPhase) * 0.5;
        f.alpha -= 0.009;

        if (f.alpha <= 0 || f.y > canvas.height) {
          fallingSparkles.splice(i, 1);
          continue;
        }

        canvasCtx.save();
        canvasCtx.globalAlpha = Math.max(0, f.alpha);
        canvasCtx.fillStyle = f.color;
        canvasCtx.shadowColor = f.color;
        canvasCtx.shadowBlur = 3;
        canvasCtx.beginPath();
        canvasCtx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
        canvasCtx.fill();
        canvasCtx.restore();
      }

      // Continuously request next frame (Loop Forever while mounted)
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    // CLEANUP ON UNMOUNT / CLOSE
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [triggerKey, autoPlay]);

  return (
    <div className="relative w-full overflow-visible pointer-events-none z-30">
      {/* Canvas Particle Overlay focused on Champion Card area */}
      <canvas
        ref={canvasRef}
        className="absolute inset-x-0 top-0 w-full h-[320px] pointer-events-none z-30"
      />

      {/* Header bar badge */}
      <div className="relative z-40 flex items-center justify-between gap-2 px-1 py-1 pointer-events-auto">
        <div className="flex items-center gap-1.5 text-[10px] text-yellow-300/90 font-mono font-bold bg-yellow-950/40 border border-yellow-500/30 px-2.5 py-1 rounded-full">
          <Sparkles className="w-3 h-3 text-yellow-400 animate-pulse" />
          <span>CHAMPION CELEBRATION</span>
        </div>
      </div>
    </div>
  );
};
