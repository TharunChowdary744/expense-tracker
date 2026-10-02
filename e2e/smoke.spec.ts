import { expect, test } from '@playwright/test'

// The app now requires sign-in. These smoke tests cover what works without a Firebase
// backend: the signed-out shell. Signed-in flows are checked manually against the emulators
// (see the phase 2 checklist) because they need the Auth and Firestore emulators.

test('signed-out visitors land on the sign-in page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Ledgerly/)
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
})

test('a protected URL redirects to sign-in', async ({ page }) => {
  await page.goto('/transactions')
  await expect(page).toHaveURL(/\/sign-in$/)
})

test('auth pages link to each other', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL(/\/sign-up$/)
  await expect(page.getByRole('heading', { name: 'Create your account', level: 1 })).toBeVisible()

  await page.getByRole('link', { name: 'Sign in' }).click()
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await expect(page.getByRole('heading', { name: 'Reset your password', level: 1 })).toBeVisible()
})

test('sign-in form validates before calling Firebase', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Enter your email')).toBeVisible()
  await expect(page.getByText('Enter your password')).toBeVisible()
})
