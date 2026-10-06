import { skipToken } from '@reduxjs/toolkit/query/react'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import type { z } from 'zod'
import { useAuth } from '@/features/auth/hooks'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import { docListener, firestoreWrite, type Stored } from '@/services/firestore'
import {
  deviceSettingsSchema,
  settingsUpdate,
  type DeviceSettings,
  type SettingsPatch,
} from './settingsPatch'

export { deviceSettingsSchema, settingsUpdate }
export type { DeviceSettings, NotificationPrefs, SettingsPatch } from './settingsPatch'

export const mobileSettingsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getDeviceSettings: build.query<Stored<z.output<typeof deviceSettingsSchema>> | null, string>({
      ...docListener({
        label: 'your settings',
        uidOf: (uid: string) => uid,
        schema: deviceSettingsSchema,
        doc: (uid, db) => doc(db, 'users', uid),
      }),
      providesTags: (_result, _error, uid) => [{ type: 'User', id: uid }],
    }),

    updateSettings: build.mutation<null, { uid: string; patch: SettingsPatch }>({
      queryFn: ({ uid, patch }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not save your settings', () => ({
          commit: updateDoc(doc(getFirebase().db, 'users', uid), {
            ...settingsUpdate(patch),
            updatedAt: serverTimestamp(),
          }),
          result: null,
        })),
    }),
  }),
})

export const { useGetDeviceSettingsQuery, useUpdateSettingsMutation } = mobileSettingsApi

/** The signed-in user's editable settings, or null until users/{uid} has loaded. */
export function useDeviceSettings(): DeviceSettings | null {
  const { user } = useAuth()
  const { data } = useGetDeviceSettingsQuery(user?.uid ?? skipToken)
  return data?.settings ?? null
}
