const { chromium } = require('playwright');

(async () => {
  console.log('🧪 修正内容の検証を開始します\n');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('📱 http://localhost:3000 にアクセス中...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // ========== テスト1: 初期状態 ==========
    console.log('\n✅ テスト1: 初期状態の確認');

    // しごとボタン
    const studyBtn = await page.$('button:has-text("💼")');
    if (studyBtn) {
      await studyBtn.click();
      await page.waitForTimeout(1000);

      // 自己採点を選択
      const selfBtn = await page.$('text=/自己採点/');
      if (selfBtn) {
        await selfBtn.click();
        await page.waitForTimeout(800);

        // 言語方向確認
        const ja2enSelected = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(b => b.textContent.includes('日本語') && b.textContent.includes('English'));
          return btn ? btn.className.includes('bg-sand') : false;
        });
        console.log(`  言語方向「日本語→英語」が初期選択: ${ja2enSelected ? '✅' : '❌'}`);

        // 苦手優先確認
        const weakFirstOff = await page.evaluate(() => {
          const divs = Array.from(document.querySelectorAll('div'));
          const weakDiv = divs.find(d => d.textContent.includes('苦手'));
          const toggle = weakDiv?.querySelector('button');
          return toggle ? !toggle.className.includes('bg-glow') : false;
        });
        console.log(`  苦手優先がOFF: ${weakFirstOff ? '✅' : '❌'}`);
      }
    }

    // ========== テスト2: 出題数入力 ==========
    console.log('\n✅ テスト2: 出題数入力欄');
    const input = await page.$('input[type="number"]');
    if (input) {
      const initial = await input.inputValue();
      console.log(`  初期値: ${initial}`);

      // 空にする
      await input.fill('');
      const empty = await input.inputValue();
      console.log(`  空にできる: ${empty === '' ? '✅' : '❌'}`);

      // テスト3: 空のまま開始
      console.log('\n✅ テスト3: 空のまま開始ボタン');
      const startBtn = await page.$('button:has-text("はじめる")');
      if (startBtn) {
        await startBtn.click();
        await page.waitForTimeout(1500);

        const warning = await page.evaluate(() => {
          const divs = Array.from(document.querySelectorAll('div'));
          const notice = divs.find(d => d.textContent.includes('数字を入力'));
          return notice?.textContent || null;
        });
        console.log(`  警告表示: ${warning ? '✅ ' + warning : '❌ なし'}`);
      }
    } else {
      console.log('❌ 入力欄が見つかりません');
    }

    console.log('\n✅ すべてのテストが完了しました');
    console.log('📸 スクリーンショット保存中...');
    await page.screenshot({ path: 'C:\\Users\\kaich\\verify-result.png' });
    console.log('   → C:\\Users\\kaich\\verify-result.png');

  } catch (e) {
    console.error('\n❌ エラー:', e.message);
  } finally {
    await browser.close();
  }
})();
