/**
 * @file BoardDisplay.ts
 * @description Utility for displaying chess boards as ASCII art
 */

import { Board } from '../core/Board';
import { getPieceChar } from '../core/Piece';
import { coordsToSquare, squareToAlgebraic } from '../core/Square';

/**
 * Convert a board to an ASCII string representation
 * @param board Board to display
 * @param showCoordinates Whether to show rank/file labels (default: true)
 * @returns ASCII art string representation of the board
 */
export function boardToString(board: Board, showCoordinates = true): string {
  const lines: string[] = [];

  if (showCoordinates) {
    lines.push('  +---+---+---+---+---+---+---+---+');
  } else {
    lines.push('+---+---+---+---+---+---+---+---+');
  }

  // Display from rank 8 to rank 1 (top to bottom)
  for (let rank = 7; rank >= 0; rank--) {
    let line = showCoordinates ? `${rank + 1} |` : '|';

    for (let file = 0; file < 8; file++) {
      const square = coordsToSquare(rank, file);
      const piece = board.getPiece(square);

      if (piece) {
        line += ` ${getPieceChar(piece)} |`;
      } else {
        line += '   |';
      }
    }

    if (showCoordinates) {
      line += ` ${rank + 1}`;
    }

    lines.push(line);
    lines.push(showCoordinates ? '  +---+---+---+---+---+---+---+---+' : '+---+---+---+---+---+---+---+---+');
  }

  if (showCoordinates) {
    lines.push('    a   b   c   d   e   f   g   h  ');
  }

  return lines.join('\n');
}

/**
 * Display a board with move highlights
 * @param board Board to display
 * @param highlightSquares Squares to highlight (e.g., from/to of a move)
 * @returns ASCII art string with highlights
 */
export function boardToStringWithHighlights(
  board: Board,
  highlightSquares: number[]
): string {
  const lines: string[] = [];
  lines.push('  +---+---+---+---+---+---+---+---+');

  for (let rank = 7; rank >= 0; rank--) {
    let line = `${rank + 1} |`;

    for (let file = 0; file < 8; file++) {
      const square = coordsToSquare(rank, file);
      const piece = board.getPiece(square);
      const isHighlighted = highlightSquares.includes(square);

      if (piece) {
        const char = getPieceChar(piece);
        line += isHighlighted ? `[${char}]` : ` ${char} |`;
      } else {
        line += isHighlighted ? '[·]' : '   |';
      }

      if (!isHighlighted) {
        line += '';
      }
    }

    line += ` ${rank + 1}`;
    lines.push(line);
    lines.push('  +---+---+---+---+---+---+---+---+');
  }

  lines.push('    a   b   c   d   e   f   g   h  ');
  return lines.join('\n');
}

/**
 * Create a compact board representation (FEN-like visual)
 * @param board Board to display
 * @returns Compact string representation
 */
export function boardToCompactString(board: Board): string {
  const lines: string[] = [];

  for (let rank = 7; rank >= 0; rank--) {
    let line = '';
    for (let file = 0; file < 8; file++) {
      const square = coordsToSquare(rank, file);
      const piece = board.getPiece(square);
      line += piece ? getPieceChar(piece) : '.';
      if (file < 7) line += ' ';
    }
    lines.push(`${rank + 1} ${line}`);
  }

  lines.push('  a b c d e f g h');
  return lines.join('\n');
}

/**
 * Display board with square indices (useful for debugging)
 * @param board Board to display
 * @returns String with square indices
 */
export function boardToStringWithIndices(board: Board): string {
  const lines: string[] = [];
  lines.push('  +----+----+----+----+----+----+----+----+');

  for (let rank = 7; rank >= 0; rank--) {
    let line = `${rank + 1} |`;

    for (let file = 0; file < 8; file++) {
      const square = coordsToSquare(rank, file);
      const piece = board.getPiece(square);

      if (piece) {
        const char = getPieceChar(piece);
        line += ` ${char}${square.toString().padStart(2, '0')}|`;
      } else {
        line += ` ${square.toString().padStart(2, '0')} |`;
      }
    }

    line += ` ${rank + 1}`;
    lines.push(line);
    lines.push('  +----+----+----+----+----+----+----+----+');
  }

  lines.push('    a    b    c    d    e    f    g    h  ');
  return lines.join('\n');
}

/**
 * Get a simple text description of piece positions
 * @param board Board to describe
 * @returns Array of strings describing piece positions
 */
export function describePiecePositions(board: Board): string[] {
  const descriptions: string[] = [];
  const pieces = board.getAllPieces();

  for (const [square, piece] of pieces) {
    const algebraic = squareToAlgebraic(square);
    const char = getPieceChar(piece);
    descriptions.push(`${char} on ${algebraic}`);
  }

  return descriptions;
}
