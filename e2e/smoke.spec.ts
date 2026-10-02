import { expect, test } from '@playwright/test'

test('app loads and shows the dashboard', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Ledgerly/)
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
})

test('navigation works', async ({ page, isMobile }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true })

  await nav.getByRole('link', { name: 'Transactions' }).click()
  await expect(page).toHaveURL(/\/transactions$/)
  await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible()

  if (isMobile) {
    await nav.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Reports' }).click()
  } else {
    await nav.getByRole('link', { name: 'Reports' }).click()
  }
  await expect(page).toHaveURL(/\/reports$/)
  await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible()
})

test('unknown URL shows the 404 page', async ({ page }) => {
  await page.goto('/definitely/not/a/page')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('theme toggle switches and survives reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).not.toHaveClass(/dark/)

  await page.getByRole('button', { name: 'Change theme' }).click()
  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(html).toHaveClass(/dark/)

  await page.reload()
  await expect(html).toHaveClass(/dark/)

  await page.getByRole('button', { name: 'Change theme' }).click()
  await page.getByRole('menuitemradio', { name: 'Light' }).click()
  await expect(html).not.toHaveClass(/dark/)
})

test('quick-add button is present and opens a dialog', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quick add' }).click()
  await expect(page.getByRole('dialog', { name: 'Quick add' })).toBeVisible()
})
