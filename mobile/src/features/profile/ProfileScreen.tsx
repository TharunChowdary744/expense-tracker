import { zodResolver } from '@hookform/resolvers/zod'
import { Image } from 'expo-image'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { StyleSheet, View } from 'react-native'
import {
  useChangePasswordMutation,
  useRemoveAvatarMutation,
  useSignOutMutation,
  useUpdateDisplayNameMutation,
  useUploadAvatarMutation,
} from '@/features/auth/api'
import { useAuth } from '@/features/auth/hooks'
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordValues,
  type ProfileValues,
} from '@/features/auth/schemas'
import type { AuthUser } from '@/features/auth/types'
import { userInitial } from '@/features/auth/utils'
import { useToast } from '@/features/ui/hooks'
import { FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { Card, CardHeader } from '@m/components/ui/Card'
import { TextField } from '@m/components/ui/Field'
import { Text } from '@m/components/ui/Text'
import { useColors } from '@m/theme/ThemeProvider'
import { fileSize } from '@m/utils/files'

/** Avatars are cropped square and saved as a 512px JPEG, well under the 2 MB limit. */
const AVATAR_SIZE = 512

export function UserAvatar({ user, size = 64 }: { user: AuthUser; size?: number }) {
  const c = useColors()
  const box = { width: size, height: size, borderRadius: size / 2 }
  if (user.photoURL) {
    return (
      <Image
        source={{ uri: user.photoURL }}
        style={box}
        accessibilityIgnoresInvertColors
        contentFit="cover"
      />
    )
  }
  return (
    <View
      style={[box, styles.initial, { backgroundColor: c.primary }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text weight="600" style={{ color: c.primaryForeground, fontSize: size * 0.4 }}>
        {userInitial(user)}
      </Text>
    </View>
  )
}

function ProfileForm({ user }: { user: AuthUser }) {
  const toast = useToast()
  const [updateName, { isLoading: saving }] = useUpdateDisplayNameMutation()
  const [uploadAvatar, { isLoading: uploading }] = useUploadAvatarMutation()
  const [removeAvatar, { isLoading: removing }] = useRemoveAvatarMutation()
  const [error, setError] = useState<string | null>(null)
  const {
    control,
    handleSubmit,
    formState: { isDirty },
    reset,
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user.displayName ?? '' },
  })

  const submit = handleSubmit(async (values) => {
    setError(null)
    const result = await updateName(values)
    if ('error' in result) return setError(String(result.error))
    reset({ displayName: values.displayName.trim() })
    toast({ title: 'Profile updated', variant: 'success' })
  })

  async function changePhoto() {
    setError(null)
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    })
    const asset = picked.canceled ? undefined : picked.assets[0]
    if (!asset) return
    try {
      const context = ImageManipulator.manipulate(asset.uri)
      context.resize({ width: AVATAR_SIZE, height: AVATAR_SIZE })
      const image = await context.renderAsync()
      const saved = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG })
      const result = await uploadAvatar({
        image: { uri: saved.uri, mimeType: 'image/jpeg', size: fileSize(saved.uri) },
      })
      if ('error' in result) setError(String(result.error))
      else toast({ title: 'Photo updated', variant: 'success' })
    } catch {
      setError('That photo couldn’t be used. Try another one.')
    }
  }

  async function onRemove() {
    setError(null)
    const result = await removeAvatar()
    if ('error' in result) setError(String(result.error))
    else toast({ title: 'Photo removed', variant: 'success' })
  }

  return (
    <Card>
      <CardHeader title="Profile" />
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      <View style={styles.avatarRow}>
        <UserAvatar user={user} />
        <View style={styles.avatarButtons}>
          <Button
            title={uploading ? 'Uploading…' : 'Change photo'}
            variant="outline"
            size="sm"
            loading={uploading}
            disabled={removing}
            onPress={() => void changePhoto()}
          />
          {user.photoURL ? (
            <Button
              title="Remove photo"
              variant="ghost"
              size="sm"
              disabled={uploading || removing}
              onPress={() => void onRemove()}
            />
          ) : null}
        </View>
      </View>
      <FormTextField
        control={control}
        name="displayName"
        label="Display name"
        autoComplete="name"
      />
      <TextField label="Email" value={user.email ?? ''} editable={false} />
      <Button
        title={saving ? 'Saving…' : 'Save changes'}
        loading={saving}
        disabled={!isDirty}
        style={styles.start}
        onPress={() => void submit()}
      />
    </Card>
  )
}

function ChangePasswordForm({ user }: { user: AuthUser }) {
  const toast = useToast()
  const [changePassword, { isLoading }] = useChangePasswordMutation()
  const [error, setError] = useState<string | null>(null)
  const { control, handleSubmit, reset } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const hasPassword = user.providerIds.includes('password')

  const submit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setError(null)
    const result = await changePassword({ currentPassword, newPassword })
    if ('error' in result) return setError(String(result.error))
    reset()
    toast({ title: 'Password changed', variant: 'success' })
  })

  return (
    <Card>
      <CardHeader title="Password" />
      {!hasPassword ? (
        <Text variant="small" tone="muted">
          You sign in with Google, so there is no Ledgerly password to change.
        </Text>
      ) : (
        <>
          {error ? <FormMessage kind="error">{error}</FormMessage> : null}
          <FormTextField
            control={control}
            name="currentPassword"
            label="Current password"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
          />
          <FormTextField
            control={control}
            name="newPassword"
            label="New password"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            hint="At least 8 characters with a letter and a number."
          />
          <FormTextField
            control={control}
            name="confirmPassword"
            label="Confirm new password"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Button
            title={isLoading ? 'Changing…' : 'Change password'}
            loading={isLoading}
            style={styles.start}
            onPress={() => void submit()}
          />
        </>
      )}
    </Card>
  )
}

export function ProfileScreen() {
  const { user } = useAuth()
  const [signOut, { isLoading }] = useSignOutMutation()
  if (!user) return null
  return (
    <Screen>
      <ProfileForm user={user} />
      <ChangePasswordForm user={user} />
      <Card>
        <CardHeader title="Sign out" />
        <Text variant="small" tone="muted">
          Signing out ends your session on this device.
        </Text>
        <Button
          title="Sign out"
          variant="outline"
          loading={isLoading}
          style={styles.start}
          onPress={() => void signOut()}
        />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  initial: { alignItems: 'center', justifyContent: 'center' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1 },
  start: { alignSelf: 'flex-start' },
})
