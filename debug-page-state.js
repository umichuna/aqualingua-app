const { chromium } = require('playwright');

(async () => {
  console.log('🔍 ページ状態デバッグ開始\n');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('📱 ページにアクセス...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // スタート
    const startBtn = await page.locator('button').filter({ hasText: 'タップしてはじめる' }).first();
    console.log('\n[1] スタート画面');
    console.log('   スタートボタン:', await startBtn.isVisible() ? '✅ 見える' : '❌ 見えない');
    if (await startBtn.isVisible()) {
      await startBtn.click();
      await page.waitForTimeout(2500);
    }

    // 水槽
    console.log('\n[2] 水槽画面');
    const fishSVGs = await page.locator('svg').all();
    console.log('   魚の数:', fishSVGs.length);

    if (fishSVGs.length > 0) {
      console.log('📍 最初の魚をクリック...');
      await fishSVGs[0].click();
      await page.waitForTimeout(1500);

      console.log('\n[3] 魚詳細パネル後');
      const pageHTML = await page.evaluate(() => {
        const allText = document.body.innerText;
        const allButtons = Array.from(document.querySelectorAll('button'));
        return {
          buttonsCount: allButtons.length,
          buttonTexts: allButtons.map(b => b.textContent.trim()).filter(t => t),
          hasBoxButton: allButtons.some(b => b.textContent.includes('ボックス'))
        };
      });
      console.log('   ボタン数:', pageHTML.buttonsCount);
      console.log('   ボタンテキスト:', pageHTML.buttonTexts);
      console.log('   「ボックスへ」:', pageHTML.hasBoxButton ? '✅' : '❌');
    }

    // スクリーンショット1
    await page.screenshot({ path: 'C:\\Users\\kaich\\debug1-aquarium.png' });
    console.log('\n   スクリーンショット: debug1-aquarium.png');

    // しごと画面
    console.log('\n[4] しごと画面へ');
    const studyTab = await page.locator('button').filter({ hasText: '💼' }).first();
    if (await studyTab.isVisible()) {
      await studyTab.click();
      await page.waitForTimeout(1500);
      console.log('   ✅ しごトタブをクリック');
    }

    await page.screenshot({ path: 'C:\\Users\\kaich\\debug2-study.png' });
    console.log('   スクリーンショット: debug2-study.png');

    // 単語帳
    console.log('\n[5] 単語帳を選択');
    const notebookBtn = await page.locator('text=単語帳').first();
    if (await notebookBtn.isVisible()) {
      await notebookBtn.click();
      await page.waitForTimeout(1500);
      console.log('   ✅ 単語帳をクリック');
    } else {
      console.log('   ❌ 単語帳ボタンが見つからない');
    }

    await page.screenshot({ path: 'C:\\Users\\kaich\\debug3-notebook.png' });
    console.log('   スクリーンショット: debug3-notebook.png');

    // + 単語を追加
    console.log('\n[6] 「+ 単語を追加」をクリック');
    const addBtn = await page.locator('button').filter({ hasText: '＋' }).first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(1500);
      console.log('   ✅ クリック');
    } else {
      console.log('   ❌ ボタンが見つからない');
    }

    await page.screenshot({ path: 'C:\\Users\\kaich\\debug4-word-form.png' });
    console.log('   スクリーンショット: debug4-word-form.png');

    // フォーム状態
    console.log('\n[7] フォーム要素の確認');
    const formState = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const inputs = Array.from(document.querySelectorAll('input'));
      const buttons = Array.from(document.querySelectorAll('button'));
      return {
        selectCount: selects.length,
        selectValues: selects.map(s => s.value),
        inputCount: inputs.length,
        inputPlaceholders: inputs.map(i => i.placeholder).filter(p => p),
        buttonCount: buttons.length,
        buttonTexts: buttons.map(b => b.textContent.trim()).filter(t => t)
      };
    });

    console.log('   <select>:', formState.selectCount, '個');
    if (formState.selectCount > 0) {
      console.log('   <select>値:', formState.selectValues);
    }
    console.log('   <input>:', formState.inputCount, '個');
    console.log('   <input>プレースホルダー:', formState.inputPlaceholders);
    console.log('   <button>:', formState.buttonCount, '個');
    console.log('   ボタンテキスト:', formState.buttonTexts);

    console.log('\n✅ デバッグ完了\n');

  } catch (e) {
    console.error('\n❌ エラー:', e.message);
  } finally {
    await browser.close();
  }
})();
