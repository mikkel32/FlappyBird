import { THEMES } from '../store';
import { audioContext } from './AudioEngine';
import { NeuralNetwork } from './NeuralNetwork';

export class GameEngine {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  private reqId: number = 0;
  public state: 'idle' | 'playing' | 'gameover' = 'idle';

  // State callbacks
  public onScore?: (score: number) => void;
  public onGameOver?: (jumps: number) => void;

  // Game configuration
  private width: number;
  private height: number;
  private groundHeight = 100;
  private gravity = 0.3;
  private jumpStrength = -6.5;
  private basePipeSpeed = 3;
  private basePipeGap = 160;

  // Dynamic game state
  private birdY = 0;
  private birdVelocity = 0;
  private birdRotation = 0;
  private pipes: Array<{ x: number, gapY: number }> = [];
  private score = 0;
  private currentJumps = 0;
  private frames = 0;
  private groundOffset = 0;
  private layerBackOffset = 0;
  private layerFrontOffset = 0;
  private flashFrames = 0;
  private clouds: Array<{ x: number, y: number, speed: number, size: number }> = [];
  private stars: Array<{ x: number, y: number, r: number, a: number, t: number }> = [];
  private paused = false;
  private isDead = false;

  // Appearance
  private theme = THEMES.classic;
  public autoplay = false;
  public brain: NeuralNetwork | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.width = canvas.width;
    this.height = Math.min(canvas.height, 700);
    this.initClouds();
    this.initStars();
  }

  private initClouds() {
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
       this.clouds.push({
         x: Math.random() * this.width * 1.5,
         y: Math.random() * (this.height * 0.4),
         speed: 0.1 + Math.random() * 0.3,
         size: 15 + Math.random() * 30
       });
    }
  }

  private initStars() {
    this.stars = [];
    for (let i = 0; i < 40; i++) {
       this.stars.push({
         x: Math.random() * this.width,
         y: Math.random() * (this.height * 0.7),
         r: 0.5 + Math.random() * 1.5,
         a: Math.random(),
         t: Math.random() * Math.PI * 2
       });
    }
  }

  public setTheme(themeId: keyof typeof THEMES) {
    this.theme = THEMES[themeId];
  }

  public startIdle() {
    cancelAnimationFrame(this.reqId);
    this.state = 'idle';
    this.birdY = this.height / 2;
    this.birdVelocity = 0;
    this.birdRotation = 0;
    this.pipes = [];
    this.score = 0;
    this.groundOffset = 0;
    this.isDead = false;
    this.paused = false;
    this.reqId = requestAnimationFrame(this.loop);
  }

  public start() {
    cancelAnimationFrame(this.reqId);
    this.state = 'playing';
    this.birdY = this.height / 2;
    this.birdVelocity = 0;
    this.birdRotation = 0;
    this.pipes = [];
    this.score = 0;
    this.currentJumps = 0;
    this.frames = 0;
    this.groundOffset = 0;
    this.isDead = false;
    this.paused = false;
    if (this.onScore) this.onScore(0);
    this.loop();
  }

  public stop() {
    cancelAnimationFrame(this.reqId);
  }

  public togglePause() {
    if (this.isDead) return;
    this.paused = !this.paused;
    if (!this.paused) {
      this.loop();
    } else {
      this.draw();
    }
  }

  public isPaused() {
    return this.paused;
  }

  public flap() {
    if (this.paused || this.isDead || this.state !== 'playing') return;
    this.birdVelocity = this.jumpStrength;
    this.birdRotation = -Math.PI / 4; // Point up
    this.currentJumps++;
    audioContext.playFlap();
  }

  private loop = () => {
    if (this.paused && this.state === 'playing') return;
    this.update();
    this.draw();
    if (!this.isDead || this.birdY + 12 < this.height - this.groundHeight || this.state === 'idle') {
      this.reqId = requestAnimationFrame(this.loop);
    } else {
      // Only fire gameover when it completely rests on the ground
      if (this.onGameOver) this.onGameOver(this.currentJumps);
      this.state = 'gameover';
    }
  };

  private update() {
    this.frames++;
    if (this.flashFrames > 0) this.flashFrames--;
    
    const floorY = this.height - this.groundHeight;

    if (this.state === 'idle') {
      // Subtle idle bobbing
      this.birdY = (this.height / 2) + Math.sin(this.frames * 0.04) * 4;
      this.birdRotation = Math.sin(this.frames * 0.04) * 0.1;
      
      // Slower background movement in idle
      const idleSpeed = this.basePipeSpeed * 0.2;
      this.groundOffset = (this.groundOffset + idleSpeed) % 40;
      this.layerBackOffset = this.layerBackOffset + idleSpeed * 0.15;
      this.layerFrontOffset = this.layerFrontOffset + idleSpeed * 0.4;

      for (let c of this.clouds) {
        c.x -= c.speed * 0.3;
        if (c.x + c.size < 0) {
          c.x = this.width + c.size;
        }
      }

      for (let s of this.stars) {
         s.t += 0.02;
         s.a = 0.5 + Math.abs(Math.sin(s.t)) * 0.5;
         s.x -= idleSpeed * 0.02;
         if (s.x < 0) s.x = this.width + 10;
      }

      return;
    }
    
    // Death falling state
    if (this.isDead) {
      this.birdVelocity += this.gravity * 1.5;
      this.birdY += this.birdVelocity;
      this.birdRotation += 0.15;
      if (this.birdRotation > Math.PI / 2) this.birdRotation = Math.PI / 2;
      
      if (this.birdY + 12 >= floorY) {
         this.birdY = floorY - 12;
      }
      return; // Stop updating pipes and other obstacles
    }

    // Difficulty scaling
    const speedDifficultyRatio = Math.min(this.score / 20, 1); // Max out at score=20
    const currentPipeSpeed = this.basePipeSpeed + (speedDifficultyRatio * 3);
    const splitRatio = Math.min(this.score / 30, 1);
    const currentPipeGap = Math.max(100, this.basePipeGap - (splitRatio * 40));

    // Ground and Parallax movement
    this.groundOffset = (this.groundOffset + currentPipeSpeed) % 40;
    this.layerBackOffset = this.layerBackOffset + currentPipeSpeed * 0.15;
    this.layerFrontOffset = this.layerFrontOffset + currentPipeSpeed * 0.4;

    for (let s of this.stars) {
       s.t += 0.03;
       s.a = 0.5 + Math.abs(Math.sin(s.t)) * 0.5;
       s.x -= currentPipeSpeed * 0.02;
       if (s.x < 0) s.x = this.width + 10;
    }

    for (let c of this.clouds) {
      c.x -= c.speed;
      if (c.x + c.size < 0) {
        c.x = this.width + c.size;
        c.y = Math.random() * ((this.height - this.groundHeight) / 2);
      }
    }

    // Bird physics
    this.birdVelocity += this.gravity;
    this.birdY += this.birdVelocity;

    if (this.autoplay && !this.isDead && this.state === 'playing') {
       this.doAutoplayLogic(currentPipeGap, floorY);
    }

    // Classic rotation behavior: snap up on flap, then rotate down gradually
    if (this.birdVelocity < 0) {
       this.birdRotation = -Math.PI / 6;
    } else {
       this.birdRotation += 0.06;
       if (this.birdRotation > Math.PI / 2) this.birdRotation = Math.PI / 2;
    }

    // Floor / Ceiling collision
    if (this.birdY + 12 >= floorY || this.birdY - 12 <= 0) {
      if (this.birdY + 12 >= floorY) {
         this.birdY = floorY - 12; // Snap to ground
      }
      this.triggerGameOver();
    }

    // Pipe generation
    if (this.pipes.length === 0 || this.width - this.pipes[this.pipes.length - 1].x >= 200) {
      const minPole = 50;
      const maxPole = floorY - currentPipeGap - minPole;
      this.pipes.push({
        x: this.width,
        gapY: Math.floor(Math.random() * (maxPole - minPole + 1) + minPole)
      });
    }

    // Update pipes & Check Collisions
    for (let i = 0; i < this.pipes.length; i++) {
      const p = this.pipes[i];
      p.x -= currentPipeSpeed;

      // Collision box for bird roughly a 20x20 box centered
      const bLeft = 40 - 10;
      const bRight = 40 + 10;
      const bTop = this.birdY - 10;
      const bBottom = this.birdY + 10;

      const pLeft = p.x;
      const pRight = p.x + 60;
      const pTopEnd = p.gapY;
      const pBottomStart = p.gapY + currentPipeGap;

      // Inside pipe horizontal boundaries
      if (bRight > pLeft && bLeft < pRight) {
        if (bTop < pTopEnd || bBottom > pBottomStart) {
          this.triggerGameOver();
          return;
        }
      }

      // Scoring
      if (p.x + 60 < 40 && !(p as any).scored) {
        this.score++;
        (p as any).scored = true;
        audioContext.playScore();
        if (this.onScore) this.onScore(this.score);
      }
    }

    // Remove off-screen pipes
    if (this.pipes.length > 0 && this.pipes[0].x < -60) {
      this.pipes.shift();
    }
  }

  private drawParallax(offset: number, color: string, floorY: number, heightRatio: number, isCity: boolean) {
    const repeatWidth = 840;
    const drawX = -(offset % repeatWidth);
    
    // Create an overlay gradient to give depth
    const overlayGrad = this.ctx.createLinearGradient(0, floorY - (this.height * heightRatio), 0, floorY);
    overlayGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
    overlayGrad.addColorStop(1, 'rgba(0,0,0,0.3)');

    const drawLayer = () => {
      if (isCity) {
         for(let x = 0; x < repeatWidth; x+= 60) {
            const h = this.height * heightRatio * (0.3 + 0.7 * Math.abs(Math.sin(x * 12.3) * Math.cos(x * 4.5)));
            
            this.ctx.fillStyle = color;
            this.ctx.fillRect(x, floorY - h, 50, h);
            this.ctx.fillStyle = overlayGrad;
            this.ctx.fillRect(x, floorY - h, 50, h);

            if (heightRatio > 0.5) {
                // Antenna
                if (Math.sin(x * 9.1) > 0) {
                   this.ctx.fillStyle = color;
                   this.ctx.fillRect(x + 20, floorY - h - 20, 4, 20);
                   // Beacon
                   if (Math.sin(this.frames * 0.05 + x) > 0.5) {
                       this.ctx.fillStyle = 'rgba(255, 50, 50, 0.9)';
                       this.ctx.fillRect(x + 19, floorY - h - 22, 6, 6);
                   }
                }

                // Windows
                for (let wy = floorY - h + 15; wy < floorY - 20; wy += 25) {
                   for (let wx = x + 8; wx < x + 42; wx += 16) {
                       const isLit = Math.sin(wx * 23.4 + wy * 11.5) > 0;
                       if (isLit) {
                           this.ctx.fillStyle = (this.theme as any).id === 'neon' ? 'rgba(0, 255, 204, 0.6)' : 'rgba(255, 255, 150, 0.6)';
                           this.ctx.fillRect(wx, wy, 10, 15);
                           this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                           this.ctx.fillRect(wx + 2, wy + 2, 6, 11);
                       }
                   }
                }
            }
         }
      } else {
         this.ctx.beginPath();
         this.ctx.moveTo(0, floorY);
         for(let x = 0; x <= repeatWidth; x += 20) {
            const angle = (x / repeatWidth) * Math.PI * 2;
            let h = 0;
            if (heightRatio > 0.5) {
               // Front: Rolling hills
               h = this.height * heightRatio * (0.35 + 0.3 * Math.sin(angle * 2) + 0.15 * Math.sin(angle * 5));
            } else {
               // Back: Jagged mountains
               h = this.height * heightRatio * (0.3 + 0.4 * (1 - Math.abs(Math.sin(angle * 3))) + 0.2 * Math.cos(angle * 7));
            }
            this.ctx.lineTo(x, floorY - h);
         }
         this.ctx.lineTo(repeatWidth, floorY);
         
         this.ctx.fillStyle = color;
         this.ctx.fill();
         this.ctx.fillStyle = overlayGrad;
         this.ctx.fill();
         
         this.ctx.lineWidth = 2;
         this.ctx.strokeStyle = 'rgba(255,255,255,0.05)';
         this.ctx.stroke();
      }
    };

    this.ctx.save();
    this.ctx.translate(drawX, 0);
    drawLayer();
    this.ctx.translate(repeatWidth, 0);
    drawLayer();
    // In case the screen is wider than expected
    this.ctx.translate(repeatWidth, 0);
    drawLayer();
    this.ctx.restore();
  }

  private draw() {
    const floorY = this.height - this.groundHeight;

    // Background Gradient Sky
    if (this.theme.bgBottom) {
      const grad = this.ctx.createLinearGradient(0, 0, 0, floorY);
      grad.addColorStop(0, this.theme.bg);
      grad.addColorStop(1, this.theme.bgBottom);
      this.ctx.fillStyle = grad;
    } else {
      this.ctx.fillStyle = this.theme.bg;
    }
    this.ctx.fillRect(0, 0, this.width, this.height);

    if (this.theme.hasStars) {
      this.ctx.fillStyle = '#fff';
      for (let s of this.stars) {
         this.ctx.globalAlpha = s.a;
         this.ctx.beginPath();
         this.ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
         this.ctx.fill();
      }
      this.ctx.globalAlpha = 1.0;
    }

    // Celestial body
    this.ctx.save();
    if (this.theme.hasStars) {
         // Full Moon
         const moonX = this.width * 0.8;
         const moonY = this.height * 0.25;
         
         this.ctx.fillStyle = 'rgba(230, 230, 240, 0.1)';
         this.ctx.beginPath();
         this.ctx.arc(moonX, moonY, 45, 0, Math.PI * 2);
         this.ctx.fill();

         this.ctx.fillStyle = 'rgba(230, 230, 240, 0.9)';
         this.ctx.beginPath();
         this.ctx.arc(moonX, moonY, 25, 0, Math.PI * 2);
         this.ctx.fill();
         
         // Craters
         this.ctx.fillStyle = 'rgba(180, 180, 190, 0.5)';
         this.ctx.beginPath();
         this.ctx.arc(moonX - 8, moonY - 5, 5, 0, Math.PI * 2);
         this.ctx.arc(moonX + 5, moonY + 8, 7, 0, Math.PI * 2);
         this.ctx.arc(moonX + 10, moonY - 8, 4, 0, Math.PI * 2);
         this.ctx.fill();
    } else {
         // Sun
         const sunX = this.width * 0.2;
         const sunY = this.height * 0.35;
         const pulse = Math.sin(this.frames * 0.02) * 5;
         
         this.ctx.fillStyle = 'rgba(255, 210, 0, 0.15)';
         this.ctx.beginPath();
         this.ctx.arc(sunX, sunY, 70 + pulse * 2, 0, Math.PI * 2);
         this.ctx.fill();
         
         this.ctx.fillStyle = 'rgba(255, 210, 0, 0.3)';
         this.ctx.beginPath();
         this.ctx.arc(sunX, sunY, 50 + pulse, 0, Math.PI * 2);
         this.ctx.fill();

         this.ctx.fillStyle = 'rgba(255, 235, 100, 0.9)';
         this.ctx.beginPath();
         this.ctx.arc(sunX, sunY, 35, 0, Math.PI * 2);
         this.ctx.fill();
    }
    this.ctx.restore();

    // Parallax background
    if (this.theme.mtnBack) {
      this.drawParallax(this.layerBackOffset, this.theme.mtnBack, floorY, 0.4, !!this.theme.cityscape);
      this.drawParallax(this.layerFrontOffset, this.theme.mtnFront, floorY, 0.65, !!this.theme.cityscape);
    }

    // Bottom fog/haze for depth
    const hazeGrad = this.ctx.createLinearGradient(0, floorY - 100, 0, floorY);
    hazeGrad.addColorStop(0, 'rgba(255,255,255,0)');
    hazeGrad.addColorStop(1, this.theme.bgBottom ? `${this.theme.bgBottom}D0` : `${this.theme.bg}D0`);
    this.ctx.fillStyle = hazeGrad;
    this.ctx.fillRect(0, floorY - 100, this.width, 100);

    // Clouds
    this.ctx.fillStyle = (this.theme as any).cloudColor || 'rgba(255,255,255,0.4)';
    for (let c of this.clouds) {
      this.ctx.beginPath();
      this.ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
      this.ctx.arc(c.x + c.size * 0.5, c.y - c.size * 0.3, c.size * 0.7, 0, Math.PI * 2);
      this.ctx.arc(c.x + c.size * 1.1, c.y, c.size * 0.8, 0, Math.PI * 2);
      this.ctx.arc(c.x + c.size * 0.5, c.y + c.size * 0.2, c.size * 0.6, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Pipes
    for (const p of this.pipes) {
      this.ctx.fillStyle = this.theme.pipeTop;
      this.ctx.strokeStyle = this.theme.pipeBorder;
      this.ctx.lineWidth = 3;

      // Top pipe
      let pTopH = p.gapY;
      this.ctx.fillRect(p.x, 0, 60, pTopH);
      this.ctx.strokeRect(p.x, 0, 60, pTopH);

      // Bottom pipe
      const speedDifficultyRatio = Math.min(this.score / 20, 1);
      const splitRatio = Math.min(this.score / 30, 1);
      const currentPipeGap = Math.max(100, this.basePipeGap - (splitRatio * 40));
      
      let pBottomY = p.gapY + currentPipeGap;
      let pBottomH = floorY - pBottomY;
      if (pBottomH > 0) {
        this.ctx.fillStyle = this.theme.pipeBottom;
        this.ctx.fillRect(p.x, pBottomY, 60, pBottomH);
        this.ctx.strokeRect(p.x, pBottomY, 60, pBottomH);
      }
    }

    // Ground
    this.ctx.fillStyle = this.theme.groundTop;
    this.ctx.fillRect(0, floorY, this.width, 20);
    this.ctx.fillStyle = this.theme.groundBorder;
    this.ctx.fillRect(0, floorY, this.width, 4); // border top
    this.ctx.fillRect(0, floorY + 20, this.width, 4); // border bottom

    this.ctx.fillStyle = this.theme.groundBottom;
    this.ctx.fillRect(0, floorY + 24, this.width, this.groundHeight - 24);

    // Ground pattern (stripes)
    this.ctx.strokeStyle = this.theme.groundBorder;
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    for (let x = -40; x < this.width + 40; x += 40) {
      this.ctx.moveTo(x - this.groundOffset + 20, floorY + 4);
      this.ctx.lineTo(x - this.groundOffset, floorY + 20);
    }
    this.ctx.stroke();

    // Bird
    this.ctx.save();
    this.ctx.translate(40, this.birdY);
    this.ctx.rotate(this.birdRotation);

    // Tail
    this.ctx.fillStyle = this.theme.birdWing;
    this.ctx.beginPath();
    let tailWag = 0;
    if (this.state === 'playing' && !this.isDead) {
      tailWag = Math.sin(this.frames * 0.5) * 2;
    }
    this.ctx.moveTo(-12, 0);
    this.ctx.lineTo(-20, -4 + tailWag);
    this.ctx.lineTo(-18, 2 + tailWag);
    this.ctx.lineTo(-22, 6 + tailWag);
    this.ctx.lineTo(-12, 8);
    this.ctx.fill();
    this.ctx.strokeStyle = '#000';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Body
    this.ctx.fillStyle = this.flashFrames > 0 ? '#ff4040' : this.theme.birdBody;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 14, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

      // Wing
    this.ctx.fillStyle = this.theme.birdWing;
    this.ctx.beginPath();
    // animate wing if not dead
    const isIdle = this.state === 'idle';
    const isFalling = this.birdVelocity > 1.5;
    let isFlapping = !this.isDead && this.state === 'playing';
    
    if (isFlapping && isFalling) {
        isFlapping = false; // Glide!
    }

    let wingYOffset = 0;
    let wingRotate = 0;
    if (isIdle) {
       wingYOffset = Math.sin(this.frames * 0.15) * 2;
       wingRotate = Math.sin(this.frames * 0.15) * 0.05;
    } else if (isFlapping) {
       wingYOffset = Math.sin(this.frames * 0.8) * 5;
       wingRotate = Math.sin(this.frames * 0.8) * 0.3;
    } else if (isFalling && !this.isDead) {
       wingYOffset = -2; // Wings up when falling
       wingRotate = -0.3;
    }

    this.ctx.save();
    this.ctx.translate(-4, 2 + wingYOffset);
    if (!this.isDead) this.ctx.rotate(wingRotate);
    this.ctx.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();

    // Eye
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(6, -6, 5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    // Dead eye x logic
    if (this.isDead) {
       this.ctx.strokeStyle = '#000';
       this.ctx.beginPath();
       this.ctx.moveTo(4, -8); this.ctx.lineTo(8, -4);
       this.ctx.moveTo(8, -8); this.ctx.lineTo(4, -4);
       this.ctx.stroke();
    } else {
       this.ctx.fillStyle = '#000';
       this.ctx.beginPath();
       this.ctx.arc(8, -6, 2, 0, Math.PI * 2);
       this.ctx.fill();
    }

    // Beak
    this.ctx.fillStyle = '#fdb103';
    this.ctx.beginPath();
    this.ctx.moveTo(12, 0);
    this.ctx.lineTo(22, 2);
    this.ctx.lineTo(12, 6);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.restore();

    // Damage flash
    if (this.flashFrames > 0) {
      this.ctx.fillStyle = `rgba(255, 255, 255, ${this.flashFrames * 0.15})`;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
    
    if (this.paused && this.state === 'playing') {
       this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
       this.ctx.fillRect(0, 0, this.width, this.height);
       
       this.ctx.font = 'bold 36px "Courier New", Courier, monospace';
       this.ctx.fillStyle = '#fff';
       this.ctx.textAlign = 'center';
       this.ctx.textBaseline = 'middle';
       this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
       this.ctx.shadowBlur = 4;
       this.ctx.shadowOffsetX = 2;
       this.ctx.shadowOffsetY = 2;
       this.ctx.fillText('PAUSED', this.width / 2, this.height / 2);
       this.ctx.shadowBlur = 0;
       this.ctx.shadowOffsetX = 0;
       this.ctx.shadowOffsetY = 0;
    }
  }

  private triggerGameOver() {
    if (this.isDead) return;
    this.isDead = true;
    this.flashFrames = 5;
    this.birdVelocity = Math.max(-4, Number(this.birdVelocity) - 4); // Small bounce up when dying
    audioContext.playCrash();
  }

  private doAutoplayLogic(currentPipeGap: number, floorY: number) {
     const birdX = 40;
     let nextPipe = null;
     for (let p of this.pipes) {
         if (p.x + 60 > birdX - 14) {
             nextPipe = p;
             break;
         }
     }

     if (this.brain && nextPipe) {
        const inputs = [
          this.birdY / this.height,
          this.birdVelocity / 10,
          nextPipe.gapY / this.height,
          (nextPipe.gapY + currentPipeGap) / this.height,
          nextPipe.x / this.width
        ];
        const output = this.brain.predict(inputs);
        if (output[0] > 0.5) {
          this.flap();
        }
        return;
     }

     if (nextPipe) {
         const gapCenter = nextPipe.gapY + currentPipeGap * 0.55; 
         
         // If we are way below the target (need to climb fast)
         if (this.birdY > gapCenter + 40) {
             // Flap earlier to climb faster (don't wait for velocity to be >= 0)
             if (this.birdVelocity > -3) {
                 this.flap();
             }
         } else if (this.birdY > gapCenter + 10) {
             // Normal maintain level
             if (this.birdVelocity >= 0 && this.birdY - 60 > nextPipe.gapY) {
                 this.flap();
             }
         }
         
         // Emergency avoid bottom pipe
         const futureY = this.birdY + this.birdVelocity * 3;
         if (futureY > nextPipe.gapY + currentPipeGap - 18 && this.birdVelocity >= 0) {
             this.flap();
         }
     } else {
         // No pipes, stay around the middle
         if (this.birdY > this.height / 2 && this.birdVelocity >= 0) {
             this.flap();
         }
     }
  }
}
