export class NeuralNetwork {
  inputNodes: number;
  hiddenNodes: number;
  outputNodes: number;
  weightsIH: number[][]; // Weights Input to Hidden
  weightsHO: number[][]; // Weights Hidden to Output
  biasH: number[];       // Bias Hidden
  biasO: number[];       // Bias Output

  constructor(inputs: number, hidden: number, outputs: number) {
    this.inputNodes = inputs;
    this.hiddenNodes = hidden;
    this.outputNodes = outputs;

    this.weightsIH = Array.from({ length: this.hiddenNodes }, () =>
      Array.from({ length: this.inputNodes }, () => Math.random() * 2 - 1)
    );
    this.weightsHO = Array.from({ length: this.outputNodes }, () =>
      Array.from({ length: this.hiddenNodes }, () => Math.random() * 2 - 1)
    );
    this.biasH = Array.from({ length: this.hiddenNodes }, () => Math.random() * 2 - 1);
    this.biasO = Array.from({ length: this.outputNodes }, () => Math.random() * 2 - 1);
  }

  predict(inputArray: number[]): number[] {
    // Input to Hidden
    const hiddenInputs = this.weightsIH.map((row, i) =>
      row.reduce((sum, weight, j) => sum + weight * inputArray[j], 0) + this.biasH[i]
    );
    const hiddenOutputs = hiddenInputs.map(this.tanh);

    // Hidden to Output
    const outputInputs = this.weightsHO.map((row, i) =>
      row.reduce((sum, weight, j) => sum + weight * hiddenOutputs[j], 0) + this.biasO[i]
    );
    const outputs = outputInputs.map(this.sigmoid);

    return outputs;
  }

  tanh(x: number) {
    return Math.tanh(x);
  }

  sigmoid(x: number) {
    return 1 / (1 + Math.exp(-x));
  }

  copy(): NeuralNetwork {
    const nn = new NeuralNetwork(this.inputNodes, this.hiddenNodes, this.outputNodes);
    nn.weightsIH = this.weightsIH.map(r => [...r]);
    nn.weightsHO = this.weightsHO.map(r => [...r]);
    nn.biasH = [...this.biasH];
    nn.biasO = [...this.biasO];
    return nn;
  }

  crossover(other: NeuralNetwork): NeuralNetwork {
    const child = new NeuralNetwork(this.inputNodes, this.hiddenNodes, this.outputNodes);
    const crossArray = (arr1: number[], arr2: number[]) => 
      arr1.map((val, i) => Math.random() < 0.5 ? val : arr2[i]);
    const crossMatrix = (mat1: number[][], mat2: number[][]) => 
      mat1.map((row, i) => crossArray(row, mat2[i]));

    child.weightsIH = crossMatrix(this.weightsIH, other.weightsIH);
    child.weightsHO = crossMatrix(this.weightsHO, other.weightsHO);
    child.biasH = crossArray(this.biasH, other.biasH);
    child.biasO = crossArray(this.biasO, other.biasO);
    return child;
  }

  mutate(rate: number) {
    const mutateFunc = (val: number) => {
      if (Math.random() < rate) {
        // 10% chance to completely reassign the weight
        if (Math.random() < 0.1) {
          return Math.random() * 2 - 1;
        }
        // Small gaussian-like mutation
        let offset = (Math.random() * 2 - 1) + (Math.random() * 2 - 1) + (Math.random() * 2 - 1);
        return val + (offset * 0.3); // roughly normal distributed
      }
      return val;
    };

    this.weightsIH = this.weightsIH.map(r => r.map(mutateFunc));
    this.weightsHO = this.weightsHO.map(r => r.map(mutateFunc));
    this.biasH = this.biasH.map(mutateFunc);
    this.biasO = this.biasO.map(mutateFunc);
  }

  serialize(): string {
    return JSON.stringify({
      weightsIH: this.weightsIH,
      weightsHO: this.weightsHO,
      biasH: this.biasH,
      biasO: this.biasO
    });
  }

  static deserialize(data: string, inputs: number, hidden: number, outputs: number): NeuralNetwork {
    const parsed = JSON.parse(data);
    const nn = new NeuralNetwork(inputs, hidden, outputs);
    nn.weightsIH = parsed.weightsIH;
    nn.weightsHO = parsed.weightsHO;
    nn.biasH = parsed.biasH;
    nn.biasO = parsed.biasO;
    return nn;
  }
}
