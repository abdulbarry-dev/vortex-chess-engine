/**
 * @file Square.test.ts
 * @description Tests for Square module
 */

import { describe, expect, it } from 'vitest';
import {
    algebraicToSquare,
    chebyshevDistance,
    coordsToSquare,
    isValidCoords,
    isValidSquare,
    sameDiagonal,
    sameFile,
    sameRank,
    squareDistance,
    squareToAlgebraic,
    squareToCoords,
} from '../src/core/Square';

describe('Square Module', () => {
  describe('squareToCoords', () => {
    it('should convert square 0 (a1) correctly', () => {
      expect(squareToCoords(0)).toEqual({ rank: 0, file: 0 });
    });

    it('should convert square 7 (h1) correctly', () => {
      expect(squareToCoords(7)).toEqual({ rank: 0, file: 7 });
    });

    it('should convert square 56 (a8) correctly', () => {
      expect(squareToCoords(56)).toEqual({ rank: 7, file: 0 });
    });

    it('should convert square 63 (h8) correctly', () => {
      expect(squareToCoords(63)).toEqual({ rank: 7, file: 7 });
    });

    it('should convert e4 (square 28) correctly', () => {
      expect(squareToCoords(28)).toEqual({ rank: 3, file: 4 });
    });
  });

  describe('coordsToSquare', () => {
    it('should convert a1 coordinates correctly', () => {
      expect(coordsToSquare(0, 0)).toBe(0);
    });

    it('should convert h1 coordinates correctly', () => {
      expect(coordsToSquare(0, 7)).toBe(7);
    });

    it('should convert a8 coordinates correctly', () => {
      expect(coordsToSquare(7, 0)).toBe(56);
    });

    it('should convert h8 coordinates correctly', () => {
      expect(coordsToSquare(7, 7)).toBe(63);
    });

    it('should convert e4 coordinates correctly', () => {
      expect(coordsToSquare(3, 4)).toBe(28);
    });
  });

  describe('squareToAlgebraic', () => {
    it('should convert square indices to algebraic notation', () => {
      expect(squareToAlgebraic(0)).toBe('a1');
      expect(squareToAlgebraic(7)).toBe('h1');
      expect(squareToAlgebraic(28)).toBe('e4');
      expect(squareToAlgebraic(56)).toBe('a8');
      expect(squareToAlgebraic(63)).toBe('h8');
    });
  });

  describe('algebraicToSquare', () => {
    it('should parse algebraic notation correctly', () => {
      expect(algebraicToSquare('a1')).toBe(0);
      expect(algebraicToSquare('h1')).toBe(7);
      expect(algebraicToSquare('e4')).toBe(28);
      expect(algebraicToSquare('a8')).toBe(56);
      expect(algebraicToSquare('h8')).toBe(63);
    });

    it('should handle uppercase algebraic notation', () => {
      expect(algebraicToSquare('E4')).toBe(28);
      expect(algebraicToSquare('A1')).toBe(0);
    });

    it('should return null for invalid notation', () => {
      expect(algebraicToSquare('i1')).toBeNull(); // Invalid file
      expect(algebraicToSquare('a9')).toBeNull(); // Invalid rank
      expect(algebraicToSquare('e')).toBeNull();  // Too short
      expect(algebraicToSquare('e44')).toBeNull(); // Too long
      expect(algebraicToSquare('')).toBeNull();    // Empty
    });
  });

  describe('isValidSquare', () => {
    it('should return true for valid squares', () => {
      expect(isValidSquare(0)).toBe(true);
      expect(isValidSquare(28)).toBe(true);
      expect(isValidSquare(63)).toBe(true);
    });

    it('should return false for invalid squares', () => {
      expect(isValidSquare(-1)).toBe(false);
      expect(isValidSquare(64)).toBe(false);
      expect(isValidSquare(100)).toBe(false);
    });
  });

  describe('isValidCoords', () => {
    it('should return true for valid coordinates', () => {
      expect(isValidCoords(0, 0)).toBe(true);
      expect(isValidCoords(3, 4)).toBe(true);
      expect(isValidCoords(7, 7)).toBe(true);
    });

    it('should return false for invalid coordinates', () => {
      expect(isValidCoords(-1, 0)).toBe(false);
      expect(isValidCoords(0, -1)).toBe(false);
      expect(isValidCoords(8, 0)).toBe(false);
      expect(isValidCoords(0, 8)).toBe(false);
    });
  });

  describe('squareDistance', () => {
    it('should calculate Manhattan distance correctly', () => {
      expect(squareDistance(0, 0)).toBe(0); // Same square
      expect(squareDistance(0, 1)).toBe(1); // Adjacent horizontally
      expect(squareDistance(0, 8)).toBe(1); // Adjacent vertically
      expect(squareDistance(0, 63)).toBe(14); // Opposite corners
      expect(squareDistance(28, 36)).toBe(1); // e4 to e5 (same file, one rank apart)
    });
  });

  describe('chebyshevDistance', () => {
    it('should calculate Chebyshev distance correctly', () => {
      expect(chebyshevDistance(0, 0)).toBe(0); // Same square
      expect(chebyshevDistance(0, 9)).toBe(1); // Adjacent diagonally
      expect(chebyshevDistance(0, 63)).toBe(7); // Opposite corners
      expect(chebyshevDistance(28, 36)).toBe(1); // e4 to e5
    });
  });

  describe('sameRank', () => {
    it('should return true for squares on the same rank', () => {
      expect(sameRank(0, 7)).toBe(true);   // a1 and h1
      expect(sameRank(28, 31)).toBe(true); // e4 and h4
    });

    it('should return false for squares on different ranks', () => {
      expect(sameRank(0, 8)).toBe(false);  // a1 and a2
      expect(sameRank(28, 36)).toBe(false); // e4 and e5
    });
  });

  describe('sameFile', () => {
    it('should return true for squares on the same file', () => {
      expect(sameFile(0, 56)).toBe(true);  // a1 and a8
      expect(sameFile(28, 36)).toBe(true); // e4 and e5
    });

    it('should return false for squares on different files', () => {
      expect(sameFile(0, 1)).toBe(false);  // a1 and b1
      expect(sameFile(28, 29)).toBe(false); // e4 and f4
    });
  });

  describe('sameDiagonal', () => {
    it('should return true for squares on the same diagonal', () => {
      expect(sameDiagonal(0, 63)).toBe(true); // a1 and h8
      expect(sameDiagonal(28, 35)).toBe(true); // e4 and d5
    });

    it('should return false for squares not on the same diagonal', () => {
      expect(sameDiagonal(0, 1)).toBe(false);  // a1 and b1
      expect(sameDiagonal(28, 36)).toBe(false); // e4 and e5
    });
  });

  describe('round-trip conversions', () => {
    it('should convert between square and coords consistently', () => {
      for (let square = 0; square < 64; square++) {
        const coords = squareToCoords(square);
        const backToSquare = coordsToSquare(coords.rank, coords.file);
        expect(backToSquare).toBe(square);
      }
    });

    it('should convert between square and algebraic notation consistently', () => {
      for (let square = 0; square < 64; square++) {
        const algebraic = squareToAlgebraic(square);
        const backToSquare = algebraicToSquare(algebraic);
        expect(backToSquare).toBe(square);
      }
    });
  });
});
