import { test, expect } from '@playwright/test';

test.describe('Dispatch failure fallback', () => {
    test('overlay still appears when backend dispatch fails', async ({ page }) => {
        await page.route('**/functions/v1/sos-dispatch', async (route) => {
            await route.fulfill({ status: 500, body: '{"error":"forced failure"}' });
        });

        await page.goto('/sos');
        await page.locator('#manual-sos-btn').click();
        await page.waitForTimeout(6200);

        await expect(page.getByRole('alertdialog', { name: /SOS Active/i })).toBeVisible();
        await expect(page.locator('#sos-dismiss-btn')).toBeVisible();
    });
});
