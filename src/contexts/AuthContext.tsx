import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { setClerkSupabaseAccessToken, supabase } from '../lib/supabase'
import { useAuth as useClerkAuth, useUser } from '@clerk/react'

type AuthContextValue = {
  session: Session | null
  user: User | null
  isSignedIn: boolean
  loading: boolean
  syncError: string | null
  clearSyncError: () => void
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

function clerkToUser(
  clerkUser: ReturnType<typeof useUser>['user']
): User | null {
  if (!clerkUser) return null
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? undefined
  return {
    id: clerkUser.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: email ?? '',
    email_confirmed_at: undefined,
    phone: '',
    confirmed_at: undefined,
    last_sign_in_at: undefined,
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: clerkUser.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updated_at: clerkUser.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    is_anonymous: false,
  } as User
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profileSyncing, setProfileSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const { isLoaded: clerkLoaded, isSignedIn, getToken, signOut: clerkSignOut } = useClerkAuth()
  const { user: clerkUser } = useUser()

  // Before paint: any signed-in user must wait for profile sync (avoids RequireAuth flash).
  useLayoutEffect(() => {
    if (!clerkLoaded) return
    if (isSignedIn) setProfileSyncing(true)
    else setProfileSyncing(false)
  }, [clerkLoaded, isSignedIn])

  useEffect(() => {
    if (!clerkLoaded) return

    if (!isSignedIn) {
      setClerkSupabaseAccessToken(() => Promise.resolve(null))
      setSyncError(null)
      return
    }

    setClerkSupabaseAccessToken(() => getToken())
    setSyncError(null)

    let cancelled = false
    const syncProfile = async () => {
      try {
        const uid = clerkUser?.id
        if (!uid) {
          throw new Error('Clerk user not ready')
        }
        const { error } = await supabase.from('hr_profiles').upsert(
          {
            id: uid,
            email: clerkUser.primaryEmailAddress?.emailAddress ?? null,
          },
          { onConflict: 'id' }
        )
        if (error) throw error
      } catch (err) {
        console.error('[AuthContext] hr_profiles sync failed:', err)
        if (!cancelled) {
          setSyncError(
            err instanceof Error
              ? err.message
              : 'Could not sync HR profile. Check RLS and Clerk third-party auth in Supabase.'
          )
        }
      } finally {
        if (!cancelled) setProfileSyncing(false)
      }
    }

    syncProfile()
    return () => {
      cancelled = true
    }
  }, [
    clerkLoaded,
    isSignedIn,
    getToken,
    clerkUser?.id,
    clerkUser?.primaryEmailAddress?.emailAddress,
  ])

  const signOut = useCallback(async () => {
    setClerkSupabaseAccessToken(() => Promise.resolve(null))
    await clerkSignOut()
  }, [clerkSignOut])

  const refreshSession = useCallback(async () => {
    await getToken()
  }, [getToken])

  const clearSyncError = useCallback(() => setSyncError(null), [])

  const loading = !clerkLoaded || (isSignedIn && profileSyncing)

  const value = useMemo<AuthContextValue>(
    () => ({
      session: null,
      user: clerkToUser(clerkUser),
      isSignedIn: Boolean(clerkLoaded && isSignedIn),
      loading,
      syncError,
      clearSyncError,
      signOut,
      refreshSession,
    }),
    [
      clerkLoaded,
      isSignedIn,
      clerkUser,
      loading,
      syncError,
      clearSyncError,
      signOut,
      refreshSession,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
