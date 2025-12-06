/**
 * @file Positions.ts
 * @description Standard chess positions in FEN format for testing and initialization
 */

/**
 * The standard starting position
 */
export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Position after 1.e4
 */
export const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

/**
 * Position after 1.e4 e5
 */
export const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';

/**
 * Sicilian Defense: 1.e4 c5
 */
export const SICILIAN_DEFENSE = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2';

/**
 * French Defense: 1.e4 e6
 */
export const FRENCH_DEFENSE = 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

/**
 * Caro-Kann Defense: 1.e4 c6
 */
export const CARO_KANN = 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

/**
 * King's Indian Defense setup
 */
export const KINGS_INDIAN = 'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3';

/**
 * Position with no castling rights
 */
export const NO_CASTLING = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';

/**
 * Position with only white kingside castling
 */
export const WHITE_KINGSIDE_ONLY = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w K - 0 1';

/**
 * Position with only black queenside castling
 */
export const BLACK_QUEENSIDE_ONLY = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w q - 0 1';

/**
 * En passant capture position (white to move, can capture on d6)
 */
export const EN_PASSANT_WHITE = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';

/**
 * En passant capture position (black to move, can capture on e3)
 */
export const EN_PASSANT_BLACK = 'rnbqkbnr/pppp1ppp/8/8/3Pp3/8/PPP1PPPP/RNBQKBNR b KQkq e3 0 2';

/**
 * Endgame: King and Pawn vs King
 */
export const KP_VS_K = '8/8/8/8/3k4/8/3P4/3K4 w - - 0 1';

/**
 * Endgame: King and Rook vs King
 */
export const KR_VS_K = '8/8/8/8/3k4/8/3R4/3K4 w - - 0 1';

/**
 * Endgame: King and Queen vs King
 */
export const KQ_VS_K = '8/8/8/8/3k4/8/3Q4/3K4 w - - 0 1';

/**
 * Endgame: Rook endgame (Lucena position)
 */
export const LUCENA_POSITION = '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1';

/**
 * Endgame: Rook endgame (Philidor position)
 */
export const PHILIDOR_POSITION = '3k4/R7/8/8/8/8/r7/1K6 b - - 0 1';

/**
 * Tactical position: Back rank mate threat
 */
export const BACK_RANK_MATE = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';

/**
 * Tactical position: Pin
 */
export const PIN_POSITION = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';

/**
 * Tactical position: Fork
 */
export const FORK_POSITION = 'r1bqkb1r/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

/**
 * Tactical position: Skewer
 */
export const SKEWER_POSITION = '1k6/8/8/8/8/8/8/R3K2r w - - 0 1';

/**
 * Tactical position: Discovery attack
 */
export const DISCOVERY_POSITION = 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1P3/2N5/PPPP1PPP/R1BQK1NR b KQkq - 3 3';

/**
 * Middlegame position: Balanced
 */
export const BALANCED_MIDDLEGAME = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R w KQkq - 2 4';

/**
 * Middlegame position: White advantage
 */
export const WHITE_ADVANTAGE = 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 5 5';

/**
 * Middlegame position: Black advantage
 */
export const BLACK_ADVANTAGE = 'r1bqkb1r/ppp2ppp/2n2n2/3pp3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq d6 0 5';

/**
 * Position for testing pawn promotion
 */
export const PROMOTION_TEST = '8/P7/8/8/8/8/8/K6k w - - 0 1';

/**
 * Position with many pieces (crowded board)
 */
export const CROWDED_BOARD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; // Same as starting

/**
 * Position with few pieces (open board)
 */
export const OPEN_BOARD = '8/8/4k3/8/8/4K3/8/8 w - - 0 1';

/**
 * Position for perft testing (Kiwipete position)
 * Famous position used for move generation testing
 */
export const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';

/**
 * Position for perft testing (Position 3)
 */
export const PERFT_POSITION_3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';

/**
 * Position for perft testing (Position 4)
 */
export const PERFT_POSITION_4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';

