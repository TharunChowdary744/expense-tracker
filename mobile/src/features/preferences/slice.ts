import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type ThemePreference = 'system' | 'light' | 'dark'

/** Device-only preferences, kept in AsyncStorage (see ./storage.ts). */
export interface PreferencesState {
  loaded: boolean
  theme: ThemePreference
  /** Local notifications for remind-mode recurring bills on their due day. */
  billReminders: boolean
  /** Show unread in-app notifications as device notifications. */
  deviceAlerts: boolean
}

export const initialPreferences: PreferencesState = {
  loaded: false,
  theme: 'system',
  billReminders: true,
  deviceAlerts: true,
}

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState: initialPreferences,
  reducers: {
    preferencesLoaded(state, action: PayloadAction<Partial<PreferencesState>>) {
      return { ...state, ...action.payload, loaded: true }
    },
    preferencesChanged(
      state,
      action: PayloadAction<Partial<Omit<PreferencesState, 'loaded'>>>,
    ) {
      return { ...state, ...action.payload }
    },
  },
})

export const { preferencesLoaded, preferencesChanged } = preferencesSlice.actions
export const preferencesReducer = preferencesSlice.reducer
