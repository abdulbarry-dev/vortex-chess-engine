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
import { Color } from './core/Piece';
import { Evaluator } from './evaluation/Evaluator';
import { MoveGenerator } from './move-generation/MoveGenerator';
import { SearchEngine } from './search/SearchEngine';
import { Move } from './types/Move.types';
import { MoveExecutor } from './core/MoveExecutor';
import { parseFen } from './utils/FenParser';
import { OpeningBook } from './opening/OpeningBook';
import { ZobristHasher } from './search/ZobristHashing';
import { VortexCore } from '../vortex-core/pkg/vortex_core.js';

/**
 * UCI Protocol Implementation
 */
class UciInterface {
  private board: Board;
  private state: GameState;
  private generator: MoveGenerator;
  private evaluator: Evaluator;
  private search: SearchEngine;
  private openingBook: OpeningBook;
  private zobrist: ZobristHasher;
  private isSearching: boolean = false;
  private core: any;

  constructor() {
    this.board = new Board();
    this.state = new GameState();
    this.generator = new MoveGenerator();
    this.evaluator = new Evaluator();
    this.search = new SearchEngine(this.evaluator, this.generator);
    this.zobrist = new ZobristHasher();
    this.openingBook = new OpeningBook(this.zobrist);
    this.core = new VortexCore();
    
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
   * Sync TS Board state to Rust VortexCore
   */
  private syncToRust(): void {
    this.core.reset_board();
    this.core.set_side_to_move(this.state.currentPlayer === Color.White);
    for (let sq = 0; sq < 64; sq++) {
      const piece = this.board.getPiece(sq);
      if (piece) {
        const isWhite = piece.color === Color.White;
        this.core.add_piece(isWhite, piece.type, sq);
      }
    }
    const cr = this.state.castlingRights;
    const rights =
      (cr.white.kingSide ? 0x01 : 0) |
      (cr.white.queenSide ? 0x02 : 0) |
      (cr.black.kingSide ? 0x04 : 0) |
      (cr.black.queenSide ? 0x08 : 0);
    this.core.set_castling_rights(rights);
    const ep = this.state.enPassantSquare;
    this.core.set_en_passant_sq(ep !== null ? ep : -1);
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
    MoveExecutor.makeMove(this.board, this.state, move);
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
        if (this.openingBook.isEnabled()) {
          const bookMove = this.openingBook.probe(this.board, this.state);
          if (bookMove) {
            const moveStr = this.moveToUci(bookMove);
            this.send(`info string book move`);
            this.send(`bestmove ${moveStr}`);
            this.isSearching = false;
            return;
          }
        }
        
        this.syncToRust();
        
        // Call WASM core search with depth and time limit
        const timeLimit = timeLimitMs || 5000;
        const bestMoveU16 = this.core.search(depth, BigInt(timeLimit));
        
        if (bestMoveU16 !== 0) {
            const from = bestMoveU16 & 0x3F;
            const to = (bestMoveU16 >> 6) & 0x3F;
            const flag = bestMoveU16 >> 12;

            const files = 'abcdefgh';
            const ranks = '12345678';
            const fromStr = files[from % 8]! + ranks[Math.floor(from / 8)]!;
            const toStr = files[to % 8]! + ranks[Math.floor(to / 8)]!;
            

            let promoStr = '';
            if (flag >= 8) {
                if (flag === 8 || flag === 12) promoStr = 'n';
                if (flag === 9 || flag === 13) promoStr = 'b';
                if (flag === 10 || flag === 14) promoStr = 'r';
                if (flag === 11 || flag === 15) promoStr = 'q';
            }
            const moveStr = fromStr + toStr + promoStr;
            
            this.send(`info depth ${depth} string VortexCore (Rust) evaluation used`);
            this.send(`bestmove ${moveStr}`);
        } else {
          // No move found, return first legal move (fallback)
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
        this.send('bestmove 0000');
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
