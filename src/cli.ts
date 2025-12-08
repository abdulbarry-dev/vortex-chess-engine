#!/usr/bin/env node
/**
 * @file cli.ts
 * @description CLI interface for the Vortex Chess Engine (UCI Protocol)
 * 
 * This file provides a command-line interface that implements the UCI protocol,
 * allowing the engine to communicate with chess GUIs and testing tools like cutechess-cli.
 */

import * as readline from 'readline';
import { Board } from './core/Board';
import { GameState } from './core/GameState';
import { Color, PieceType } from './core/Piece';
import { Evaluator } from './evaluation/Evaluator';
import { MoveGenerator } from './move-generation/MoveGenerator';
import { SearchEngine } from './search/SearchEngine';
import { Move, MoveFlags } from './types/Move.types';
import { parseFen } from './utils/FenParser';

/**
 * UCI Protocol Implementation
 */
class UciInterface {
  private board: Board;
  private state: GameState;
  private generator: MoveGenerator;
  private evaluator: Evaluator;
  private search: SearchEngine;
  private isSearching: boolean = false;

  constructor() {
    this.board = new Board();
    this.state = new GameState();
    this.generator = new MoveGenerator();
    this.evaluator = new Evaluator();
    this.search = new SearchEngine(this.evaluator, this.generator);
    
    // Initialize to starting position
    this.newGame();
  }

  /**
   * Initialize a new game
   */
  private newGame(): void {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const result = parseFen(startFen);
    this.board = result.board;
    this.state = result.state;
  }

  /**
   * Send output to GUI
   */
  private send(message: string): void {
    console.log(message);
  }

  /**
   * Process UCI command
   */
  public processCommand(command: string): void {
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    if (!cmd) return;

    switch (cmd) {
      case 'uci':
        this.handleUci();
        break;
      case 'isready':
        this.handleIsReady();
        break;
      case 'ucinewgame':
        this.handleNewGame();
        break;
      case 'position':
        this.handlePosition(parts.slice(1));
        break;
      case 'go':
        this.handleGo(parts.slice(1));
        break;
      case 'stop':
        this.handleStop();
        break;
      case 'quit':
        this.handleQuit();
        break;
      case 'setoption':
        this.handleSetOption(parts.slice(1));
        break;
      case 'd':
      case 'display':
        this.handleDisplay();
        break;
      default:
        // Ignore unknown commands
        break;
    }
  }

  /**
   * Handle 'uci' command
   */
  private handleUci(): void {
    this.send('id name Vortex Chess Engine v1.0');
    this.send('id author Vortex Team');
    
    // Engine options
    this.send('option name Hash type spin default 128 min 1 max 4096');
    this.send('option name Threads type spin default 1 min 1 max 1');
    this.send('option name MultiPV type spin default 1 min 1 max 10');
    
    this.send('uciok');
  }

  /**
   * Handle 'isready' command
   */
  private handleIsReady(): void {
    this.send('readyok');
  }

  /**
   * Handle 'ucinewgame' command
   */
  private handleNewGame(): void {
    this.newGame();
    this.search.clearTranspositionTable();
  }

  /**
   * Handle 'position' command
   * 
   * Examples:
   * - position startpos
   * - position startpos moves e2e4 e7e5
   * - position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
   */
  private handlePosition(args: string[]): void {
    if (args.length === 0) return;

    try {
      if (args[0] === 'startpos') {
        this.newGame();
        
        // Apply moves if provided
        const movesIndex = args.indexOf('moves');
        if (movesIndex !== -1) {
          const moves = args.slice(movesIndex + 1);
          this.applyMoves(moves);
        }
      } else if (args[0] === 'fen') {
        // Find where 'moves' starts (if present)
        const movesIndex = args.indexOf('moves');
        const fenEnd = movesIndex !== -1 ? movesIndex : args.length;
        const fenString = args.slice(1, fenEnd).join(' ');
        
        const result = parseFen(fenString);
        this.board = result.board;
        this.state = result.state;
        
        // Apply moves if provided
        if (movesIndex !== -1) {
          const moves = args.slice(movesIndex + 1);
          this.applyMoves(moves);
        }
      }
    } catch (error) {
      // Silently ignore invalid positions
      if (error instanceof Error) {
        this.send(`info string Error parsing position: ${error.message}`);
      }
    }
  }

