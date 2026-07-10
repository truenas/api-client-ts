import { describe, expect, it, vi } from 'vitest';
import { TrueNasSocket } from './truenas-socket';

describe('TrueNasSocket', () => {
  it('allows consumers to interface with the websocket', () => {
    const nasSocket = new TrueNasSocket({ url: 'truenas.not-found' });
    expect(nasSocket.socket).toBeDefined();
    expect(nasSocket.messages()).toBe(nasSocket.socket);
    const nextSpy = vi.spyOn(nasSocket.socket, 'next');
    const nextData = {};
    nasSocket.next(nextData);
    expect(nextSpy).toHaveBeenCalledWith(nextData);
    const completeSpy = vi.spyOn(nasSocket.socket, 'complete');
    nasSocket.complete();
    expect(completeSpy).toHaveBeenCalled();
  });
});
