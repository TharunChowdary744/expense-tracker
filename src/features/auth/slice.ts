import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { AuthStatus, AuthUser, BootstrapStatus } from './types'

export interface AuthState {
  /** `loading` until the first onAuthStateChanged event arrives. */
  status: AuthStatus
  user: AuthUser | null
  /** First-sign-in seeding of the user document, categories and Cash account. */
  bootstrap: BootstrapStatus
  /** True after the user chose to sign out, so the next sign-in does not return to the old page. */
  signedOutByUser: boolean
}

const initialState: AuthState = {
  status: 'loading',
  user: null,
  bootstrap: 'idle',
  signedOutByUser: false,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    authStateChanged(state, action: PayloadAction<AuthUser | null>) {
      const next = action.payload
      if (state.user?.uid !== next?.uid) state.bootstrap = 'idle'
      if (next) state.signedOutByUser = false
      state.user = next
      state.status = next ? 'authenticated' : 'unauthenticated'
    },
    /** Profile edits and reloads do not fire onAuthStateChanged, so they are dispatched. */
    userUpdated(state, action: PayloadAction<AuthUser>) {
      if (state.user?.uid === action.payload.uid) state.user = action.payload
    },
    signOutRequested(state) {
      state.signedOutByUser = true
    },
    bootstrapStatusChanged(state, action: PayloadAction<BootstrapStatus>) {
      state.bootstrap = action.payload
    },
  },
})

export const { authStateChanged, userUpdated, signOutRequested, bootstrapStatusChanged } =
  authSlice.actions
export const authReducer = authSlice.reducer
