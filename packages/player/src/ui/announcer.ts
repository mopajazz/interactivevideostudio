/** A polite aria-live region for screen-reader announcements. */
export class Announcer {
  private region: HTMLElement;
  private flip = false;

  constructor(root: HTMLElement) {
    this.region = document.createElement('div');
    this.region.className = 'ivp-announcer ivp-visually-hidden';
    this.region.setAttribute('aria-live', 'polite');
    this.region.setAttribute('aria-atomic', 'true');
    root.append(this.region);
  }

  say(msg: string): void {
    // A trailing no-break space on alternate calls makes a repeated message a real change, so it is read again.
    this.flip = !this.flip;
    this.region.textContent = this.flip ? msg : `${msg} `;
  }
}
