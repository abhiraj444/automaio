import { CDPSession, Page } from 'playwright';

export interface RemoteInputEvent {
  type: 'click' | 'mousemove' | 'mousedown' | 'mouseup' | 'keydown' | 'keyup' | 'type';
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle';
  key?: string;
  text?: string;
}

export class RemoteInputForwarder {
  constructor(private page: Page, private getCdp: () => CDPSession | null) {}

  async dispatch(event: RemoteInputEvent): Promise<void> {
    const cdp = this.getCdp();

    switch (event.type) {
      case 'click':
      case 'mousedown':
      case 'mouseup': {
        if (event.x !== undefined && event.y !== undefined) {
          if (cdp) {
            const buttonType = event.button || 'left';
            const eventType = event.type === 'click' ? 'mousePressed' : (event.type === 'mousedown' ? 'mousePressed' : 'mouseReleased');
            
            await cdp.send('Input.dispatchMouseEvent', {
              type: eventType,
              x: event.x,
              y: event.y,
              button: buttonType,
              clickCount: 1
            });

            if (event.type === 'click') {
              await cdp.send('Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x: event.x,
                y: event.y,
                button: buttonType,
                clickCount: 1
              });
            }
          } else {
            await this.page.mouse.click(event.x, event.y, { button: event.button || 'left' });
          }
        }
        break;
      }

      case 'mousemove': {
        if (event.x !== undefined && event.y !== undefined) {
          if (cdp) {
            await cdp.send('Input.dispatchMouseEvent', {
              type: 'mouseMoved',
              x: event.x,
              y: event.y
            });
          } else {
            await this.page.mouse.move(event.x, event.y);
          }
        }
        break;
      }

      case 'type': {
        if (event.text) {
          if (cdp) {
            for (const char of event.text) {
              await cdp.send('Input.dispatchKeyEvent', {
                type: 'char',
                text: char
              });
            }
          } else {
            await this.page.keyboard.type(event.text);
          }
        }
        break;
      }

      case 'keydown':
      case 'keyup': {
        if (event.key) {
          if (cdp) {
            await cdp.send('Input.dispatchKeyEvent', {
              type: event.type === 'keydown' ? 'rawKeyDown' : 'keyUp',
              key: event.key
            });
          } else {
            if (event.type === 'keydown') await this.page.keyboard.down(event.key);
            else await this.page.keyboard.up(event.key);
          }
        }
        break;
      }
    }
  }
}
