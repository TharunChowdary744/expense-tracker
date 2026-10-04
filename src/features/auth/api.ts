import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { appPath } from '@/app/basePath'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import { toastAdded } from '@/features/ui/slice'
import { ensureUserBootstrap } from './bootstrap'
import { AuthFormError, getAuthErrorCode, getAuthErrorMessage } from './errors'
import { shouldUseRedirectSignIn } from './platform'
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from './schemas'
import { authStateChanged, bootstrapStatusChanged, signOutRequested, userUpdated } from './slice'
import type { AuthUser } from './types'

export function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
    providerIds: user.providerData.map((p) => p.providerId),
  }
}

const SIGN_OUT_CHANNEL = 'ledgerly-auth'

function currentUser(): User {
  const user = getFirebase().auth.currentUser
  if (!user) throw new AuthFormError('You are signed out. Sign in and try again.')
  return user
}

function locale(): string | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.language
}

/** Wraps a queryFn body so thrown Firebase errors become a user-facing message string. */
async function run<T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> {
  try {
    return { data: await fn() }
  } catch (error) {
    return { error: getAuthErrorMessage(error) }
  }
}

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    /**
     * Subscribes to onAuthStateChanged for as long as a component holds this query.
     * Results go to the auth slice (serialisable fields only); the query data itself is unused.
     */
    authState: build.query<null, void>({
      queryFn: () => ({ data: null }),
      async onCacheEntryAdded(_arg, { dispatch, cacheEntryRemoved }) {
        let auth
        try {
          auth = getFirebase().auth
        } catch {
          dispatch(authStateChanged(null))
          dispatch(
            toastAdded({
              title: 'Firebase is not configured',
              description: 'Add your VITE_FIREBASE_* values to .env.local and restart.',
              variant: 'error',
            }),
          )
          return
        }

        // Completes a Google redirect sign-in; auth state itself arrives via the listener.
        getRedirectResult(auth).catch((error: unknown) => {
          dispatch(
            toastAdded({
              title: 'Google sign-in failed',
              description: getAuthErrorMessage(error),
              variant: 'error',
            }),
          )
        })

        const channel =
          typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SIGN_OUT_CHANNEL)
        if (channel) {
          channel.onmessage = (event: MessageEvent<unknown>) => {
            if (event.data === 'signed-out') window.location.assign(appPath('/sign-in'))
          }
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
          dispatch(authStateChanged(user ? toAuthUser(user) : null))
          if (!user) return

          // Seed in the background: the app stays usable offline, and a failed attempt is
          // simply retried on the next sign-in or page load.
          dispatch(bootstrapStatusChanged('running'))
          ensureUserBootstrap(getFirebase().db, user, locale())
            .then(() => dispatch(bootstrapStatusChanged('done')))
            .catch(() => dispatch(bootstrapStatusChanged('error')))
        })

        await cacheEntryRemoved
        unsubscribe()
        channel?.close()
      },
    }),

    signIn: build.mutation<null, { email: string; password: string }>({
      queryFn: ({ email, password }) =>
        run(async () => {
          await signInWithEmailAndPassword(getFirebase().auth, email, password)
          return null
        }),
    }),

    signUp: build.mutation<null, { displayName: string; email: string; password: string }>({
      queryFn: ({ displayName, email, password }, { dispatch }) =>
        run(async () => {
          const { auth, db } = getFirebase()
          const { user } = await createUserWithEmailAndPassword(auth, email, password)
          await updateProfile(user, { displayName })
          dispatch(userUpdated(toAuthUser(user)))
          // The auth listener starts seeding as soon as the account exists, before the display
          // name is set; wait for that same run, then store the final name.
          await ensureUserBootstrap(db, user, locale())
          await updateDoc(doc(db, 'users', user.uid), { displayName, updatedAt: serverTimestamp() })
          await sendEmailVerification(user)
          return null
        }),
    }),

    signInWithGoogle: build.mutation<null, void>({
      queryFn: () =>
        run(async () => {
          const { auth } = getFirebase()
          const provider = new GoogleAuthProvider()
          provider.setCustomParameters({ prompt: 'select_account' })
          if (shouldUseRedirectSignIn()) {
            await signInWithRedirect(auth, provider)
            return null
          }
          try {
            await signInWithPopup(auth, provider)
          } catch (error) {
            if (getAuthErrorCode(error) !== 'auth/popup-blocked') throw error
            await signInWithRedirect(auth, provider)
          }
          return null
        }),
    }),

    sendPasswordReset: build.mutation<null, { email: string }>({
      queryFn: ({ email }) =>
        run(async () => {
          try {
            await sendPasswordResetEmail(getFirebase().auth, email)
          } catch (error) {
            // Do not reveal which emails have accounts.
            if (getAuthErrorCode(error) !== 'auth/user-not-found') throw error
          }
          return null
        }),
    }),

    resendVerification: build.mutation<null, void>({
      queryFn: () =>
        run(async () => {
          await sendEmailVerification(currentUser())
          return null
        }),
    }),

    /** Re-reads the account from Firebase, e.g. after the user clicked the verification link. */
    refreshUser: build.mutation<AuthUser, void>({
      queryFn: (_arg, { dispatch }) =>
        run(async () => {
          const user = currentUser()
          await user.reload()
          const next = toAuthUser(user)
          dispatch(userUpdated(next))
          return next
        }),
    }),

    signOut: build.mutation<null, { allTabs?: boolean } | void>({
      queryFn: (arg, { dispatch }) =>
        run(async () => {
          dispatch(signOutRequested())
          // Firebase Auth persistence is shared by every tab on this browser, so this ends the
          // session in all of them; "all tabs" also tells the others to leave the app right away.
          await signOut(getFirebase().auth)
          if (arg?.allTabs && typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel(SIGN_OUT_CHANNEL)
            channel.postMessage('signed-out')
            channel.close()
          }
          return null
        }),
    }),

    updateDisplayName: build.mutation<null, { displayName: string }>({
      queryFn: ({ displayName }, { dispatch }) =>
        run(async () => {
          const user = currentUser()
          await updateProfile(user, { displayName })
          await updateDoc(doc(getFirebase().db, 'users', user.uid), {
            displayName,
            updatedAt: serverTimestamp(),
          })
          dispatch(userUpdated(toAuthUser(user)))
          return null
        }),
    }),

    uploadAvatar: build.mutation<null, { file: File }>({
      queryFn: ({ file }, { dispatch }) =>
        run(async () => {
          if (!AVATAR_TYPES.includes(file.type)) {
            throw new AuthFormError('Choose a JPEG, PNG or WebP image.')
          }
          if (file.size > AVATAR_MAX_BYTES) {
            throw new AuthFormError('Choose an image smaller than 2 MB.')
          }
          const user = currentUser()
          const { storage, db } = getFirebase()
          const avatarRef = ref(storage, `users/${user.uid}/avatar`)
          await uploadBytes(avatarRef, file, { contentType: file.type })
          // Same object path on every upload, so bust the browser cache with a version param.
          const photoURL = `${await getDownloadURL(avatarRef)}&v=${Date.now()}`
          await updateProfile(user, { photoURL })
          await updateDoc(doc(db, 'users', user.uid), { photoURL, updatedAt: serverTimestamp() })
          dispatch(userUpdated(toAuthUser(user)))
          return null
        }),
    }),

    removeAvatar: build.mutation<null, void>({
      queryFn: (_arg, { dispatch }) =>
        run(async () => {
          const user = currentUser()
          const { storage, db } = getFirebase()
          try {
            await deleteObject(ref(storage, `users/${user.uid}/avatar`))
          } catch (error) {
            // Photos from Google sign-in have no stored object to delete.
            if (getAuthErrorCode(error) !== 'storage/object-not-found') throw error
          }
          await updateProfile(user, { photoURL: null })
          await updateDoc(doc(db, 'users', user.uid), {
            photoURL: '',
            updatedAt: serverTimestamp(),
          })
          dispatch(userUpdated(toAuthUser(user)))
          return null
        }),
    }),

    changePassword: build.mutation<null, { currentPassword: string; newPassword: string }>({
      queryFn: ({ currentPassword, newPassword }) =>
        run(async () => {
          const user = currentUser()
          if (!user.email) throw new AuthFormError('This account has no email address.')
          try {
            await reauthenticateWithCredential(
              user,
              EmailAuthProvider.credential(user.email, currentPassword),
            )
          } catch (error) {
            const code = getAuthErrorCode(error)
            if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
              throw new AuthFormError('Your current password is incorrect.')
            }
            throw error
          }
          await updatePassword(user, newPassword)
          return null
        }),
    }),
  }),
})

export const {
  useAuthStateQuery,
  useSignInMutation,
  useSignUpMutation,
  useSignInWithGoogleMutation,
  useSendPasswordResetMutation,
  useResendVerificationMutation,
  useRefreshUserMutation,
  useSignOutMutation,
  useUpdateDisplayNameMutation,
  useUploadAvatarMutation,
  useRemoveAvatarMutation,
  useChangePasswordMutation,
} = authApi
