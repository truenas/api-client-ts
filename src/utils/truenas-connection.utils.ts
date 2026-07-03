export function isHttpStatusError(reason: string): boolean {
  return ['404', '502', '503'].some(code => reason.includes(code));
}

export function getHttpError(reason: string): string {
  if (reason.includes('404')) {
    return 'API endpoint not found - System may not support versioned API';
  }
  if (reason.includes('502')) {
    return 'Bad Gateway - System may be starting up';
  }
  if (reason.includes('503')) {
    return 'Service Unavailable - System may be overloaded';
  }
  return '';
}

export function getWebSocketError(code: number): string {
  switch (code) {
    case 1000: // Normal closure
      return 'Connection closed normally';
    case 1001: // Going away
      return 'Server is shutting down or restarting';
    case 1002: // Protocol error
      return 'Protocol error - Invalid WebSocket communication';
    case 1003: // Unsupported data
      return 'Unsupported data format received';
    case 1006: // Abnormal closure
      return 'Connection lost unexpectedly - Check network connectivity';
    case 1007: // Invalid frame payload data
      return 'Invalid data received from server';
    case 1008: // Policy violation
      return 'Connection terminated due to policy violation';
    case 1009: // Message too big
      return 'Message size exceeded server limits';
    case 1011: // Internal error
      return 'Server encountered an internal error';
    case 1012: // Service restart
      return 'Service is restarting';
    case 1013: // Try again later
      return 'Server temporarily overloaded - Try again later';
    case 1015: // TLS handshake failure
      return 'TLS/Certificate error - Certificate may be expired';
    default:
      // Fallback for unknown codes or network issues
      return 'Network connection failed - Check IP address and connectivity';
  }
}
