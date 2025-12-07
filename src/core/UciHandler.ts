/**
 * @file UciHandler.ts
 * @description Universal Chess Interface (UCI) protocol handler
 * 
 * Implements UCI protocol for communication with chess GUIs.
 * Supports standard UCI commands like position, go, stop, etc.
 */

import { OpeningBook } from '../opening/OpeningBook';
import { SearchEngine } from '../search/SearchEngine';
import { TimeControl, TimeManager } from '../time/TimeManager';
import { parseFen } from '../utils/FenParser';
import * as MoveNotation from '../utils/MoveNotation';
import { Board } from './Board';
import { GameState } from './GameState';

/**
 * UCI protocol handler
 * 
 * Processes UCI commands and manages engine state.
 */
export class UciHandler {
  private board: Board;
  private state: GameState;
  private searchEngine: SearchEngine;
  private timeManager: TimeManager;
  private openingBook: OpeningBook | null;
  private isSearching: boolean = false;

  constructor(
    board: Board,
    state: GameState,
    searchEngine: SearchEngine,
    timeManager: TimeManager,
    openingBook: OpeningBook | null = null
  ) {
    this.board = board;
    this.state = state;
    this.searchEngine = searchEngine;
    this.timeManager = timeManager;
    this.openingBook = openingBook;
  }

  /**
   * Process UCI command
   * 
   * @param command UCI command string
   * @returns Response string (if any)
   */
  processCommand(command: string): string | null {
    const tokens = command.trim().split(/\s+/);
    if (tokens.length === 0) return null;

    const cmd = tokens[0];

    switch (cmd) {
      case 'uci':
        return this.handleUci();
      
      case 'isready':
        return 'readyok';
      
      case 'ucinewgame':
        return this.handleNewGame();
      
      case 'position':
        return this.handlePosition(tokens);
      
      case 'go':
        return this.handleGo(tokens);
      
      case 'stop':
        return this.handleStop();
      
      case 'quit':
        return this.handleQuit();
      
      case 'setoption':
        return this.handleSetOption(tokens);
      
      default:
        return null; // Unknown command
    }
  }

  /**
   * Handle 'uci' command
   * Identify the engine
   */
  private handleUci(): string {
    const lines = [
      'id name Vortex Chess Engine',
      'id author Vortex Team',
      'option name Hash type spin default 64 min 1 max 1024',
      'option name UseBook type check default true',
      'uciok'
    ];
    return lines.join('\n');
  }

  /**
   * Handle 'ucinewgame' command
   * Reset for new game
   */
  private handleNewGame(): string | null {
    this.board.initializeStartingPosition();
    this.state.reset();
    this.searchEngine.clearTranspositionTable();
    return null;
  }

  /**
   * Handle 'position' command
   * Examples:
   *   position startpos
   *   position startpos moves e2e4 e7e5
   *   position fen <fen> moves ...
   */
  private handlePosition(tokens: string[]): string | null {
    if (tokens.length < 2) return null;

    let moveIndex = -1;

    if (tokens[1] === 'startpos') {
      this.board.initializeStartingPosition();
      this.state.reset();
      moveIndex = 2;
    } else if (tokens[1] === 'fen') {
      // Find where 'moves' starts (if present)
      moveIndex = tokens.indexOf('moves', 2);
      
      // Extract FEN (everything between 'fen' and 'moves' or end)
      const fenEnd = moveIndex >= 0 ? moveIndex : tokens.length;
      const fenString = tokens.slice(2, fenEnd).join(' ');
      
      // Parse FEN
      const parsed = parseFen(fenString);
      
      if (!parsed || !parsed.board || !parsed.state) {
        console.error('Invalid FEN:', fenString);
        return null;
      }

      this.board = parsed.board;
      this.state = parsed.state;
    }

    // Apply moves if present
    if (moveIndex >= 0 && tokens[moveIndex] === 'moves') {
      for (let i = moveIndex + 1; i < tokens.length; i++) {
        const moveStr: any = tokens[i];
        const move = MoveNotation.fromUci(moveStr, this.board, this.state);
        
        if (!move || !moveStr) {
          console.error('Invalid move:', moveStr);
          return null;
        }

        // Apply move (simplified - just update board)
        this.board.setPiece(move.to, move.piece);
        this.board.setPiece(move.from, null);
        this.state.switchTurn();
        // Note: This is simplified move application for UCI
        // TODO: Handle special moves (castling, en passant, promotion) properly
      }
    }

    return null;
  }

