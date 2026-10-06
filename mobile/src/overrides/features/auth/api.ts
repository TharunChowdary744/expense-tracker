import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { getLocales } from 'expo-localization'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import { toastAdded } from '@/features/ui/slice'
import { ensureUserBootstrap } from '@/features/auth/bootstrap'
import { AuthFormError, getAuthErrorCode, getAuthErrorMessage } from '@/features/auth/errors'
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from '@/features/auth/schemas'
import {
  authStateChanged,
  bootstrapStatusChanged,
  signOutRequested,
  userUpdated,
} from '@/features/auth/slice'
import type { AuthUser } from '@/features/auth/types'
import { readFileBlob } from '@m/utils/files'

/**
 * React Native version of the web app's src/features/auth/api.ts. Same endpoints and hooks;
 * the differences are Google sign-in (an ID token from expo-auth-session instead of a popup or
 * redirect) and the avatar upload (a local file URI instead of a browser File).
 */
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

function currentUser(): User {
  const user = getFirebase().auth.currentUser
  if (!user) throw new AuthFormError('You are signed out. Sign in and try again.')
  return user
}

export function deviceLocale(): string | undefined {
  try {
    return getLocales()[0]?.languageTag
  } catch {
    return undefined
  }
}

async function run<T>(fn: () => Promise<T>): Promise<{ data: T } | { error: string }> {
  try {
    return { data: await fn() }
  } catch (error) {
    return { error: getAuthErrorMessage(error) }
  }
}

/** A picked image: a local file URI with its type and size (from expo-image-picker). */
export interface LocalImage {
  uri: string
  mimeType: string
  size: number
}

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
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
              description: 'Add the EXPO_PUBLIC_FIREBASE_* values to mobile/.env and restart.',
              variant: 'error',
            }),
          )
          return
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
          dispatch(authStateChanged(user ? toAuthUser(user) : null))
          if (!user) return
          dispatch(bootstrapStatusChanged('running'))
          ensureUserBootstrap(getFirebase().db, user, deviceLocale())
            .then(() => dispatch(bootstrapStatusChanged('done')))
            .catch(() => dispatch(bootstrapStatusChanged('error')))
        })

        await cacheEntryRemoved
        unsubscribe()
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
          await ensureUserBootstrap(db, user, deviceLocale())
          await updateDoc(doc(db, 'users', user.uid), { displayName, updatedAt: serverTimestamp() })
          await sendEmailVerification(user)
          return null
        }),
    }),

    /** Completes Google sign-in with the ID token returned by expo-auth-session. */
    signInWithGoogle: build.mutation<null, { idToken: string }>({
      queryFn: ({ idToken }) =>
        run(async () => {
          await signInWithCredential(getFirebase().auth, GoogleAuthProvider.credential(idToken))
          return null
        }),
    }),

    sendPasswordReset: build.mutation<null, { email: string }>({
      queryFn: ({ email }) =>
        run(async () => {
          try {
            await sendPasswordResetEmail(getFirebase().auth, email)
          } catch (error) {
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

    signOut: build.mutation<null, void>({
      queryFn: (_arg, { dispatch }) =>
        run(async () => {
          dispatch(signOutRequested())
          await signOut(getFirebase().auth)
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

    uploadAvatar: build.mutation<null, { image: LocalImage }>({
      queryFn: ({ image }, { dispatch }) =>
        run(async () => {
          if (!AVATAR_TYPES.includes(image.mimeType)) {
            throw new AuthFormError('Choose a JPEG, PNG or WebP image.')
          }
          if (image.size > AVATAR_MAX_BYTES) {
            throw new AuthFormError('Choose an image smaller than 2 MB.')
          }
          const user = currentUser()
          const { storage, db } = getFirebase()
          const avatarRef = ref(storage, `users/${user.uid}/avatar`)
          const blob = await readFileBlob(image.uri)
          await uploadBytes(avatarRef, blob, { contentType: image.mimeType })
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
