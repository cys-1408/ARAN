import { test, expect } from '@playwright/test';

test.describe('SOS critical flow', () => {
    test('manual SOS opens intent window and allows cancel', async ({ page }) => {
        await page.goto('/sos');
        await page.locator('#manual-sos-btn').click();
        await expect(page.getByRole('alertdialog', { name: /SOS Intent Verification/i })).toBeVisible();
        await page.locator('#intent-cancel-btn').click();
        await expect(page.getByRole('alertdialog', { name: /SOS Intent Verification/i })).toBeHidden();
    });

    test('intent window auto-dispatch reaches active overlay', async ({ page }) => {
        await page.goto('/sos');
        await page.locator('#manual-sos-btn').click();
        await expect(page.getByRole('alertdialog', { name: /SOS Intent Verification/i })).toBeVisible();
        await page.waitForTimeout(6200);
        await expect(page.getByRole('alertdialog', { name: /SOS Active/i })).toBeVisible();
        await expect(page.locator('#sos-dismiss-btn')).toBeVisible();
    });
});
