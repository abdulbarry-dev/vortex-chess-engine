/**
 * @file Network.ts
 * @description Defines the NNUE network structure (768 -> 32 -> 1)
 */

export const FEATURE_SIZE = 768; // 12 pieces * 64 squares
export const HIDDEN_SIZE = 32;   // Small hidden layer for CPU-friendly inference

export class NnueNetwork {
  public featureWeights: Int16Array; // [FEATURE_SIZE][HIDDEN_SIZE]
  public featureBiases: Int16Array;  // [HIDDEN_SIZE]
  public outputWeights: Int16Array;  // [HIDDEN_SIZE * 2] (White and Black concatenated)
  public outputBias: number;

  constructor() {
    this.featureWeights = new Int16Array(FEATURE_SIZE * HIDDEN_SIZE);
    this.featureBiases = new Int16Array(HIDDEN_SIZE);
    this.outputWeights = new Int16Array(HIDDEN_SIZE * 2);
    this.outputBias = 0;
  }
  
  /**
   * Initialize with zeros or small random weights for demonstration.
   * In a real engine, this would be loaded from a trained .bin file.
   */
  public initializeRandom() {
    for (let i = 0; i < this.featureBiases.length; i++) this.featureBiases[i] = 0;
    for (let i = 0; i < this.featureWeights.length; i++) this.featureWeights[i] = Math.floor(Math.random() * 10 - 5);
    for (let i = 0; i < this.outputWeights.length; i++) this.outputWeights[i] = Math.floor(Math.random() * 10 - 5);
  }
}

export const globalNetwork = new NnueNetwork();
globalNetwork.initializeRandom();
