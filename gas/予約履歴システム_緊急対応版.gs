// ===== 予約履歴システム - 緊急対応版（データ保護最優先） =====
//
// 🚨 緊急対応版の特徴：
// 1. データ削除機能を完全に無効化
// 2. 追加のみ（Append Only）で絶対に既存データを消さない
// 3. 重複は許容（後で手動で整理）
// 4. バックアップを毎回必ず作成
//
// ⚠️ この版は一時的な緊急対応用です。
//    データ復旧が完了したら、修正版に切り替えてください。
//
// =======================================

const CONFIG = {
  SOURCE_SHEET: "シート2",
  DEST_SHEET: "予約履歴_蓄積",
  BACKUP_SHEET: "緊急バックアップ",
  KEY_COLUMNS: ["予約番号", "予約状態", "日付", "開始", "終了"],
  DATE_COLUMN: "日付",
  TZ: "Asia/Tokyo"
};

//-----------------------------------------
// メニュー追加
//-----------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🚨緊急対応")
    .addItem("📊 現在のデータ状況を確認", "データ診断")
    .addItem("💾 今すぐバックアップ作成", "緊急バックアップ作成")
    .addSeparator()
    .addItem("➕ 新規データのみ追加（安全版）", "安全に追加のみ実行")
    .addSeparator()
    .addItem("🛑 全トリガーを停止", "全トリガー停止")
    .addItem("⚙️ トリガー状態を確認", "トリガー状態確認")
    .addToUi();
}

//-----------------------------------------
// 🛑 全トリガーを停止
//-----------------------------------------
function 全トリガー停止() {
  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;

  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
    count++;
  });

  const ui = SpreadsheetApp.getUi();
  ui.alert(
    `🛑 全てのトリガーを停止しました\n\n` +
    `停止したトリガー数: ${count}個\n\n` +
    `これ以上の自動実行は行われません。`
  );

  Logger.log(`全トリガー停止: ${count}個のトリガーを削除`);
}

//-----------------------------------------
// ⚙️ トリガー状態を確認
//-----------------------------------------
function トリガー状態確認() {
  const triggers = ScriptApp.getProjectTriggers();

  if (triggers.length === 0) {
    SpreadsheetApp.getUi().alert(
      '✅ トリガーは設定されていません。\n\n' +
      '自動実行は停止しています。'
    );
    return;
  }

  let message = `⚠️ トリガーが${triggers.length}個動いています：\n\n`;
  triggers.forEach((trigger, index) => {
    message += `${index + 1}. ${trigger.getHandlerFunction()}()\n`;
    const source = trigger.getTriggerSource();
    if (source === ScriptApp.TriggerSource.CLOCK) {
      message += `   種類: 時間主導型\n`;
    } else {
      message += `   種類: ${source}\n`;
    }
  });

  message += '\n⚠️ データ保護のため、トリガーを停止することをお勧めします。';

  SpreadsheetApp.getUi().alert(message);
}

//-----------------------------------------
// 💾 緊急バックアップ作成
//-----------------------------------------
function 緊急バックアップ作成() {
  const ss = SpreadsheetApp.getActive();
  const source = ss.getSheetByName(CONFIG.DEST_SHEET);

  if (!source || source.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('❌ バックアップするデータがありません。');
    return;
  }

  const timestamp = Utilities.formatDate(new Date(), CONFIG.TZ, "yyyyMMdd_HHmmss");
  const backupName = `緊急バックアップ_${timestamp}`;

  // 新しいバックアップシートを作成
  const backup = ss.insertSheet(backupName);

  // データをコピー
  const sourceData = source.getDataRange().getValues();
  backup.getRange(1, 1, sourceData.length, sourceData[0].length)
    .setValues(sourceData);

  // シートを右端に移動
  ss.moveActiveSheet(ss.getNumSheets());

  const ui = SpreadsheetApp.getUi();
  ui.alert(
    `✅ バックアップを作成しました！\n\n` +
    `シート名: ${backupName}\n` +
    `データ件数: ${sourceData.length - 1}件\n` +
    `作成日時: ${timestamp}`
  );

  Logger.log(`緊急バックアップ作成: ${backupName}, ${sourceData.length - 1}件`);

  return backupName;
}

