/**
 * Secure token generation utilities
 */

/**
 * Generate a secure random token
 */
export function generateSecureToken(): string {
  // Generate a cryptographically secure random token
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  
  // Convert to base64url (URL-safe)
  const base64 = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  
  return base64
}

/**
 * Validate token format
 */
export function isValidToken(token: string): boolean {
  // Token should be base64url encoded, 32+ characters
  return /^[A-Za-z0-9_-]{32,}$/.test(token)
}
