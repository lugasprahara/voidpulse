// Keyboard and mouse state, polled by the game loop.
//
// The rest of the game never touches DOM events directly: it reads the
// `keys` set, the mouse position in world coordinates, and the edge-trigger
// queues (pressed / clicked) that the loop drains once per frame. Mouse
// coordinates are converted through the canvas rectangle so aiming stays
// true whatever size the window is scaled to.

export class Input {
  constructor(canvas, viewW, viewH) {
    this.canvas = canvas;
    this.viewW = viewW;
    this.viewH = viewH;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseX = viewW / 2;
    this.mouseY = viewH / 2;
    this.mouseDown = false;
    this.rightDown = false;
    this.clicked = false;
    this.rightClicked = false;

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.rightDown = false;
    });

    canvas.addEventListener('mousemove', (e) => this.updateMouse(e));
    canvas.addEventListener('mousedown', (e) => {
      this.updateMouse(e);
      if (e.button === 0) {
        this.mouseDown = true;
        this.clicked = true;
      }
      if (e.button === 2) {
        this.rightDown = true;
        this.rightClicked = true;
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  updateMouse(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = ((e.clientX - rect.left) / rect.width) * this.viewW;
    this.mouseY = ((e.clientY - rect.top) / rect.height) * this.viewH;
  }

  // Movement axes from WASD + arrows, normalised so diagonals are not faster.
  moveAxis() {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = Math.SQRT1_2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  firing() {
    return this.mouseDown || this.keys.has('Space');
  }

  dashQueued() {
    return this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight') || this.rightClicked;
  }

  // Called at the end of each frame so edge triggers live exactly one frame.
  endFrame() {
    this.pressed.clear();
    this.clicked = false;
    this.rightClicked = false;
  }
}
