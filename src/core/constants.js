/** Shared dimensions and timing. All physics runs on a fixed 60 Hz step. */

export const TILE = 16;
export const ROWS = 12; // every stage is exactly one screen tall
export const VIEW_COLS = 20;
export const VIEW_W = VIEW_COLS * TILE; // 320
export const VIEW_H = ROWS * TILE; // 192
export const ARENA_COLS = VIEW_COLS; // the boss arena is exactly the last screen of a stage
export const FLOOR_ROW = 10; // the arena floor (and most stage ground) starts on this row
export const DT = 1 / 60;
