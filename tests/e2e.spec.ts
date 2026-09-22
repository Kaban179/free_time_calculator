import { expect, test } from '@playwright/test';

test('defaults, mirrored travel, day cards and recalculation', async ({ page }) => {
  await page.goto('/');
  const form = page.locator('#activity-form');
  await expect(form.getByRole('button', { name: 'Сон', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(form.getByLabel('Начало')).toHaveValue('23:00');
  await expect(form.getByLabel('Конец')).toHaveValue('07:00');
  await expect(form.locator('.day-picker button.picked')).toHaveCount(7);
  await form.getByLabel('Начало').fill('22:00');
  await form.getByRole('button', { name: 'Работа', exact: true }).click();
  await expect(form.getByLabel('Начало')).toHaveValue('22:00');
  await expect(form.getByLabel('Конец')).toHaveValue('07:00');
  await form.getByRole('button', { name: 'Сон', exact: true }).click();
  await form.getByLabel('Начало').fill('23:00');
  await form.getByRole('button', { name: 'Этот день' }).click();
  await form.getByRole('button', { name: 'Добавить', exact: true }).click();

  await form.getByRole('button', { name: 'Работа', exact: true }).click();
  await expect(form.locator('.day-picker button.picked')).toHaveCount(5);
  await form.getByRole('button', { name: 'Этот день' }).click();
  await expect(form.getByLabel('Начало')).toHaveValue('09:00');
  await expect(form.getByLabel('Конец')).toHaveValue('18:00');
  await expect(form.getByLabel('Дорога туда, мин')).toHaveValue('30');
  await expect(form.getByLabel('Дорога обратно, мин')).toHaveValue('30');
  await form.getByLabel('Дорога туда, мин').fill('45');
  await expect(form.getByLabel('Дорога обратно, мин')).toHaveValue('45');
  await form.getByLabel('Дорога обратно, мин').fill('20');
  await form.getByLabel('Дорога туда, мин').fill('35');
  await expect(form.getByLabel('Дорога обратно, мин')).toHaveValue('20');
  await form.getByLabel('Конец').fill('10:00');
  await form.getByRole('button', { name: 'Добавить', exact: true }).click();

  await expect(page.locator('.day-card').first()).toContainText('Работа');
  await expect(page.locator('.day-card').first()).toContainText('Сон');
  await expect(page.locator('.time-block.category-travel')).toHaveCount(2);
  await page.locator('.day-card').nth(6).click();
  await expect(page.locator('#day-details .time-block.category-sleep')).toBeVisible();
  await page.locator('.day-card').first().click();

  await page.reload();
  await expect(page.locator('.day-card').first()).toContainText('Работа');
  await page.getByRole('button', { name: 'Рассчитать неделю' }).click();
  await expect(page.locator('#results')).toContainText('158 ч 5 мин');
  await page.locator('.day-entry').filter({ hasText: 'Работа' }).getByRole('button', { name: 'Изменить' }).click();
  await form.getByLabel('Конец').fill('11:00');
  await form.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.locator('#results')).toContainText('План изменён');
  await page.getByRole('button', { name: 'Рассчитать неделю' }).click();
  await expect(page.locator('#results')).toContainText('157 ч 5 мин');
});

test('editing sleep changes one day and replacing sleep creates no duplicate', async ({ page }) => {
  await page.goto('/');
  const form = page.locator('#activity-form');
  await form.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.locator('.day-card').nth(1).click();
  await page.locator('.day-entry').filter({ hasText: 'Сон' }).getByRole('button', { name: 'Изменить' }).click();
  await expect(form.locator('.edit-day-note')).toContainText('ночи на Вт');
  await form.getByLabel('Начало').fill('22:00');
  await form.getByRole('button', { name: 'Сохранить изменения' }).click();
  await page.getByRole('button', { name: 'Рассчитать неделю' }).click();
  await expect(page.locator('#results')).toContainText('111 ч');
  await expect(page.locator('.day-card').nth(0)).toContainText('9 ч');
  await expect(page.locator('.day-card').nth(1)).toContainText('8 ч');

  await form.getByRole('button', { name: 'Сон', exact: true }).click();
  await form.getByRole('button', { name: 'Этот день' }).click();
  await form.getByLabel('Начало').fill('00:00');
  await form.getByLabel('Конец').fill('08:00');
  await form.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.locator('.day-entry').filter({ hasText: 'Сон' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Рассчитать неделю' }).click();
  await expect(page.locator('#results')).toContainText('112 ч');
  await expect(page.locator('.day-card').nth(3)).toContainText('8 ч');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/sleep-edited.png', fullPage: true });
});

test('online overlap with travel is yellow and counted once', async ({ page }) => {
  await page.goto('/');
  const form = page.locator('#activity-form');
  await form.getByRole('button', { name: 'Работа', exact: true }).click();
  await form.getByRole('button', { name: 'Этот день' }).click();
  await form.getByRole('button', { name: 'Добавить', exact: true }).click();
  await form.getByRole('button', { name: 'Учёба', exact: true }).click();
  await form.getByRole('button', { name: 'Этот день' }).click();
  await form.getByLabel('Онлайн').check();
  await form.getByLabel('Начало').fill('08:45');
  await form.getByLabel('Конец').fill('09:15');
  await form.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByRole('button', { name: 'Рассчитать неделю' }).click();
  await expect(page.locator('#results')).toContainText('158 ч');
  await expect(page.locator('#results')).toContainText('Совмещено 30 мин');
  await expect(page.locator('.time-block.shared-online')).toHaveCount(3);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/online-overlap.png', fullPage: true });
});

test('conflicts keep both activities visible and editable', async ({ page }) => {
  await page.goto('/');
  const form = page.locator('#activity-form');
  for (const title of ['Первая', 'Вторая']) {
    await form.getByRole('button', { name: 'Работа', exact: true }).click();
    await form.getByRole('textbox', { name: 'Название' }).fill(title);
    await form.getByRole('button', { name: 'Добавить', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Рассчитать неделю' }).click();
  await expect(page.getByRole('alert')).toContainText('пересекаются');
  await expect(page.locator('.day-entry')).toHaveCount(2);
  await expect(page.locator('.time-block.category-work')).toHaveCount(2);
  const [first, second] = await Promise.all([
    page.locator('.time-block.category-work').nth(0).boundingBox(),
    page.locator('.time-block.category-work').nth(1).boundingBox(),
  ]);
  expect(first && second && first.x + first.width <= second.x + 1).toBe(true);
  await page.locator('.day-entry').filter({ hasText: 'Первая' }).getByRole('button', { name: 'Изменить' }).click();
  await expect(form.getByRole('textbox', { name: 'Название' })).toHaveValue('Первая');
});

test('mobile layout keeps the page within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Оставь место для жизни' })).toBeVisible();
  await page.locator('.mobile-day-tabs').getByRole('button', { name: 'Ср' }).click();
  await expect(page.locator('.day-card:visible')).toHaveCount(1);
  await expect(page.locator('#day-title')).toHaveText('Ср');
  const hasPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasPageOverflow).toBe(false);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
