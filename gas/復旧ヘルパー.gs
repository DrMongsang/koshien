// ===== データ復旧ヘルパースクリプト =====
//
// 📌 使い方：
// 1. このコードを別のGASプロジェクトにコピペ（テスト用）
// 2. または既存のプロジェクトに一時的に追加
// 3. メニューから実行
//
// ⚠️ 注意：
// - このスクリプトは復旧作業専用です
// - 復旧完了後は削除してOKです
//
// =======================================

/**
 * メニュー追加
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🔧 データ復旧")
    .addItem("📊 データ診断", "診断")
    .addItem("🔍 11月データを検索", "search11月データ")
    .addItem("📋 変更履歴から復元候補を表示", "show変更履歴候補")
    .addSeparator()
    .addItem("💾 全シートをバックアップ", "全シートバックアップ")
    .addItem("🔄 特定日時のデータを復元", "復元ウィザード")
    .addToUi();
}

/**
 * データ診断：現在のデータ状況を分析
 */
function 診断() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("予約履歴_蓄積");

  if (!sh || sh.getLastRow() < 2) {
    Browser.msgBox("❌ 予約履歴_蓄積シートが見つからないか、データがありません。");
    return;
  }

  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  // 日付列のインデックスを取得
  const dateIdx = headers.indexOf("日付");
  if (dateIdx === -1) {
    Browser.msgBox("❌ 日付列が見つかりません。");
    return;
  }

  // 月別の集計
  const monthCounts = {};
  const today = new Date();

  rows.forEach(row => {
    const dateVal = row[dateIdx];
    if (!dateVal) return;

    let date;
    if (dateVal instanceof Date) {
      date = dateVal;
    } else {
      date = new Date(String(dateVal).replace(/\//g, "-"));
    }

    if (date && !isNaN(date)) {
      const yearMonth = Utilities.formatDate(date, "Asia/Tokyo", "yyyy-MM");
      monthCounts[yearMonth] = (monthCounts[yearMonth] || 0) + 1;
    }
  });

  // 結果を整形
  const months = Object.keys(monthCounts).sort();
  let message = "📊 データ診断結果\n\n";
  message += `総レコード数: ${rows.length}件\n\n`;
  message += "【月別データ件数】\n";

  months.forEach(month => {
    message += `${month}: ${monthCounts[month]}件\n`;
  });

  // 11月データのチェック
  const nov2024 = monthCounts["2024-11"] || 0;
  if (nov2024 === 0) {
    message += "\n⚠️ 警告: 2024年11月のデータが0件です！";
  }

  Browser.msgBox(message);
  Logger.log(message);
}

/**
 * 11月データを検索
 */
function search11月データ() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("予約履歴_蓄積");

  if (!sh || sh.getLastRow() < 2) {
    Browser.msgBox("❌ データがありません。");
    return;
  }

  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  const dateIdx = headers.indexOf("日付");

  const nov2024Data = rows.filter(row => {
    const dateVal = row[dateIdx];
    if (!dateVal) return false;

    let date;
    if (dateVal instanceof Date) {
      date = dateVal;
    } else {
      date = new Date(String(dateVal).replace(/\//g, "-"));
    }

    if (date && !isNaN(date)) {
      const yearMonth = Utilities.formatDate(date, "Asia/Tokyo", "yyyy-MM");
      return yearMonth === "2024-11";
    }
    return false;
  });

  if (nov2024Data.length === 0) {
    Browser.msgBox(
      "❌ 2024年11月のデータが見つかりません。\n\n" +
      "復旧が必要です。\n" +
      "「🔄 特定日時のデータを復元」を実行してください。"
    );
  } else {
    Browser.msgBox(
      `✅ 2024年11月のデータが ${nov2024Data.length} 件見つかりました。\n\n` +
      "データは正常です。"
    );
  }
}

/**
 * 変更履歴から復元候補を表示
 */
function show変更履歴候補() {
  const message =
    "📋 変更履歴から復元する手順\n\n" +
    "1. ファイル → 変更履歴 → 変更履歴を表示\n\n" +
    "2. 右側のパネルで以下を確認：\n" +
    "   - 日付とタイムスタンプ\n" +
    "   - 編集者名\n" +
    "   - 変更内容のプレビュー\n\n" +
    "3. 11月データがある版を探す：\n" +
    "   - 「予約履歴_蓄積」シートを開く\n" +
    "   - 行数が多い版を探す\n" +
    "   - 11月のデータが見える版を見つける\n\n" +
    "4. その版をクリックして確認\n\n" +
    "5. 問題なければ「この版を復元」をクリック\n\n" +
    "⚠️ 注意：\n" +
    "復元すると現在のデータが上書きされます。\n" +
    "事前に「💾 全シートをバックアップ」を実行してください。";

  Browser.msgBox(message);
}

/**
 * 全シートをバックアップ
 */
function 全シートバックアップ() {
  const ss = SpreadsheetApp.getActive();
  const timestamp = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss");
  const backupName = `バックアップ_${timestamp}`;

  // 新しいシートを作成
  const backup = ss.insertSheet(backupName);

  // 予約履歴_蓄積をコピー
  const source = ss.getSheetByName("予約履歴_蓄積");
  if (!source) {
    Browser.msgBox("❌ 予約履歴_蓄積シートが見つかりません。");
    ss.deleteSheet(backup);
    return;
  }

  const sourceData = source.getDataRange().getValues();
  if (sourceData.length > 0) {
    backup.getRange(1, 1, sourceData.length, sourceData[0].length)
      .setValues(sourceData);
  }

  Browser.msgBox(
    `✅ バックアップを作成しました！\n\n` +
    `シート名: ${backupName}\n` +
    `レコード数: ${sourceData.length - 1}件`
  );
}

/**
 * 復元ウィザード
 */
function 復元ウィザード() {
  const ui = SpreadsheetApp.getUi();

  const message =
    "🔄 データ復元ウィザード\n\n" +
    "このツールは以下の手順でデータを復元します：\n\n" +
    "【推奨される復元方法】\n\n" +
    "方法1: 変更履歴から復元（最も確実）\n" +
    "  → 「📋 変更履歴から復元候補を表示」を参照\n\n" +
    "方法2: バックアップシートから復元\n" +
    "  1. 「予約履歴_バックアップ」シートを確認\n" +
    "  2. 11月データが含まれているか確認\n" +
    "  3. 修正版コードの「🔄 バックアップから復元」を実行\n\n" +
    "方法3: 手動で統合\n" +
    "  1. 変更履歴から11月データをコピー\n" +
    "  2. 新しいシートに貼り付け\n" +
    "  3. 現在のデータと手動で統合\n\n" +
    "どの方法を使いますか？";

  ui.alert(message);
}

/**
 * データの整合性チェック
 */
function 整合性チェック() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("予約履歴_蓄積");

  if (!sh || sh.getLastRow() < 2) {
    Browser.msgBox("❌ データがありません。");
    return;
  }

  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  // 必須列のチェック
  const requiredColumns = ["予約番号", "日付", "予約状態"];
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));

  if (missingColumns.length > 0) {
    Browser.msgBox(`❌ 必須列が不足しています: ${missingColumns.join(", ")}`);
    return;
  }

  // データの検証
  let issues = [];
  const 予約番号Idx = headers.indexOf("予約番号");
  const 日付Idx = headers.indexOf("日付");
  const 予約状態Idx = headers.indexOf("予約状態");

  rows.forEach((row, i) => {
    const rowNum = i + 2; // ヘッダー分+1

    // 予約番号が空
    if (!row[予約番号Idx]) {
      issues.push(`行${rowNum}: 予約番号が空です`);
    }

    // 日付が不正
    if (!row[日付Idx]) {
      issues.push(`行${rowNum}: 日付が空です`);
    }

    // 予約状態が空
    if (!row[予約状態Idx]) {
      issues.push(`行${rowNum}: 予約状態が空です`);
    }
  });

  if (issues.length === 0) {
    Browser.msgBox(`✅ 整合性チェック完了\n\n問題は見つかりませんでした。\n総レコード数: ${rows.length}件`);
  } else {
    const message = `⚠️ 問題が見つかりました\n\n` +
      `総レコード数: ${rows.length}件\n` +
      `問題のある行: ${issues.length}件\n\n` +
      `最初の10件:\n${issues.slice(0, 10).join("\n")}`;
    Browser.msgBox(message);
    Logger.log(`全ての問題:\n${issues.join("\n")}`);
  }
}