  /**
   * Apply a list of moves in algebraic notation
   */
  private applyMoves(moveStrings: string[]): void {
    for (const moveStr of moveStrings) {
      try {
        const move = this.parseUciMove(moveStr);
        if (move) {
          // Properly apply the move using makeMove (handles castling, en passant, promotions)
          this.makeMove(move);
        }
      } catch (error) {
        if (error instanceof Error) {
          this.send(`info string Error applying move ${moveStr}: ${error.message}`);
        }
        break;
      }
    }
  }

  /**
   * Properly apply a move to the board
   * Handles castling, en passant, promotions, and state updates
   */
  private makeMove(move: Move): void {
    const piece = this.board.getPiece(move.from);
    if (!piece) return;

    // Clear en passant square from previous move
    const previousEnPassant = this.state.enPassantSquare;
    this.state.enPassantSquare = null;

    // Handle castling
    if (move.flags & MoveFlags.Castle) {
      // Move king
      this.board.setPiece(move.from, null);
      this.board.setPiece(move.to, piece);
      
      // Move rook
      const isKingside = move.to > move.from;
      if (isKingside) {
        const rookFrom = move.from + 3;
        const rookTo = move.from + 1;
        const rook = this.board.getPiece(rookFrom);
        if (rook) {
          this.board.setPiece(rookFrom, null);
          this.board.setPiece(rookTo, rook);
        }
      } else {
        const rookFrom = move.from - 4;
        const rookTo = move.from - 1;
        const rook = this.board.getPiece(rookFrom);
        if (rook) {
          this.board.setPiece(rookFrom, null);
          this.board.setPiece(rookTo, rook);
        }
      }
    }
    // Handle en passant capture
    else if (move.flags & MoveFlags.EnPassant) {
      this.board.setPiece(move.from, null);
      this.board.setPiece(move.to, piece);
      
      // Remove captured pawn
      if (previousEnPassant !== null) {
        const captureRank = Math.floor(move.from / 8);
        const captureFile = previousEnPassant % 8;
        const captureSquare = captureRank * 8 + captureFile;
        this.board.setPiece(captureSquare, null);
      }
    }
    // Handle promotion
    else if (move.promotion) {
      this.board.setPiece(move.from, null);
      this.board.setPiece(move.to, {
        type: move.promotion,
        color: piece.color
      });
    }
    // Regular move
    else {
      this.board.setPiece(move.from, null);
      this.board.setPiece(move.to, piece);
    }

    // Set en passant square if double pawn push
    if (move.flags & MoveFlags.DoublePawnPush) {
      const direction = piece.color === Color.White ? -1 : 1;
      this.state.enPassantSquare = move.to + (direction * 8);
    }

    // Update castling rights
    if (piece.type === PieceType.King) {
      if (piece.color === Color.White) {
        this.state.castlingRights.white.kingSide = false;
        this.state.castlingRights.white.queenSide = false;
      } else {
        this.state.castlingRights.black.kingSide = false;
        this.state.castlingRights.black.queenSide = false;
      }
    }
    if (piece.type === PieceType.Rook) {
      // Check if rook moved from initial square
      if (piece.color === Color.White) {
        if (move.from === 0) this.state.castlingRights.white.queenSide = false;
        if (move.from === 7) this.state.castlingRights.white.kingSide = false;
      } else {
        if (move.from === 56) this.state.castlingRights.black.queenSide = false;
        if (move.from === 63) this.state.castlingRights.black.kingSide = false;
      }
    }

    // Switch sides
    this.state.currentPlayer = this.state.currentPlayer === Color.White ? Color.Black : Color.White;
    
    // Update move counters
    if (piece.color === Color.Black) {
      this.state.fullmoveNumber++;
    }
    
    // Reset halfmove clock on pawn move or capture
    if (piece.type === PieceType.Pawn || move.captured) {
      this.state.halfmoveClock = 0;
    } else {
      this.state.halfmoveClock++;
    }
  }

