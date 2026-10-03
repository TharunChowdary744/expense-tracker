import { z } from 'zod'

const email = z.string().trim().min(1, 'Enter your email').pipe(z.email('Enter a valid email'))

/** Firebase's minimum is 6; we ask for 8 and at least one letter and one number. */
const newPassword = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number')

const displayName = z.string().trim().min(1, 'Enter your name').max(60, 'Use at most 60 characters')

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
})
export type SignInValues = z.infer<typeof signInSchema>

export const signUpSchema = z
  .object({
    displayName,
    email,
    password: newPassword,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
export type SignUpValues = z.infer<typeof signUpSchema>

export const forgotPasswordSchema = z.object({ email })
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export const profileSchema = z.object({ displayName })
export type ProfileValues = z.infer<typeof profileSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one',
  })
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
