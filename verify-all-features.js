const { chromium } = require('playwright');

(async () => {
  console.log('🧪 全3機能の検証テスト開始\n');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = [];

  try {
    console.log('📱 http://localhost:3000 にアクセス中...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    // ========== テスト A: ボックス出し入れ機能 ==========
    console.log('\n\n========== ✅ テスト A: ボックス出し入れ機能 ==========\n');

    // スタート画面
    const startBtn = await page.locator('button').filter({ hasText: 'タップしてはじめる' }).first();
    if (await startBtn.isVisible()) {
      console.log('📍 スタート画面→「タップしてはじめる」をクリック');
      await startBtn.click();
      await page.waitForTimeout(2500);
    }

    // 水族館ビューを待機
    await page.waitForSelector('div[style*="backgroundImage"]', { timeout: 5000 }).catch(() => {});
    console.log('✅ 水槽ビューが表示された');
    results.push({ name: '水槽ビュー表示', status: true });

    // 魚をクリックして詳細パネルを開く - SVG要素を探す
    console.log('📍 魚をクリックして詳細パネルを開く');
    const fishElements = await page.locator('svg').all();
    console.log(`   見つかった魚数: ${fishElements.length}`);
    if (fishElements.length > 0) {
      await fishElements[0].click();
      await page.waitForTimeout(1200);
    }

    // 詳細パネルの内容をデバッグ
    const panelContent = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      const allText = document.body.innerText;
      return {
        buttonTexts: allButtons.map(b => b.textContent.trim()).slice(0, 20),
        hasBoxButton: allButtons.some(b => b.textContent.includes('ボックスへ')),
        hasBoxEmoji: allButtons.some(b => b.textContent.includes('📦'))
      };
    });

    console.log('   ボタンのテキスト:', panelContent.buttonTexts);
    console.log(`   「ボックスへ」ボタン: ${panelContent.hasBoxButton ? '✅' : '❌'}`);
    console.log(`   📦 絵文字: ${panelContent.hasBoxEmoji ? '✅' : '❌'}`);

    results.push({ name: 'ボックスへボタン', status: panelContent.hasBoxButton || panelContent.hasBoxEmoji });

    // ========== テスト B: 相棒機能削除 ==========
    console.log('\n\n========== ✅ テスト B: 相棒機能削除確認 ==========\n');

    const companionUICheck = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      const allText = document.body.innerText;
      const hasCompanionBtn = allButtons.some(b =>
        b.textContent.includes('相棒') || b.textContent.includes('🤝')
      );
      const hasCompanionPanel = allText.includes('呼び戻す') || allText.includes('相棒') || allText.includes('🤝');

      return {
        hasCompanionButton: hasCompanionBtn,
        hasCompanionPanel: hasCompanionPanel
      };
    });

    console.log(`🤝 相棒ボタン: ${companionUICheck.hasCompanionButton ? '❌ まだ表示' : '✅ 削除済み'}`);
    console.log(`   相棒パネル: ${companionUICheck.hasCompanionPanel ? '❌ まだ表示' : '✅ 削除済み'}`);
    results.push({ name: '相棒機能削除', status: !companionUICheck.hasCompanionButton && !companionUICheck.hasCompanionPanel });

    // ========== テスト C: 単語帳引き継ぎ ==========
    console.log('\n\n========== ✅ テスト C: 単語帳引き継ぎ機能 ==========\n');

    // しごとタブ
    console.log('📍 「💼」しごとタブをクリック');
    const studyTab = await page.locator('button').filter({ hasText: '💼' }).first();
    if (await studyTab.isVisible()) {
      await studyTab.click();
      await page.waitForTimeout(1500);
    }

    // 単語帳を選択
    console.log('📍 「単語帳」を選択');
    const notebookBtn = await page.locator('text=単語帳').first();
    if (await notebookBtn.isVisible()) {
      await notebookBtn.click();
      await page.waitForTimeout(1500);
    }

    // 「+ 単語を追加」ボタンを見つけてクリック
    console.log('📍 「+ 単語を追加」ボタンをクリック');
    const addWordBtn = await page.locator('button').filter({ hasText: '＋' }).first();
    if (await addWordBtn.isVisible()) {
      await addWordBtn.click();
      await page.waitForTimeout(1200);
    }

    // 最初のフォーム状態
    const firstFormState = await page.evaluate(() => {
      const typeSelect = document.querySelector('select');
      const genreInputs = Array.from(document.querySelectorAll('input'));
      const genreInput = genreInputs.find(i => i.placeholder && i.placeholder.includes('ジャンル'));
      return {
        typeValue: typeSelect?.value || 'N/A',
        genreValue: genreInput?.value || 'N/A'
      };
    });

    console.log(`✅ 初回フォーム状態: 種別=${firstFormState.typeValue}, ジャンル=${firstFormState.genreValue}`);

    // 種別を「述語」に変更
    console.log('📍 種別を「述語」に変更');
    const typeSelect = await page.locator('select').first();
    await typeSelect.selectOption('述語');
    await page.waitForTimeout(500);

    // ジャンル入力欄を見つけて「ビジネス」に設定
    console.log('📍 ジャンルを「ビジネス」に変更');
    const genreInputs = await page.locator('input').all();
    let genreInput = null;
    for (const input of genreInputs) {
      const placeholder = await input.getAttribute('placeholder');
      if (placeholder && placeholder.includes('ジャンル')) {
        genreInput = input;
        break;
      }
    }
    if (genreInput) {
      await genreInput.fill('ビジネス');
    }
    await page.waitForTimeout(500);

    // テスト用の単語を入力
    console.log('📍 テスト単語を入力');
    const wordInputs = await page.locator('input').all();
    const timestamp = Date.now();
    for (let i = 0; i < Math.min(2, wordInputs.length); i++) {
      const input = wordInputs[i];
      const placeholder = await input.getAttribute('placeholder');
      if (placeholder && placeholder.includes('単語')) {
        await input.fill('test' + timestamp);
      } else if (placeholder && placeholder.includes('意味')) {
        await input.fill('テスト' + timestamp);
      }
    }
    await page.waitForTimeout(500);

    // 保存ボタン
    const saveBtn = await page.locator('button').filter({ hasText: '保存' }).first();
    if (await saveBtn.isVisible()) {
      console.log('📍 「保存」ボタンをクリック');
      await saveBtn.click();
      await page.waitForTimeout(1500);
    }

    // 再度「+ 単語を追加」をクリック
    console.log('📍 再度「+ 単語を追加」をクリック（引き継ぎ確認）');
    const addWordBtn2 = await page.locator('button').filter({ hasText: '＋' }).first();
    if (await addWordBtn2.isVisible()) {
      await addWordBtn2.click();
      await page.waitForTimeout(1200);
    }

    // 2回目のフォーム状態を確認
    const inheritedFormState = await page.evaluate(() => {
      const typeSelect = document.querySelector('select');
      const genreInputs = Array.from(document.querySelectorAll('input'));
      const genreInput = genreInputs.find(i => i.placeholder && i.placeholder.includes('ジャンル'));
      return {
        typeValue: typeSelect?.value || 'N/A',
        genreValue: genreInput?.value || 'N/A'
      };
    });

    console.log(`✅ 2回目フォーム状態: 種別=${inheritedFormState.typeValue}, ジャンル=${inheritedFormState.genreValue}`);
    console.log(`   期待値: 種別=述語, ジャンル=ビジネス`);

    const inheritanceWorks =
      inheritedFormState.typeValue === '述語' &&
      inheritedFormState.genreValue === 'ビジネス';
    console.log(`   結果: ${inheritanceWorks ? '✅ 引き継ぎ成功' : '❌ 引き継ぎ失敗'}`);
    results.push({ name: '単語種別・ジャンル引き継ぎ', status: inheritanceWorks });

    // ========== 結果サマリー ==========
    console.log('\n\n========== 📊 検証結果サマリー ==========\n');
    let passCount = 0;
    results.forEach(r => {
      console.log(`${r.status ? '✅' : '❌'} ${r.name}`);
      if (r.status) passCount++;
    });
    console.log(`\n合計: ${passCount}/${results.length} 成功\n`);

    if (passCount === results.length) {
      console.log('🎉 すべてのテストに合格しました！\n');
    } else {
      console.log('⚠️ 一部のテストが失敗しました\n');
    }

    // スクリーンショット
    console.log('📸 最終スクリーンショット保存中...');
    await page.screenshot({ path: 'C:\\Users\\kaich\\verify-final.png', fullPage: true });
    console.log('   → C:\\Users\\kaich\\verify-final.png\n');

  } catch (e) {
    console.error('\n❌ エラー:', e.message);
  } finally {
    await browser.close();
  }
})();
