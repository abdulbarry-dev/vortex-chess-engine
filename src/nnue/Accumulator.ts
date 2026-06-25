/**
 * @file Accumulator.ts
 * @description Incrementally updated NNUE hidden layer
 */

import { HIDDEN_SIZE, globalNetwork } from './Network';
import { Color, PieceType } from '../core/Piece';
import { Square } from '../core/Square';

/**
 * Returns the feature index for a given piece and square from White's perspective.
 */
export function getFeatureIndex(type: PieceType, color: Color, sq: Square): number {
  // Map piece to 0-11
  // White: P=0, N=1, B=2, R=3, Q=4, K=5
  // Black: P=6, N=7, B=8, R=9, Q=10, K=11
  let pieceIndex = type - 1; 
  if (color === Color.Black) {
    pieceIndex += 6;
  }
  return pieceIndex * 64 + sq;
}

export class Accumulator {
  public white: Int16Array;
  public black: Int16Array;
  
  constructor() {
    this.white = new Int16Array(HIDDEN_SIZE);
    this.black = new Int16Array(HIDDEN_SIZE);
    this.refresh([]);
  }

  public copyFrom(other: Accumulator) {
    this.white.set(other.white);
    this.black.set(other.black);
  }

  /**
   * Refreshes the accumulator entirely from a board state.
   */
  public refresh(pieces: Array<{type: PieceType, color: Color, square: Square}>) {
    // Reset to biases
    this.white.set(globalNetwork.featureBiases);
    this.black.set(globalNetwork.featureBiases);
    
    // Add all active features
    for (const p of pieces) {
      this.addFeature(p.type, p.color, p.square);
    }
  }

  /**
   * Incrementally add a feature (piece placed on square)
   */
  public addFeature(type: PieceType, color: Color, sq: Square) {
    const whiteIdx = getFeatureIndex(type, color, sq);
    // For Black's perspective, we flip the board and color
    const blackSq = sq ^ 56;
    const blackColor = color === Color.White ? Color.Black : Color.White;
    const blackIdx = getFeatureIndex(type, blackColor, blackSq);

    const wOffset = whiteIdx * HIDDEN_SIZE;
    const bOffset = blackIdx * HIDDEN_SIZE;

    for (let i = 0; i < HIDDEN_SIZE; i++) {
      this.white[i] = (this.white[i] as number) + (globalNetwork.featureWeights[wOffset + i] as number);
      this.black[i] = (this.black[i] as number) + (globalNetwork.featureWeights[bOffset + i] as number);
    }
  }

  /**
   * Incrementally remove a feature (piece removed from square)
   */
  public removeFeature(type: PieceType, color: Color, sq: Square) {
    const whiteIdx = getFeatureIndex(type, color, sq);
    const blackSq = sq ^ 56;
    const blackColor = color === Color.White ? Color.Black : Color.White;
    const blackIdx = getFeatureIndex(type, blackColor, blackSq);

    const wOffset = whiteIdx * HIDDEN_SIZE;
    const bOffset = blackIdx * HIDDEN_SIZE;

    for (let i = 0; i < HIDDEN_SIZE; i++) {
      this.white[i] = (this.white[i] as number) - (globalNetwork.featureWeights[wOffset + i] as number);
      this.black[i] = (this.black[i] as number) - (globalNetwork.featureWeights[bOffset + i] as number);
    }
  }
}
