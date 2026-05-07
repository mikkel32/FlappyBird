export class NeuralNetwork {
  inputNodes: number;
  hiddenNodes: number;
  outputNodes: number;

  // Flattened TypedArrays for extreme cache-locality & V8 engine speed
  weightsIH: Float32Array;
  weightsHO: Float32Array;
  biasH: Float32Array;
  biasO: Float32Array;

  constructor(inputNodes: number, hiddenNodes: number, outputNodes: number) {
    this.inputNodes = inputNodes;
    this.hiddenNodes = hiddenNodes;
    this.outputNodes = outputNodes;

    this.weightsIH = new Float32Array(this.hiddenNodes * this.inputNodes);
    this.weightsHO = new Float32Array(this.outputNodes * this.hiddenNodes);
    this.biasH = new Float32Array(this.hiddenNodes);
    this.biasO = new Float32Array(this.outputNodes);

    this.initializeGlorot();
  }

  // Glorot/Xavier Initialization: Starts the brains close to an optimal mathematical state
  private initializeGlorot() {
    const limitIH = Math.sqrt(6 / (this.inputNodes + this.hiddenNodes));
    for (let i = 0; i < this.weightsIH.length; i++) {
      this.weightsIH[i] = (Math.random() * 2 - 1) * limitIH;
    }

    const limitHO = Math.sqrt(6 / (this.hiddenNodes + this.outputNodes));
    for (let i = 0; i < this.weightsHO.length; i++) {
      this.weightsHO[i] = (Math.random() * 2 - 1) * limitHO;
    }
  }

  predict(inputs: number[]): Float32Array {
    const hidden = new Float32Array(this.hiddenNodes);
    
    // Input -> Hidden Pass (ReLU Activation)
    for (let i = 0; i < this.hiddenNodes; i++) {
      let sum = this.biasH[i];
      const offset = i * this.inputNodes;
      for (let j = 0; j < this.inputNodes; j++) {
        sum += this.weightsIH[offset + j] * inputs[j];
      }
      hidden[i] = sum > 0 ? sum : 0; // ReLU totally prevents vanishing gradients
    }

    // Hidden -> Output Pass (Sigmoid Activation)
    const outputs = new Float32Array(this.outputNodes);
    for (let i = 0; i < this.outputNodes; i++) {
      let sum = this.biasO[i];
      const offset = i * this.hiddenNodes;
      for (let j = 0; j < this.hiddenNodes; j++) {
        sum += this.weightsHO[offset + j] * hidden[j];
      }
      outputs[i] = 1 / (1 + Math.exp(-sum)); // Maps to a clean 0.0 to 1.0 percentage
    }

    return outputs;
  }

  clone(): NeuralNetwork {
    const nn = new NeuralNetwork(this.inputNodes, this.hiddenNodes, this.outputNodes);
    nn.weightsIH.set(this.weightsIH);
    nn.weightsHO.set(this.weightsHO);
    nn.biasH.set(this.biasH);
    nn.biasO.set(this.biasO);
    return nn;
  }

  copy(): NeuralNetwork {
    return this.clone();
  }

  // Gaussian Mutation: Fine-tunes weights smoothly instead of chaotic destruction
  mutate(rate: number, intensity: number = 0.1) {
    const applyGaussian = (arr: Float32Array) => {
      for (let i = 0; i < arr.length; i++) {
        if (Math.random() < rate) {
          // Bates distribution approximation for fast, organic pseudo-Gaussian noise
          const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 2;
          arr[i] += noise * intensity;
        }
      }
    };
    applyGaussian(this.weightsIH);
    applyGaussian(this.weightsHO);
    applyGaussian(this.biasH);
    applyGaussian(this.biasO);
  }

  crossover(parentB: NeuralNetwork): NeuralNetwork {
    return NeuralNetwork.crossover(this, parentB);
  }

  static crossover(parentA: NeuralNetwork, parentB: NeuralNetwork): NeuralNetwork {
    const child = new NeuralNetwork(parentA.inputNodes, parentA.hiddenNodes, parentA.outputNodes);
    const cross = (arrA: Float32Array, arrB: Float32Array, dest: Float32Array) => {
      for (let i = 0; i < dest.length; i++) dest[i] = Math.random() < 0.5 ? arrA[i] : arrB[i];
    };
    cross(parentA.weightsIH, parentB.weightsIH, child.weightsIH);
    cross(parentA.weightsHO, parentB.weightsHO, child.weightsHO);
    cross(parentA.biasH, parentB.biasH, child.biasH);
    cross(parentA.biasO, parentB.biasO, child.biasO);
    return child;
  }

  serialize(): string {
    return JSON.stringify({
      weightsIH: Array.from(this.weightsIH),
      weightsHO: Array.from(this.weightsHO),
      biasH: Array.from(this.biasH),
      biasO: Array.from(this.biasO)
    });
  }

  static deserialize(data: string, inputs: number, hidden: number, outputs: number): NeuralNetwork {
    const parsed = JSON.parse(data);
    const nn = new NeuralNetwork(inputs, hidden, outputs);
    nn.weightsIH.set(parsed.weightsIH);
    nn.weightsHO.set(parsed.weightsHO);
    nn.biasH.set(parsed.biasH);
    nn.biasO.set(parsed.biasO);
    return nn;
  }
}