  /**
   * Parse UCI move notation (e.g., "e2e4", "e7e8q")
   */
  private parseUciMove(moveStr: string): Move | null {
    if (moveStr.length < 4) return null;

    const fromFile = moveStr.charCodeAt(0) - 'a'.charCodeAt(0);
    const fromRank = parseInt(moveStr[1] || '0') - 1;
    const toFile = moveStr.charCodeAt(2) - 'a'.charCodeAt(0);
    const toRank = parseInt(moveStr[3] || '0') - 1;

    const from = fromRank * 8 + fromFile;
    const to = toRank * 8 + toFile;

    // Find the matching legal move
    const legalMoves = this.generator.generateLegalMoves(this.board, this.state);
    
    for (const move of legalMoves) {
      if (move.from === from && move.to === to) {
        // Check promotion if specified
        if (moveStr.length === 5 && moveStr[4]) {
          const promotionChar = moveStr[4].toLowerCase();
          const promotionMap: Record<string, number> = {
            'q': 5, // Queen
            'r': 4, // Rook
            'b': 3, // Bishop
            'n': 2  // Knight
          };
          if (move.promotion === promotionMap[promotionChar]) {
            return move;
          }
        } else if (!move.promotion) {
          return move;
        }
      }
    }

    return null;
  }

  /**
   * Handle 'go' command
   * 
   * Examples:
   * - go depth 6
   * - go movetime 5000
   * - go wtime 300000 btime 300000 winc 0 binc 0
   * - go infinite
   */
  private handleGo(args: string[]): void {
    if (this.isSearching) {
      this.send('info string Already searching');
      return;
    }

    this.isSearching = true;

    // Parse search parameters
    let depth = 6; // Default depth
    let timeLimitMs: number | undefined;
    let wtime = 0;
    let btime = 0;
    let winc = 0;
    let binc = 0;
    let movestogo = 40; // Default moves to go

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case 'depth':
          depth = parseInt(args[i + 1] || '6');
          i++;
          break;
        case 'movetime':
          timeLimitMs = parseInt(args[i + 1] || '5000');
          i++;
          break;
        case 'infinite':
          depth = 12;
          timeLimitMs = undefined;
          break;
        case 'wtime':
          wtime = parseInt(args[i + 1] || '0');
          i++;
          break;
        case 'btime':
          btime = parseInt(args[i + 1] || '0');
          i++;
          break;
        case 'winc':
          winc = parseInt(args[i + 1] || '0');
          i++;
          break;
        case 'binc':
          binc = parseInt(args[i + 1] || '0');
          i++;
          break;
        case 'movestogo':
          movestogo = parseInt(args[i + 1] || '40');
          i++;
          break;
      }
    }

    // Calculate time allocation if time control is provided
    if (!timeLimitMs && (wtime > 0 || btime > 0)) {
      const ourTime = this.state.currentPlayer === Color.White ? wtime : btime;
      const ourInc = this.state.currentPlayer === Color.White ? winc : binc;
      
      // Time management strategy:
      // - Allocate time based on moves to go
      // - Add increment to our allocation
      // - Keep safety margin (don't use all time)
      const safetyMargin = 50; // 50ms buffer
      const baseTime = Math.max(0, ourTime - safetyMargin);
      
      // Calculate time per move
      // Use movestogo, but assume at least 20 moves remaining if not specified
      const effectiveMovesToGo = Math.max(movestogo, 20);
      timeLimitMs = Math.floor(baseTime / effectiveMovesToGo) + Math.floor(ourInc * 0.8);
      
      // Minimum time: 100ms, Maximum: 50% of remaining time
      timeLimitMs = Math.max(100, Math.min(timeLimitMs, baseTime / 2));
      
      // Adjust depth based on available time
      if (timeLimitMs < 500) {
        depth = Math.min(depth, 4);
      } else if (timeLimitMs < 2000) {
        depth = Math.min(depth, 5);
      }
    }

    // Perform search asynchronously
    setImmediate(() => {
      try {
        const result = this.search.findBestMove(this.board, this.state, depth, timeLimitMs);
        
        // Validate that we have a legal move
        if (result.bestMove) {
          // Double-check move is legal
          const legalMoves = this.generator.generateLegalMoves(this.board, this.state);
          const isLegal = legalMoves.some(m => 
            m.from === result.bestMove!.from && 
            m.to === result.bestMove!.to &&
            (!m.promotion || m.promotion === result.bestMove!.promotion)
          );
          
          if (isLegal) {
            const moveStr = this.moveToUci(result.bestMove);
            this.send(`info depth ${result.depth || depth} score cp ${result.score} nodes ${result.nodes}`);
            this.send(`bestmove ${moveStr}`);
          } else {
            this.send('info string Search returned illegal move');
            // Return first legal move as fallback
            if (legalMoves.length > 0 && legalMoves[0]) {
              const moveStr = this.moveToUci(legalMoves[0]);
              this.send(`bestmove ${moveStr}`);
            } else {
              this.send('bestmove 0000');
            }
          }
        } else {
          // No move found, return first legal move
          const legalMoves = this.generator.generateLegalMoves(this.board, this.state);
          if (legalMoves.length > 0 && legalMoves[0]) {
            const moveStr = this.moveToUci(legalMoves[0]);
            this.send(`bestmove ${moveStr}`);
          } else {
            this.send('bestmove 0000');
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          this.send(`info string Search error: ${error.message}`);
        }
        // Try to return a legal move even on error
        try {
          const legalMoves = this.generator.generateLegalMoves(this.board, this.state);
          if (legalMoves.length > 0 && legalMoves[0]) {
            const moveStr = this.moveToUci(legalMoves[0]);
            this.send(`bestmove ${moveStr}`);
          } else {
            this.send('bestmove 0000');
          }
        } catch {
          this.send('bestmove 0000');
        }
      } finally {
        this.isSearching = false;
      }
    });
  }

  /**
   * Convert Move to UCI notation
   */
  private moveToUci(move: Move): string {
    const files = 'abcdefgh';
    const ranks = '12345678';
    
    const fromFile = files[move.from % 8] || 'a';
    const fromRank = ranks[Math.floor(move.from / 8)] || '1';
    const toFile = files[move.to % 8] || 'a';
    const toRank = ranks[Math.floor(move.to / 8)] || '1';
    
    let result = fromFile + fromRank + toFile + toRank;
    
    // Add promotion piece if applicable
    if (move.promotion) {
      const promotionMap: Record<number, string> = {
        5: 'q',
        4: 'r',
        3: 'b',
        2: 'n'
      };
      result += promotionMap[move.promotion] || 'q';
    }
    
    return result;
  }

  /**
   * Handle 'stop' command
   */
  private handleStop(): void {
    if (this.isSearching) {
      this.search.stop();
      this.isSearching = false;
    }
  }

  /**
   * Handle 'quit' command
   */
  private handleQuit(): void {
    process.exit(0);
  }

  /**
   * Handle 'setoption' command
   */
  private handleSetOption(args: string[]): void {
    // Parse: setoption name <name> value <value>
    const nameIndex = args.indexOf('name');
    const valueIndex = args.indexOf('value');
    
    if (nameIndex === -1) return;
    
    const nameEnd = valueIndex !== -1 ? valueIndex : args.length;
    const name = args.slice(nameIndex + 1, nameEnd).join(' ');
    
    // Handle options
    switch (name.toLowerCase()) {
      case 'hash':
        // TODO: Implement hash table size adjustment
        break;
      case 'threads':
        // Single-threaded engine
        break;
      case 'multipv':
        // TODO: Implement multi-PV
        break;
    }
  }

  /**
   * Handle 'display' command (non-UCI, for debugging)
   */
  private handleDisplay(): void {
    this.send(this.board.toString());
  }

  /**
   * Start the UCI loop
   */
  public start(): void {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', (line: string) => {
      this.processCommand(line);
    });

    rl.on('close', () => {
      process.exit(0);
    });
  }
}

// Start the UCI interface
const uci = new UciInterface();
uci.start();
