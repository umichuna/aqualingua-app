const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));

  const navTab = (label) => page.evaluate((l) => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.innerText.trim().endsWith(l));
    if (b) b.click();
    return !!b;
  }, label);

  async function dismissModals() {
    for (let i = 0; i < 8; i++) {
      const overlay = page.locator('div.fixed.inset-0.z-50');
      if (await overlay.count() === 0) return;
      const labels = ['うけとる！', 'とじる', 'OK', 'やったね！'];
      let clicked = false;
      for (const l of labels) {
        const b = overlay.locator('button', { hasText: l });
        if (await b.count() > 0) { await b.first().click(); clicked = true; break; }
      }
      if (!clicked) {
        console.log('INFO 未知のモーダル:', (await overlay.first().innerText()).slice(0, 150).replace(/\n+/g, ' | '));
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(600);
    }
  }

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.locator('body').click();
  await page.waitForTimeout(1000);

  // オンボーディング
  for (let i = 0; i < 12; i++) {
    const done = page.locator('button', { hasText: 'はじめる！' });
    if (await done.count() > 0) { await done.first().click(); break; }
    const next = page.locator('button', { hasText: 'つぎへ' });
    if (await next.count() > 0) { await next.first().click(); await page.waitForTimeout(300); } else break;
  }
  await page.waitForTimeout(1000);
  await dismissModals();

  // 単語帳へ
  await navTab('ホーム');
  await page.waitForTimeout(400);
  await dismissModals();
  await page.locator('text=単語帳').first().click();
  await page.waitForTimeout(800);
  await dismissModals();
  await page.screenshot({ path: '/tmp/aqua-verify/30_filter_closed.png' });
  console.log('--- フィルタープルダウン検証開始 ---');

  // CHECK 1: ジャンル▼ をクリック → チェックボックス展開
  await page.locator('button', { hasText: 'ジャンル' }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/aqua-verify/31_genre_open.png' });
  const checkboxes = await page.locator('input[type="checkbox"]').count();
  console.log(`CHECK1 ジャンル展開チェックボックス数: ${checkboxes >= 1 ? 'PASS' : 'FAIL'} (${checkboxes}個)`);

  // CHECK 2: ビジネスにチェック → 絞り込み反映
  await page.locator('label', { hasText: 'ビジネス' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/aqua-verify/32_genre_checked.png' });
  const countText = await page.locator('text=/\\d+ \\/ \\d+語/').innerText().catch(() => '(カウント表示なし)');
  console.log(`CHECK2 ビジネス選択後の件数: ${countText}`);

  // CHECK 3: ▲で閉じる → ボタンに選択数バッジ
  await page.locator('button', { hasText: 'ジャンル' }).first().click();
  await page.waitForTimeout(300);
  const btnText = (await page.locator('button', { hasText: 'ジャンル' }).first().innerText()).replace(/\n/g, ' ');
  const hasBadge = btnText.includes('(1)');
  console.log(`CHECK3 閉じた後のボタン表示: ${hasBadge ? 'PASS' : 'FAIL'} → "${btnText}"`);

  // CHECK 4: レベル▼を開くとジャンルが自動で閉じる（1つだけ開く）
  await page.locator('button', { hasText: 'レベル' }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/aqua-verify/33_level_open.png' });
  const genreDropOpen = await page.locator('div.absolute label', { hasText: 'ビジネス' }).count();
  const levelDropOpen = await page.locator('div.absolute label').count();
  console.log(`CHECK4 1つだけ開く: ${genreDropOpen === 0 && levelDropOpen > 0 ? 'PASS' : 'FAIL'} (ジャンル展開=${genreDropOpen} レベル展開=${levelDropOpen})`);
  const levelLabels = await page.locator('div.absolute label').allInnerTexts();
  console.log('  レベルの選択肢:', levelLabels.join(' / '));

  // CHECK 5: リセット → バッジ消える
  await page.locator('button', { hasText: 'レベル' }).first().click(); // 先に閉じる
  await page.waitForTimeout(200);
  await page.locator('text=絞り込みをリセット').click();
  await page.waitForTimeout(300);
  const afterReset = (await page.locator('button', { hasText: 'ジャンル' }).first().innerText()).replace(/\n/g, ' ');
  console.log(`CHECK5 リセット後のジャンルボタン: ${!afterReset.includes('(') ? 'PASS' : 'FAIL'} → "${afterReset}"`);
  await page.screenshot({ path: '/tmp/aqua-verify/34_after_reset.png' });

  await browser.close();
  console.log('--- 検証完了 ---');
})();
