export class ViewTransform {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.fitScale = 1;
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.isFit = true;
  }

  resize(width, height) {
    if (width <= 0 || height <= 0) return;
    const followFit = this.isFit || this.isAtFit;
    const oldWidth = this.viewportWidth;
    const oldHeight = this.viewportHeight;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.fitScale = Math.min(width / this.width, height / this.height);
    if (followFit) {
      this.reset();
    } else {
      this.x += (width - oldWidth) / 2;
      this.y += (height - oldHeight) / 2;
    }
  }

  zoomAt(x, y, factor) {
    const next = Math.min(this.fitScale * 16, Math.max(this.fitScale / 8, this.scale * factor));
    const ratio = next / this.scale;
    this.x = x - (x - this.x) * ratio;
    this.y = y - (y - this.y) * ratio;
    this.scale = next;
    this.isFit = this.isAtFit;
  }

  pan(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.isFit = this.isAtFit;
  }

  reset() {
    this.scale = this.fitScale;
    this.x = (this.viewportWidth - this.width * this.scale) / 2;
    this.y = (this.viewportHeight - this.height * this.scale) / 2;
    this.isFit = true;
  }

  get isAtFit() {
    if (!this.viewportWidth || !this.viewportHeight) return false;
    const x = (this.viewportWidth - this.width * this.fitScale) / 2;
    const y = (this.viewportHeight - this.height * this.fitScale) / 2;
    return Math.abs(this.scale - this.fitScale) <= Math.max(1e-9, this.fitScale * 1e-9)
      && Math.abs(this.x - x) <= 1e-6 && Math.abs(this.y - y) <= 1e-6;
  }

  get css() { return `translate(${this.x}px, ${this.y}px) scale(${this.scale})`; }
}