//-----------------------------------------
// 📊 データ診断
//-----------------------------------------
function データ診断() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CONFIG.DEST_SHEET);

  if (!sh || sh.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('❌ データがありません。');
    return;
  }

  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  const dateIdx = headers.indexOf("日付");
  if (dateIdx === -1) {
    SpreadsheetApp.getUi().alert('❌ 日付列が見つかりません。');
    return;
  }

  // 月別集計
  const monthCounts = {};
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
      const yearMonth = Utilities.formatDate(date, CONFIG.TZ, "yyyy-MM");
      monthCounts[yearMonth] = (monthCounts[yearMonth] || 0) + 1;
    }
  });

  const months = Object.keys(monthCounts).sort();
  let message = '📊 データ診断結果\n\n';
  message += `総データ件数: ${rows.length}件\n\n`;
  message += '【月別データ件数】\n';

  months.forEach(month => {
    message += `${month}: ${monthCounts[month]}件\n`;
  });

  // 警告チェック
  const warnings = [];
  if (!monthCounts["2024-11"]) {
    warnings.push('⚠️ 2024年11月のデータが0件です');
  }
  if (!monthCounts["2024-12"]) {
    warnings.push('⚠️ 2024年12月のデータが0件です');
  }

  if (warnings.length > 0) {
    message += '\n【警告】\n' + warnings.join('\n');
    message += '\n\n→ 変更履歴から復元してください。';
  }

  SpreadsheetApp.getUi().alert(message);
  Logger.log(message);
}

//-----------------------------------------
// ➕ 安全に追加のみ実行（削除なし）
//-----------------------------------------
function 安全に追加のみ実行() {
  const lock = LockService.getScriptLock();
  const lockAcquired = lock.tryLock(30000);

  if (!lockAcquired) {
    SpreadsheetApp.getUi().alert(
      '⚠️ 他のプロセスが実行中です。\n' +
      '少し待ってから再実行してください。'
    );
    return;
  }

  try {
    const start = new Date();
    Logger.log('--- 安全追加実行開始 ---');

    // 必ずバックアップ作成
    const backupName = 緊急バックアップ作成();

    // 追加のみ実行（削除は一切行わない）
    const addedCount = 追加のみ実行();

    const end = new Date();
    const elapsed = (end - start) / 1000;

    SpreadsheetApp.getUi().alert(
      `✅ 処理完了\n\n` +
      `追加件数: ${addedCount}件\n` +
      `処理時間: ${elapsed}秒\n` +
      `バックアップ: ${backupName}`
    );

    Logger.log(`--- 安全追加実行完了: ${addedCount}件追加, ${elapsed}秒 ---`);

  } catch (e) {
    Logger.log(`--- エラー発生: ${e.message} ---`);
    SpreadsheetApp.getUi().alert(
      `❌ エラーが発生しました\n\n${e.message}\n\n` +
      `バックアップから復元できます。`
    );
    throw e;
  } finally {
    lock.releaseLock();
  }
}

