import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = process.env.E2E_SCREENSHOTS; // optional folder for screenshots
const owner = { email: `owner-${Date.now()}@e2e.test`, password: 'E2e-Password-123' };

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

/** Ensure there is a business + owner to log in with (first-run signup or ALLOW_SIGNUP). */
async function ensureAccount(page: Page) {
  const status = await (await page.request.get('/api/auth/bootstrap-status')).json();
  if (process.env.E2E_EMAIL) {
    owner.email = process.env.E2E_EMAIL;
    owner.password = process.env.E2E_PASSWORD ?? owner.password;
    return;
  }
  if (!status.signupAllowed) throw new Error('No E2E_EMAIL given and signup is closed');
  const r = await page.request.post('/api/auth/signup', {
    data: { businessName: 'מעבדת בדיקות E2E', slug: `e2e-${Date.now()}`, fullName: 'טכנאי בדיקות', email: owner.email, password: owner.password },
  });
  expect(r.status()).toBe(201);
}

test('USB camera -> technician -> media server -> secure link -> phone viewer', async ({ browser }) => {
  // ---------- Technician (desktop browser with a fake USB camera) ----------
  const techCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'he-IL', permissions: ['camera', 'microphone'] });
  const tech = await techCtx.newPage();
  tech.on('console', (m) => m.type() === 'error' && console.log('[tech console]', m.text()));
  await tech.goto('/login');
  await ensureAccount(tech);
  await tech.goto('/login');
  await tech.getByLabel('דוא"ל').fill(owner.email);
  await tech.getByLabel('סיסמה').fill(owner.password);
  await tech.getByRole('button', { name: 'כניסה', exact: true }).click();

  // camera detected and previewing
  await expect(tech.getByTestId('camera-select')).toBeVisible();
  await expect(tech.getByText('מצלמה: מחוברת')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => tech.getByTestId('preview').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);

  // open a new job with consent
  await tech.getByTestId('new-job').click();
  await tech.getByPlaceholder('לדוגמה: iPhone 13 / מחשב נייד / רכב').fill('iPhone 15 Pro');
  await tech.getByLabel('תיאור התקלה').fill('החלפת סוללה – בדיקת E2E');
  await tech.getByText('הלקוח הסכים לצילום ולהקלטת העבודה').click();
  await tech.getByText('הלקוח הסכים לשידור חי ולקבלת קישור צפייה').click();
  await tech.getByRole('button', { name: 'פתח עבודה', exact: true }).click();
  await expect(tech.getByTestId('active-job')).toContainText('iPhone 15 Pro');

  // start live stream (WHIP through the API proxy into MediaMTX)
  await tech.getByTestId('start-stream').click();
  await expect(tech.getByTestId('stream-state')).toHaveText('משדר בשידור חי', { timeout: 30_000 });

  // create a personal viewing link with a PIN
  await tech.getByPlaceholder('לא חובה').fill('2468');
  await tech.getByTestId('create-link').click();
  const url = (await tech.getByTestId('share-url').textContent())!.trim();
  expect(url).toMatch(/\/v\/[A-Za-z0-9_-]{43}$/);
  await shot(tech, '01-technician-live');

  // ---------- Customer on a phone ----------
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'he-IL', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36' });
  const phone = await phoneCtx.newPage();
  await phone.goto(new URL(url).pathname);
  await expect(phone.getByText('הזינו את קוד האימות')).toBeVisible();
  await phone.locator('input').fill('2468');
  await phone.getByRole('button', { name: 'כניסה לצפייה' }).click();

  await expect(phone.getByTestId('viewer-conn')).toContainText('שידור חי', { timeout: 30_000 });
  await expect(phone.getByText('iPhone 15 Pro')).toBeVisible();
  // real frames are decoding and time advances
  await expect.poll(() => phone.getByTestId('viewer-video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  const t1 = await phone.getByTestId('viewer-video').evaluate((v: HTMLVideoElement) => v.currentTime);
  await phone.waitForTimeout(2000);
  const t2 = await phone.getByTestId('viewer-video').evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(t2).toBeGreaterThan(t1);
  const size = await phone.getByTestId('viewer-video').evaluate((v: HTMLVideoElement) => `${v.videoWidth}x${v.videoHeight}`);
  console.log(`viewer receives video ${size}, currentTime ${t1.toFixed(1)} -> ${t2.toFixed(1)}`);
  await shot(phone, '02-customer-phone-live');

  // technician sees the viewer
  await expect(tech.getByText(/צופים: 1/)).toBeVisible({ timeout: 15_000 });

  // ---------- Security: a different job's path cannot be watched with this link ----------
  // and a guessed/garbage token is rejected
  const bad = await phoneCtx.newPage();
  await bad.goto('/v/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  await expect(bad.getByTestId('viewer-fatal')).toBeVisible();

  // ---------- Local recording + background resumable upload to the job file ----------
  await tech.getByRole('button', { name: '🎥 התחל הקלטה' }).click();
  await tech.waitForTimeout(4000);
  await tech.getByRole('button', { name: '⏹️ עצור הקלטה' }).click();
  await expect(tech.getByTestId('active-job')).toContainText('1 סרטונים', { timeout: 30_000 });

  // ---------- Stop stream -> viewer sees "not active" ----------
  await tech.getByTestId('stop-stream').click();
  await expect(phone.getByTestId('viewer-conn')).toContainText(/השידור אינו פעיל|מתחבר/, { timeout: 30_000 });

  // ---------- Finish repair & close job -> link revoked ----------
  await tech.getByRole('button', { name: '✅ סיים תיקון' }).click();
  await tech.getByPlaceholder('מה בוצע, מה נבדק, המלצות ללקוח').fill('הוחלפה סוללה, נבדקה טעינה.');
  await tech.getByRole('combobox').last().selectOption({ label: 'נסגר (סוגר את העבודה ומבטל קישורים)' });
  await tech.getByRole('button', { name: 'שמור וסיים' }).click();
  await expect(tech.getByTestId('active-job')).toContainText('נסגר');
  await expect(phone.getByTestId('viewer-fatal')).toBeVisible({ timeout: 20_000 });
  await shot(phone, '03-customer-link-revoked');

  await techCtx.close();
  await phoneCtx.close();
});
