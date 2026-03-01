import { test, expect } from '@playwright/test';

test.describe('Navigation safety flow', () => {
    test('navigation screen renders routes and virtual shadow link flow', async ({ page }) => {
        await page.goto('/navigate');
        await expect(page.getByRole('heading', { name: /Bright-Path Navigation/i })).toBeVisible();
        await page.locator('#gen-shadow-link-btn').click();
        await expect(page.getByText(/ZKP Encrypted/i)).toBeVisible();
        await expect(page.getByText(/Expires in 3h/i)).toBeVisible();
    });
});
