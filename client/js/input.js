// client/js/input.js — Keyboard input capture

export class InputManager {
  constructor() {
    this._keys = {};
    this._justPressed = {};

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
  }

  start() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  stop() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
    this._keys = {};
  }

  _onKeyDown(e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    const k = e.code;
    if (!this._keys[k]) this._justPressed[k] = true;
    this._keys[k] = true;
  }

  _onKeyUp(e) {
    this._keys[e.code] = false;
  }

  get() {
    return {
      up:           !!(this._keys['KeyW']     || this._keys['ArrowUp']),
      down:         !!(this._keys['KeyS']     || this._keys['ArrowDown']),
      left:         !!(this._keys['KeyA']     || this._keys['ArrowLeft']),
      right:        !!(this._keys['KeyD']     || this._keys['ArrowRight']),
      fire:         !!(this._keys['Space']),
      dash:         !!(this._keys['ShiftLeft']  || this._keys['ShiftRight']),
      dodge:        !!(this._keys['ControlLeft'] || this._keys['ControlRight']),
      switchWeapon: !!(this._justPressed['KeyQ']),
    };
  }

  /** Call once per frame after consuming justPressed */
  flush() {
    this._justPressed = {};
  }
}