/**
 * 重複データの分析
 */
function 重複分析() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("予約履歴_蓄積");

  if (!sh || sh.getLastRow() < 2) {
    Browser.msgBox("❌ データがありません。");
    return;
  }

  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  const KEY_COLUMNS = ["予約番号", "予約状態", "日付", "開始", "終了"];
  const indices = KEY_COLUMNS.map(col => headers.indexOf(col));

  if (indices.includes(-1)) {
    Browser.msgBox("❌ 必須列が見つかりません。");
    return;
  }

  const keyMap = new Map();
  rows.forEach((row, i) => {
    const key = indices.map(idx => String(row[idx] || "").trim()).join("|");
    if (!keyMap.has(key)) {
      keyMap.set(key, []);
    }
    keyMap.get(key).push(i + 2); // 行番号
  });

  const duplicates = Array.from(keyMap.entries())
    .filter(([key, rows]) => rows.length > 1);

  if (duplicates.length === 0) {
    Browser.msgBox(`✅ 重複なし\n\n総レコード数: ${rows.length}件`);
  } else {
    let message = `⚠️ 重複が見つかりました\n\n`;
    message += `重複グループ数: ${duplicates.length}\n`;
    message += `総重複行数: ${duplicates.reduce((sum, [k, rows]) => sum + rows.length, 0)}件\n\n`;
    message += `最初の5グループ:\n`;

    duplicates.slice(0, 5).forEach(([key, rows]) => {
      message += `\n行 ${rows.join(", ")}\n`;
    });

    Browser.msgBox(message);
  }
}
