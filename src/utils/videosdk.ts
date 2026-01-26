/**
 * VideoSDK API utilities
 * Handles room creation and validation using VideoSDK API
 */

const VIDEOSDK_API_BASE = 'https://api.videosdk.live/v2'

export interface VideoSDKRoom {
  roomId: string
  customRoomId?: string
  userId: string
  disabled: boolean
  createdAt: string
  updatedAt: string
  id: string
  links: {
    get_room: string
    get_session: string
  }
}

export interface CreateRoomOptions {
  customRoomId?: string
  webhook?: {
    endPoint: string
    events: string[]
  }
  autoCloseConfig?: {
    type: 'session-ends' | 'session-end-and-deactivate'
    duration: number
  }
}

/**
 * Generate VideoSDK JWT token
 * Note: This should typically be done server-side for security
 * For now, we'll use the API key directly in edge functions
 */
export async function generateVideoSDKToken(): Promise<string | null> {
  // Token generation should be done server-side
  // This is a placeholder - actual implementation should use VideoSDK API key/secret
  // to generate JWT token on the server
  console.warn('Token generation should be done server-side')
  return null
}

/**
 * Create a VideoSDK room
 * This should be called from a server-side function (Edge Function) for security
 */
export async function createVideoSDKRoom(
  token: string,
  options?: CreateRoomOptions
): Promise<VideoSDKRoom | null> {
  try {
    const response = await fetch(`${VIDEOSDK_API_BASE}/rooms`, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options || {}),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      console.error('Failed to create VideoSDK room:', error)
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    const data: VideoSDKRoom = await response.json()
    return data
  } catch (error) {
    console.error('Error creating VideoSDK room:', error)
    return null
  }
}

/**
 * Validate a VideoSDK room
 * Checks if a room exists and is valid
 */
export async function validateVideoSDKRoom(
  token: string,
  roomId: string
): Promise<VideoSDKRoom | null> {
  try {
    const response = await fetch(`${VIDEOSDK_API_BASE}/rooms/validate/${roomId}`, {
      method: 'GET',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      console.error('Failed to validate VideoSDK room:', error)
      return null
    }

    const data: VideoSDKRoom = await response.json()
    return data
  } catch (error) {
    console.error('Error validating VideoSDK room:', error)
    return null
  }
}

/**
 * Get meeting join URL
 */
export function getMeetingJoinUrl(roomId: string): string {
  return `https://api.videosdk.live/meeting/${roomId}`
}