  /**
   * Handle 'go' command
   * Examples:
   *   go infinite
   *   go depth 6
   *   go wtime 300000 btime 300000 winc 0 binc 0
   *   go movetime 5000
   */
  private handleGo(tokens: string[]): string | null {
    if (this.isSearching) {
      return null; // Already searching
    }

    let depth: number | undefined;
    let moveTime: number | undefined;
    let infinite = false;
    let timeControl: TimeControl | undefined;

    // Parse go parameters
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];

      switch (token) {
        case 'infinite':
          infinite = true;
          break;
        
        case 'depth':
          if (i + 1 < tokens.length) {
            const depthStr = tokens[++i];
            if (depthStr) depth = parseInt(depthStr, 10);
          }
          break;
        
        case 'movetime':
          if (i + 1 < tokens.length) {
            const timeStr = tokens[++i];
            if (timeStr) moveTime = parseInt(timeStr, 10);
          }
          break;
        
        case 'wtime':
        case 'btime':
        case 'winc':
        case 'binc':
        case 'movestogo':
          // Parse time control
          if (!timeControl) {
            timeControl = {
              whiteTime: 60000,
              blackTime: 60000,
            };
          }

          if (i + 1 < tokens.length) {
            const valueStr = tokens[++i];
            if (!valueStr) continue;
            const value = parseInt(valueStr, 10);
            if (token === 'wtime') timeControl.whiteTime = value;
            else if (token === 'btime') timeControl.blackTime = value;
            else if (token === 'winc') timeControl.whiteIncrement = value;
            else if (token === 'binc') timeControl.blackIncrement = value;
            else if (token === 'movestogo') timeControl.movesToGo = value;
          }
          break;
      }
    }

    // Start search in background
    this.startSearch(depth, moveTime, infinite, timeControl);
    return null;
  }

  /**
   * Start search
   */
  private startSearch(
    depth?: number,
    moveTime?: number,
    infinite: boolean = false,
    timeControl?: TimeControl
  ): void {
    this.isSearching = true;

    // Check opening book first
    if (this.openingBook && this.openingBook.isEnabled()) {
      const bookMove = this.openingBook.probe(this.board, this.state);
      if (bookMove) {
        const moveStr = MoveNotation.toUci(bookMove);
        console.log(`bestmove ${moveStr}`);
        this.isSearching = false;
        return;
      }
    }

    // Calculate time allocation
    let searchTime: number | undefined;
    if (moveTime) {
      searchTime = moveTime;
    } else if (timeControl && !infinite) {
      const allocation = this.timeManager.allocateTime(
        timeControl,
        this.state.currentPlayer === 1,
        this.state.fullmoveNumber
      );
      searchTime = allocation.optimalTime;
    }

    // Run search
    const result = this.searchEngine.findBestMove(
      this.board,
      this.state,
      depth,
      searchTime
    );

    // Output result
    if (result.bestMove) {
      const moveStr = MoveNotation.toUci(result.bestMove);
      console.log(`bestmove ${moveStr}`);
    } else {
      console.log('bestmove (none)');
    }

    this.isSearching = false;
  }

  /**
   * Handle 'stop' command
   * Stop current search
   */
  private handleStop(): string | null {
    if (this.isSearching) {
      this.searchEngine.stop();
    }
    return null;
  }

  /**
   * Handle 'quit' command
   */
  private handleQuit(): string | null {
    if (this.isSearching) {
      this.searchEngine.stop();
    }
    return null;
  }

  /**
   * Handle 'setoption' command
   * Example: setoption name Hash value 128
   */
  private handleSetOption(tokens: string[]): string | null {
    if (tokens.length < 5) return null;

    const nameIndex = tokens.indexOf('name');
    const valueIndex = tokens.indexOf('value');

    if (nameIndex < 0 || valueIndex < 0) return null;

    const optionName = tokens.slice(nameIndex + 1, valueIndex).join(' ');
    const optionValue = tokens.slice(valueIndex + 1).join(' ');

    // Handle known options
    switch (optionName) {
      case 'Hash':
        // const sizeInMB = parseInt(optionValue, 10);
        // TODO: Resize transposition table
        break;
      
      case 'UseBook':
        const useBook = optionValue.toLowerCase() === 'true';
        if (this.openingBook) {
          this.openingBook.setEnabled(useBook);
        }
        break;
    }

    return null;
  }

  /**
   * Check if currently searching
   */
  isCurrentlySearching(): boolean {
    return this.isSearching;
  }
}