/**
 * Position for perft testing (Position 5)
 */
export const PERFT_POSITION_5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';

/**
 * Position for perft testing (Position 6)
 */
export const PERFT_POSITION_6 = 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10';

/**
 * Checkmate position: Scholar's mate
 */
export const SCHOLARS_MATE = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';

/**
 * Checkmate position: Fool's mate
 */
export const FOOLS_MATE = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';

/**
 * Checkmate position: Back rank mate
 */
export const BACK_RANK_CHECKMATE = '6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1';

/**
 * Stalemate position
 */
export const STALEMATE = '7k/8/6Q1/8/8/8/8/K7 b - - 0 1';

/**
 * Array of all standard positions for testing
 */
export const ALL_TEST_POSITIONS = [
  STARTING_FEN,
  AFTER_E4,
  AFTER_E4_E5,
  SICILIAN_DEFENSE,
  FRENCH_DEFENSE,
  CARO_KANN,
  KINGS_INDIAN,
  NO_CASTLING,
  WHITE_KINGSIDE_ONLY,
  BLACK_QUEENSIDE_ONLY,
  EN_PASSANT_WHITE,
  EN_PASSANT_BLACK,
  KP_VS_K,
  KR_VS_K,
  KQ_VS_K,
  LUCENA_POSITION,
  PHILIDOR_POSITION,
  BACK_RANK_MATE,
  PIN_POSITION,
  FORK_POSITION,
  SKEWER_POSITION,
  DISCOVERY_POSITION,
  BALANCED_MIDDLEGAME,
  WHITE_ADVANTAGE,
  BLACK_ADVANTAGE,
  PROMOTION_TEST,
  OPEN_BOARD,
  KIWIPETE,
  PERFT_POSITION_3,
  PERFT_POSITION_4,
  PERFT_POSITION_5,
  PERFT_POSITION_6,
  SCHOLARS_MATE,
  FOOLS_MATE,
  BACK_RANK_CHECKMATE,
  STALEMATE,
];

/**
 * Map of position names to their FEN strings for easy lookup
 */
export const POSITION_MAP: Record<string, string> = {
  'starting': STARTING_FEN,
  'after-e4': AFTER_E4,
  'after-e4-e5': AFTER_E4_E5,
  'sicilian': SICILIAN_DEFENSE,
  'french': FRENCH_DEFENSE,
  'caro-kann': CARO_KANN,
  'kings-indian': KINGS_INDIAN,
  'no-castling': NO_CASTLING,
  'white-kingside-only': WHITE_KINGSIDE_ONLY,
  'black-queenside-only': BLACK_QUEENSIDE_ONLY,
  'en-passant-white': EN_PASSANT_WHITE,
  'en-passant-black': EN_PASSANT_BLACK,
  'kp-vs-k': KP_VS_K,
  'kr-vs-k': KR_VS_K,
  'kq-vs-k': KQ_VS_K,
  'lucena': LUCENA_POSITION,
  'philidor': PHILIDOR_POSITION,
  'back-rank-mate': BACK_RANK_MATE,
  'pin': PIN_POSITION,
  'fork': FORK_POSITION,
  'skewer': SKEWER_POSITION,
  'discovery': DISCOVERY_POSITION,
  'balanced-middlegame': BALANCED_MIDDLEGAME,
  'white-advantage': WHITE_ADVANTAGE,
  'black-advantage': BLACK_ADVANTAGE,
  'promotion-test': PROMOTION_TEST,
  'open-board': OPEN_BOARD,
  'kiwipete': KIWIPETE,
  'perft-3': PERFT_POSITION_3,
  'perft-4': PERFT_POSITION_4,
  'perft-5': PERFT_POSITION_5,
  'perft-6': PERFT_POSITION_6,
  'scholars-mate': SCHOLARS_MATE,
  'fools-mate': FOOLS_MATE,
  'back-rank-checkmate': BACK_RANK_CHECKMATE,
  'stalemate': STALEMATE,
};
