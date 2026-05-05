import { THEMES } from '../store';
import { NeuralNetwork } from './NeuralNetwork';

export class BirdBrain {
  public y = 0;
  public velocity = 0;
  public rotation = 0;
  public dead = false;
  public score = 0;
  public brain: NeuralNetwork;

  constructor(brain?: NeuralNetwork) {
    if (brain) {
      this.brain = brain;
    } else {
      this.brain = new NeuralNetwork(5, 8, 1);
    }
  }

  flap() {
    this.velocity = -6.5;
  }
}

export class AiTrainingEngine {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  private reqId: number = 0;
  
  public onGenerationComplete?: (bestBrain: NeuralNetwork, score: number) => void;
  public onScoreUpdate?: (score: number, alive: number, bestAllTimeScore: number, bestAllTimeGen: number) => void;

  private width: number;
  private height: number;
  private groundHeight = 100;
  private gravity = 0.3;
  private basePipeSpeed = 3;
  private basePipeGap = 160;

  private birds: BirdBrain[] = [];
  private pipes: Array<{ x: number, gapY: number }> = [];
  private frames = 0;
  private groundOffset = 0;
  private layerBackOffset = 0;
  private layerFrontOffset = 0;
  private clouds: Array<{ x: number, y: number, speed: number, size: number }> = [];
  private stars: Array<{ x: number, y: number, r: number, a: number, t: number }> = [];
  public generation = 1;
  public allTimeScore = 0; // Current run score
  
  public bestAllTimeBrain: NeuralNetwork | null = null;
  public bestAllTimeScoreValue = 0;
  public bestAllTimeGen = 1;

  private theme = THEMES.classic;
  public isRunning = false;

  public currentBatchSize = 100;

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

  public start(brains: NeuralNetwork[] = []) {
    this.isRunning = true;
    this.frames = 0;
    this.pipes = [];
    this.birds = [];
    
    if (brains.length > 0) {
      this.currentBatchSize = brains.length;
      for (let i = 0; i < brains.length; i++) {
        const b = new BirdBrain(brains[i]);
        b.y = this.height / 2;
        this.birds.push(b);
      }
    } else {
      for (let i = 0; i < this.currentBatchSize; i++) {
        const b = new BirdBrain();
        b.y = this.height / 2;
        this.birds.push(b);
      }
    }
    
    if (this.reqId) cancelAnimationFrame(this.reqId);
    this.loop();
  }

  public stop() {
    this.isRunning = false;
    if (this.reqId) cancelAnimationFrame(this.reqId);
  }

  private loop = () => {
    if (!this.isRunning) return;
    
    // Configurable fast-forward
    const cycles = 1; // Can increase this to train faster without rendering
    
    for (let i = 0; i < cycles; i++) {
      this.update();
    }
    
    this.draw();
    this.reqId = requestAnimationFrame(this.loop);
  };

  private update() {
    this.frames++;
    const floorY = this.height - this.groundHeight;

    let aliveCount = 0;
    let maxScore = 0;

    for (let bird of this.birds) {
      if (bird.dead) continue;
      aliveCount++;
      if (bird.score > maxScore) maxScore = bird.score;
    }

    if (maxScore > this.allTimeScore) this.allTimeScore = maxScore;
    if (this.onScoreUpdate) this.onScoreUpdate(maxScore, aliveCount, this.bestAllTimeScoreValue, this.bestAllTimeGen);

    if (aliveCount === 0) {
      this.nextGeneration();
      return;
    }

    const speedDifficultyRatio = Math.min(maxScore / 20, 1);
    const currentPipeSpeed = this.basePipeSpeed + (speedDifficultyRatio * 3);
    const splitRatio = Math.min(maxScore / 30, 1);
    const currentPipeGap = Math.max(100, this.basePipeGap - (splitRatio * 40));

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

    // AI Logic
    let closestPipe: { x: number, gapY: number } | null = null;
    for (let p of this.pipes) {
      if (p.x + 60 > 40 - 14) { // Bird X is 40
        closestPipe = p;
        break;
      }
    }

    for (let bird of this.birds) {
      if (bird.dead) continue;
      
      bird.velocity += this.gravity;
      bird.y += bird.velocity;

      // Predict if flap needed
      if (closestPipe) {
        const inputs = [
          bird.y / this.height,
          bird.velocity / 10,
          closestPipe.gapY / this.height,
          (closestPipe.gapY + currentPipeGap) / this.height,
          closestPipe.x / this.width
        ];
        
        const output = bird.brain.predict(inputs);
        if (output[0] > 0.5) {
          bird.flap();
        }
      }

      if (bird.velocity < 0) {
        bird.rotation = -Math.PI / 6;
      } else {
        bird.rotation += 0.06;
        if (bird.rotation > Math.PI / 2) bird.rotation = Math.PI / 2;
      }

      // Collision
      if (bird.y + 12 >= floorY || bird.y - 12 <= 0) {
        bird.dead = true;
      }
    }

    // Pipe gen
    if (this.pipes.length === 0 || this.width - this.pipes[this.pipes.length - 1].x >= 200) {
      const minPole = 50;
      const maxPole = floorY - currentPipeGap - minPole;
      this.pipes.push({
        x: this.width,
        gapY: Math.floor(Math.random() * (maxPole - minPole + 1) + minPole)
      });
    }

    const prevFirstPipeX = this.pipes.length > 0 ? this.pipes[0].x : 0;
    for (let i = this.pipes.length - 1; i >= 0; i--) {
      this.pipes[i].x -= currentPipeSpeed;

      // Collision
      const p = this.pipes[i];
      for (let bird of this.birds) {
        if (bird.dead) continue;
        const bLeft = 40 - 10;
        const bRight = 40 + 10;
        const bTop = bird.y - 10;
        const bBottom = bird.y + 10;

        if (bRight > p.x && bLeft < p.x + 60) {
          if (bTop < p.gapY || bBottom > p.gapY + currentPipeGap) {
            bird.dead = true;
          }
        }
      }

      if (p.x + 60 < 0) {
        this.pipes.splice(i, 1);
      }
    }

    if (this.pipes.length > 0) {
      if (prevFirstPipeX > 40 && this.pipes[0].x <= 40) {
        for (let bird of this.birds) {
          if (!bird.dead) bird.score++;
        }
      }
    }
    
    // Force death if taking too long to score (stuck logic)
    for (let bird of this.birds) {
        if (!bird.dead) {
            bird.score += 0.001; // Reward standing alive a tiny bit
        }
    }
  }

