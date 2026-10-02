import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { useToast } from '@/features/ui/hooks'
import {
  useRemoveAvatarMutation,
  useUpdateDisplayNameMutation,
  useUploadAvatarMutation,
} from '../api'
import { AVATAR_TYPES, profileSchema, type ProfileValues } from '../schemas'
import type { AuthUser } from '../types'
import { FormMessage } from './FormMessage'
import { TextField } from './TextField'
import { UserAvatar } from './UserAvatar'

export function ProfileForm({ user }: { user: AuthUser }) {
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [updateName, { isLoading: saving }] = useUpdateDisplayNameMutation()
  const [uploadAvatar, { isLoading: uploading }] = useUploadAvatarMutation()
  const [removeAvatar, { isLoading: removing }] = useRemoveAvatarMutation()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user.displayName ?? '' },
  })

  async function onSubmit(values: ProfileValues) {
    setError(null)
    const result = await updateName(values)
    if ('error' in result) return setError(result.error as string)
    reset({ displayName: values.displayName.trim() })
    toast({ title: 'Profile updated', variant: 'success' })
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    const result = await uploadAvatar({ file })
    if ('error' in result) setError(result.error as string)
    else toast({ title: 'Photo updated', variant: 'success' })
    if (fileInput.current) fileInput.current.value = ''
  }

  async function onRemove() {
    setError(null)
    const result = await removeAvatar()
    if ('error' in result) setError(result.error as string)
    else toast({ title: 'Photo removed', variant: 'success' })
  }

  return (
    <section aria-labelledby="profile-heading" className="space-y-4 rounded-xl border bg-card p-5">
      <h2 id="profile-heading" className="text-lg font-semibold">
        Profile
      </h2>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <div className="flex items-center gap-4">
        <UserAvatar user={user} className="size-16 text-xl" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={AVATAR_TYPES.join(',')}
            aria-label="Profile photo file"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading || removing}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Change photo'}
          </Button>
          {user.photoURL && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading || removing}
              onClick={onRemove}
            >
              Remove photo
            </Button>
          )}
        </div>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <TextField
          label="Display name"
          autoComplete="name"
          error={errors.displayName?.message}
          {...register('displayName')}
        />
        <TextField label="Email" value={user.email ?? ''} readOnly disabled />
        <Button type="submit" disabled={saving || !isDirty}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </section>
  )
}