//-----------------------------------------
// 追加のみ実行（内部関数）
//-----------------------------------------
function 追加のみ実行() {
  const ss = SpreadsheetApp.getActive();
  const src = ss.getSheetByName(CONFIG.SOURCE_SHEET);
  const dst = ss.getSheetByName(CONFIG.DEST_SHEET);

  if (!src || !dst) {
    throw new Error("シートが見つかりません");
  }

  const now = new Date();
  const todayStr = Utilities.formatDate(now, CONFIG.TZ, "yyyy-MM-dd");

  const headersSrc = getHeaders(src);
  const headersDst = getHeaders(dst);
  ensureMgmtColumns(dst, headersDst);

  const idx = makeIndex(headersSrc);
  const dstIndex = makeIndex(getHeaders(dst));

  // 既存データのキーセットを取得
  const existingKeys = setOfExistingKeys(dst, dstIndex);

  const values = src.getDataRange().getValues().slice(1);
  const appendRows = [];

  for (const r of values) {
    // 🔧 日付フィルタは一切なし - 全てのデータを処理
    const key = buildKey(r, idx);
    if (!key) continue;

    // 既に存在するキーはスキップ（重複防止）
    if (existingKeys.has(key)) continue;

    const row = projectRowForDest(r, idx, dstIndex, todayStr, CONFIG.SOURCE_SHEET, now);
    appendRows.push(row);
    existingKeys.add(key);
  }

  // 🔧 追加のみ - 削除は一切行わない
  if (appendRows.length > 0) {
    const lastRow = dst.getLastRow();
    dst.getRange(lastRow + 1, 1, appendRows.length, appendRows[0].length)
      .setValues(appendRows);
  }

  Logger.log(`安全追加: ${appendRows.length}件追加`);
  return appendRows.length;
}

//-----------------------------------------
// ユーティリティ関数群
//-----------------------------------------
function getHeaders(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}

function makeIndex(headers) {
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);
  return idx;
}

function buildKey(r, idx) {
  try {
    const parts = CONFIG.KEY_COLUMNS.map(c => String(r[idx[c]] || "").trim());
    if (parts.some(x => !x)) return null;
    return parts.join("|");
  } catch {
    return null;
  }
}

function setOfExistingKeys(dst, dstIndex) {
  const lastRow = dst.getLastRow();
  if (lastRow < 2) return new Set();

  const vals = dst.getRange(2, 1, lastRow - 1, dst.getLastColumn()).getValues();
  const set = new Set();

  for (const r of vals) {
    const k = buildKey(r, dstIndex);
    if (k) set.add(k);
  }

  return set;
}

function projectRowForDest(r, idx, dstIndex, todayStr, sourceName, now) {
  const out = new Array(Object.keys(dstIndex).length).fill("");

  for (const [name, i] of Object.entries(idx)) {
    if (dstIndex[name] !== undefined) {
      out[dstIndex[name]] = r[i];
    }
  }

  if (dstIndex["抽出日時"] !== undefined) out[dstIndex["抽出日時"]] = now;
  if (dstIndex["抽出日"] !== undefined) out[dstIndex["抽出日"] ] = todayStr;
  if (dstIndex["抽出元"] !== undefined) out[dstIndex["抽出元"]] = sourceName;

  return out;
}

function ensureMgmtColumns(dst, headersDst) {
  const need = ["抽出日時", "抽出日", "抽出元"];
  let changed = false;

  for (const c of need) {
    if (!headersDst.includes(c)) {
      dst.insertColumnAfter(headersDst.length);
      dst.getRange(1, headersDst.length + 1).setValue(c);
      headersDst.push(c);
      changed = true;
    }
  }

  if (changed) SpreadsheetApp.flush();
}

//-----------------------------------------
// 初期作成
//-----------------------------------------
function bootstrapCreateDestIfMissing() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CONFIG.DEST_SHEET);
  if (!sh) sh = ss.insertSheet(CONFIG.DEST_SHEET);

  const baseHeaders = [
    "抽出時間","予約番号","日付","時間帯","開始","終了","所要時間","メインメニュー名",
    "FABRIC TOKYOで初めてサイズ登録をされる方ですか？","お名前（カタカナ）","連携会員ID","メールアドレス",
    "電話番号","サブメニュー名","管理メモ","その他、当日にご相談したい内容・ご要望がございましたらご記入ください。",
    "今回オーダーを検討している商品の用途をお選びください。","予約状態","備考欄","接客担当者",
    "採寸担当者","新規来店時対応","予約キャンセル","予約キャンセル日時","予約キャンセルコメント",
    "抽出日時","抽出日","抽出元"
  ];

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, baseHeaders.length).setValues([baseHeaders]);
  }

  Logger.log("予約履歴_蓄積シートを初期化しました");
}