  private nextGeneration() {
    // Evaluation 
    let bestBird = this.birds[0];
    for (let bird of this.birds) {
      if (bird.score > bestBird.score) {
        bestBird = bird;
      }
    }

    if (bestBird.score > this.bestAllTimeScoreValue) {
       this.bestAllTimeScoreValue = Math.floor(bestBird.score);
       this.bestAllTimeBrain = bestBird.brain.copy();
       this.bestAllTimeGen = this.generation;
    }

    if (this.onGenerationComplete) {
      this.onGenerationComplete(this.bestAllTimeBrain ? this.bestAllTimeBrain.copy() : bestBird.brain.copy(), Math.floor(bestBird.score));
    }

    this.generation++;
    const nextBrains: NeuralNetwork[] = [];
    
    // Elitism: keep best of all time AND best of current generation
    if (this.bestAllTimeBrain) {
       nextBrains.push(this.bestAllTimeBrain.copy());
    }
    nextBrains.push(bestBird.brain.copy());

    for (let i = nextBrains.length; i < this.currentBatchSize; i++) {
        // Randomly choose between mutating the all-time best or the current generation's best
        const parent = (this.bestAllTimeBrain && Math.random() < 0.5) ? this.bestAllTimeBrain.copy() : bestBird.brain.copy();
        const child = parent;
        child.mutate(0.1); 
        nextBrains.push(child);
    }
    
    this.start(nextBrains);
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
               h = this.height * heightRatio * (0.35 + 0.3 * Math.sin(angle * 2) + 0.15 * Math.sin(angle * 5));
            } else {
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
    this.ctx.translate(repeatWidth, 0);
    drawLayer();
    this.ctx.restore();
  }

  private draw() {
    const floorY = this.height - this.groundHeight;
    const splitRatio = Math.min(Math.floor(this.allTimeScore) / 30, 1);
    const currentPipeGap = Math.max(100, this.basePipeGap - (splitRatio * 40));

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

    for (let bird of this.birds) {
      if (bird.dead) continue;

      this.ctx.save();
      this.ctx.translate(40, bird.y);
      this.ctx.rotate(bird.rotation);

      // Tail
      this.ctx.fillStyle = this.theme.birdWing;
      this.ctx.beginPath();
      let tailWag = Math.sin(this.frames * 0.5) * 2;
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
      this.ctx.fillStyle = this.theme.birdBody;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 14, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();

      // Wing
      this.ctx.fillStyle = this.theme.birdWing;
      this.ctx.beginPath();
      const wingYOffset = Math.sin(this.frames * 0.8) * 5;
      const wingRotate = Math.sin(this.frames * 0.8) * 0.3;
      
      this.ctx.save();
      this.ctx.translate(-4, 2 + wingYOffset);
      this.ctx.rotate(wingRotate);
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
      
      this.ctx.fillStyle = '#000';
      this.ctx.beginPath();
      this.ctx.arc(8, -6, 2, 0, Math.PI * 2);
      this.ctx.fill();

      // Beak
      this.ctx.fillStyle = '#fdb103';
      this.ctx.beginPath();
      this.ctx.moveTo(12, 0);
      this.ctx.lineTo(22, 2);
      this.ctx.lineTo(12, 6);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.restore();
    }
  }
}
