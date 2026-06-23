const { chromium } = require('playwright');

(async () => {
  console.log('🔍 詳細デバッグ検証を開始します\n');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = [];

  try {
    console.log('📱 ページにアクセス中...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);

    // スタート画面
    console.log('📍 現在のページ: スタート画面');
    const startBtn = await page.locator('button:has-text("タップしてはじめる")').first();
    if (await startBtn.isVisible()) {
      console.log('✅ スタートボタンが見える');
      await startBtn.click();
      await page.waitForTimeout(2000);
      console.log('✅ スタートボタンをクリック');
    }

    // しごとタブ
    console.log('\n📍 「しごと」タブをクリック...');
    const studyTab = await page.locator('button:has-text("💼")').first();
    if (await studyTab.isVisible()) {
      await studyTab.click();
      await page.waitForTimeout(1500);
      console.log('✅ しごとタブをクリック');
    }

    // 自己採点
    console.log('\n📍 「自己採点」を選択...');
    const selfChoiceBtn = await page.locator('text="自己採点"').first();
    if (await selfChoiceBtn.isVisible()) {
      await selfChoiceBtn.click();
      await page.waitForTimeout(2000);
      console.log('✅ 自己採点をクリック');
    }

    // ========== テスト1: 言語方向 ==========
    console.log('\n\n✅ テスト1: 言語方向の初期値');
    const ja2enBtn = await page.locator('text="日本語 → English"').first();
    if (await ja2enBtn.isVisible()) {
      const className = await ja2enBtn.getAttribute('class');
      const isSelected = className.includes('bg-sand');
      console.log(`  状態: ${isSelected ? '✅ 選択済み' : '❌ 未選択'}`);
      console.log(`  クラス: ${className}`);
      results.push({ name: '言語方向（日本語→英語）', status: isSelected });
    } else {
      console.log('❌ ボタンが見つかりません');
      results.push({ name: '言語方向（日本語→英語）', status: false });
    }

    // ========== テスト2: 苦手優先 ==========
    console.log('\n✅ テスト2: 苦手優先のデフォルト値');
    const weakToggle = await page.evaluate(() => {
      const divs = Array.from(document.querySelectorAll('div'));
      const weakDiv = divs.find(d => d.textContent.includes('苦手'));
      const btn = weakDiv?.querySelector('button');
      return {
        found: !!btn,
        className: btn?.className || 'N/A',
        isOn: btn?.className.includes('bg-glow') || false
      };
    });
    console.log(`  見つかった: ${weakToggle.found ? '✅' : '❌'}`);
    console.log(`  クラス: ${weakToggle.className}`);
    console.log(`  状態: ${!weakToggle.isOn ? '✅ OFF' : '❌ ON'}`);
    results.push({ name: '苦手優先（OFF）', status: !weakToggle.isOn });

    // ========== テスト3: 出題数入力欄 ==========
    console.log('\n✅ テスト3: 出題数入力欄');
    const inputs = await page.locator('input[type="number"]').all();
    console.log(`  見つかった入力欄: ${inputs.length}個`);

    if (inputs.length > 0) {
      const input = inputs[0];
      const initialValue = await input.inputValue();
      console.log(`  初期値: ${initialValue}`);

      // 空にしてみる
      await input.fill('');
      await page.waitForTimeout(500);
      const emptyValue = await input.inputValue();
      console.log(`  空にした後: "${emptyValue}"`);
      console.log(`  空にできる: ${emptyValue === '' ? '✅' : '❌'}`);
      results.push({ name: '出題数入力欄を空にできる', status: emptyValue === '' });

      // ========== テスト4: 空で開始時の警告 ==========
      console.log('\n✅ テスト4: 空のまま「はじめる」をクリック');
      const startQuizBtn = await page.locator('button:has-text("はじめる")').first();
      if (await startQuizBtn.isVisible()) {
        await startQuizBtn.click();
        await page.waitForTimeout(1500);

        const notice = await page.evaluate(() => {
          const divs = Array.from(document.querySelectorAll('div'));
          return divs.find(d => d.textContent.includes('数字を入力'))?.textContent || null;
        });
        console.log(`  警告表示: ${notice ? '✅ ' + notice : '❌ なし'}`);
        results.push({ name: '空時の警告表示', status: !!notice });
      }
    } else {
      console.log('❌ 入力欄が見つかりません');
      results.push({ name: '出題数入力欄を空にできる', status: false });
      results.push({ name: '空時の警告表示', status: false });
    }

    // ========== 結果サマリー ==========
    console.log('\n\n========== 📊 検証結果サマリー ==========');
    let passCount = 0;
    results.forEach(r => {
      console.log(`${r.status ? '✅' : '❌'} ${r.name}`);
      if (r.status) passCount++;
    });
    console.log(`\n合計: ${passCount}/${results.length} 成功`);

    if (passCount === results.length) {
      console.log('\n🎉 すべてのテストに合格しました！');
    } else {
      console.log('\n⚠️ 一部のテストが失敗しました');
    }

    // スクリーンショット
    console.log('\n📸 スクリーンショット保存中...');
    await page.screenshot({ path: 'C:\\Users\\kaich\\verify-debug.png', fullPage: true });
    console.log('   → C:\\Users\\kaich\\verify-debug.png');

  } catch (e) {
    console.error('\n❌ エラー:', e.message);
    console.error(e.stack);
  } finally {
    await browser.close();
  }
})();
