import { expect, test } from '@playwright/test';

test('sleep, offline travel, result and recalculation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Добавить активность/ }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByRole('combobox', { name: 'Категория' })).toHaveValue('sleep');
  await form.getByRole('button', { name: 'Добавить', exact: true }).click();

  await page.getByRole('button', { name: /Добавить активность/ }).click();
  await form.getByRole('combobox', { name: 'Категория' }).selectOption('work');
  await form.getByRole('textbox', { name: 'Название' }).fill('Офис');
  await form.getByLabel('Начало').fill('09:00');
  await form.getByLabel('Конец').fill('10:00');
  await form.getByLabel('Офлайн').check();
  await form.getByLabel('Дорога туда, мин').fill('30');
  await form.getByLabel('Дорога обратно, мин').fill('30');
  await form.getByRole('button', { name: 'Добавить', exact: true }).click();

  await page.getByRole('button', { name: 'Рассчитать неделю' }).click();
  const result = page.locator('#results');
  await expect(result).toContainText('158 ч');
  await expect(result).toContainText('10 ч');
  await expect(result).toContainText('Дорога');
  await expect(page.locator('.timeline')).toContainText('Дорога');

  await page.locator('.activity-item').filter({ hasText: 'Офис' }).getByRole('button', { name: 'Изменить' }).click();
  await form.getByLabel('Конец').fill('11:00');
  await form.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(result).toContainText('Показан предыдущий расчёт');
  await page.getByRole('button', { name: 'Рассчитать неделю' }).click();
  await expect(result).toContainText('157 ч');
  await expect(result).not.toContainText('Показан предыдущий расчёт');
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
});

test('conflicts leave both activities editable', async ({ page }) => {
  await page.goto('/');
  for (const title of ['Первая', 'Вторая']) {
    await page.getByRole('button', { name: /Добавить активность/ }).click();
    const form = page.getByRole('dialog');
    await form.getByRole('combobox', { name: 'Категория' }).selectOption('work');
    await form.getByRole('textbox', { name: 'Название' }).fill(title);
    await form.getByRole('button', { name: 'Добавить', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Рассчитать неделю' }).click();
  await expect(page.getByRole('alert')).toContainText('пересекаются');
  await expect(page.locator('.activity-item')).toHaveCount(2);
  await expect(page.locator('.activity-item').filter({ hasText: 'Вторая' }).getByRole('button', { name: 'Изменить' })).toBeVisible();
});

test('mobile layout keeps the page within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Оставь место для жизни' })).toBeVisible();
  const hasPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasPageOverflow).toBe(false);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
