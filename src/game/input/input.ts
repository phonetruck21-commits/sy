/**
 * Unified driver input. Keyboard and touch write into separate sources and the
 * vehicle reads the merged result, so both can be used at the same time.
 */
export interface DriveInput {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  nitro: boolean;
  /** optional analogue steering (-1 right .. 1 left); overrides left/right when set */
  steer?: number;
}

const empty = (): DriveInput => ({ throttle: false, brake: false, left: false, right: false, nitro: false });

export const keyboardInput = empty();
export const touchInput = empty();

export function readPlayerInput(): DriveInput {
  return {
    throttle: keyboardInput.throttle || touchInput.throttle,
    brake: keyboardInput.brake || touchInput.brake,
    left: keyboardInput.left || touchInput.left,
    right: keyboardInput.right || touchInput.right,
    nitro: keyboardInput.nitro || touchInput.nitro,
  };
}

export function clearInputs() {
  Object.assign(keyboardInput, empty());
  Object.assign(touchInput, empty());
}

type BoolKey = Exclude<keyof DriveInput, 'steer'>;
const KEYMAP: Record<string, BoolKey> = {
  ArrowUp: 'throttle', KeyW: 'throttle',
  ArrowDown: 'brake', KeyS: 'brake', Space: 'brake',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'nitro', ShiftRight: 'nitro', KeyN: 'nitro',
};

export function attachKeyboard(handlers: { onCamera: () => void; onPause: () => void; onRespawn: () => void }) {
  const down = (e: KeyboardEvent) => {
    const k = KEYMAP[e.code];
    if (k) {
      keyboardInput[k] = true;
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyC') handlers.onCamera();
    else if (e.code === 'Escape' || e.code === 'KeyP') handlers.onPause();
    else if (e.code === 'KeyR') handlers.onRespawn();
  };
  const up = (e: KeyboardEvent) => {
    const k = KEYMAP[e.code];
    if (k) keyboardInput[k] = false;
  };
  const blur = () => clearInputs();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    clearInputs();
  };
}
