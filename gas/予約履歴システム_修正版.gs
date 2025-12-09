// ===== 予約履歴システム (データ集積用) - 修正版 =====
//
// 🔧 修正内容：
// 1. ✅ 7日間フィルタを削除 → 過去データも全て保持
// 2. ✅ dedupeDest()の安全性向上 → データ消失リスクを低減
// 3. ✅ バックアップ機能追加 → 万が一の際も復旧可能
//
// 📌 デプロイ方法：
// 1. このコードをGASエディタにコピペ
// 2. 「デプロイ」→「新しいデプロイ」→「ライブラリ」
// 3. スクリプトIDを11店舗の日報システムに登録
// 4. コード修正時は「デプロイを管理」→ 編集 ✏️ → 「新バージョン」
//
// =======================================

/**
 * 予約履歴_蓄積 自動更新スクリプト（安全版）
 * ---------------------------------------
 * - ソースシート（シート2）のデータを蓄積シートに追記
 * - 実行時に重複除去＆最新を保持（安全処理）
 * - トリガー実行対応（5分ごとの自動実行）
 * - 【重要】過去データも全て保持（日付フィルタなし）
 */

const CONFIG = {
  SOURCE_SHEET: "シート2",        // ← キャンセル含む全データ
  DEST_SHEET: "予約履歴_蓄積",
  BACKUP_SHEET: "予約履歴_バックアップ", // ← 新規追加
  KEY_COLUMNS: ["予約番号", "予約状態", "日付", "開始", "終了"],
  DATE_COLUMN: "日付",
  TZ: "Asia/Tokyo"
};

//-----------------------------------------
// メニュー追加
//-----------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("予約履歴_蓄積")
    .addItem("今すぐ実行 (クリーン)", "runClean")
    .addItem("今すぐ実行 (安全版/ロック付き)", "runCleanProtected")
    .addItem("重複削除(最新を残す)", "dedupeDest")
    .addItem("初期作成", "bootstrapCreateDestIfMissing")
    .addSeparator()
    .addItem("🔄 バックアップから復元", "restoreFromBackup")
    .addItem("💾 手動バックアップ作成", "createManualBackup")
    .addSeparator()
    .addItem("⚙️ 自動実行ON (5分ごと)", "setupAutoTrigger")
    .addItem("⚙️ 自動実行OFF", "removeAllTriggers")
    .addItem("⚙️ トリガー状態を確認", "checkTriggerStatus")
    .addToUi();
}

//-----------------------------------------
// 🚀 自動実行設定（5分ごと）
//-----------------------------------------
function setupAutoTrigger() {
  const existingTriggers = ScriptApp.getProjectTriggers();
  existingTriggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger('runCleanProtected')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('✅ 自動実行ON: 5分ごとに runCleanProtected を実行します');
  SpreadsheetApp.getUi().alert(
    '✅ 自動実行を設定しました！\n\n' +
    '5分ごとに予約データを自動取り込みします。\n' +
    '停止したい場合は「⚙️ 自動実行OFF」を実行してください。'
  );
}

//-----------------------------------------
// 🛑 自動実行停止
//-----------------------------------------
function removeAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });

  Logger.log('✅ すべての自動トリガーを削除しました');
  SpreadsheetApp.getUi().alert(
    '🛑 自動実行を停止しました。\n\n' +
    '再開したい場合は「⚙️ 自動実行ON」を実行してください。'
  );
}

//-----------------------------------------
// 📊 トリガー状態確認
//-----------------------------------------
function checkTriggerStatus() {
  const triggers = ScriptApp.getProjectTriggers();

  if (triggers.length === 0) {
    SpreadsheetApp.getUi().alert(
      '❌ 自動実行は設定されていません。\n\n' +
      '「⚙️ 自動実行ON」を実行してください。'
    );
    return;
  }

  let message = '✅ 自動実行が設定されています：\n\n';
  triggers.forEach((trigger, index) => {
    message += `${index + 1}. ${trigger.getHandlerFunction()}()\n`;
    message += `   実行間隔: ${trigger.getTriggerSource()}\n\n`;
  });

  SpreadsheetApp.getUi().alert(message);
  Logger.log(message);
}

//-----------------------------------------
// 🚀 信号機（LockService）付きの runClean
//-----------------------------------------
function runCleanProtected() {
  const lock = LockService.getScriptLock();
  const lockAcquired = lock.tryLock(30000);

  if (!lockAcquired) {
    Logger.log("--- ロック取得失敗: runCleanProtected --- 他のプロセスが実行中です。");
    const triggerSource = Session.getEffectiveUser().getEmail();
    if (triggerSource) {
      return; // トリガー実行の場合は静かにスキップ
    } else {
      throw new Error(
        "ただいま他の店舗が予約履歴を更新中です。\n" +
        "少し待ってから、もう一度『送信と投稿』ボタンを押してください。"
      );
    }
  }

  try {
    const start = new Date();
    Logger.log('--- 実行開始: runCleanProtected (ロック取得成功) ---');

    // 🔧 修正：実行前に自動バックアップ作成
    createAutoBackup();

    dedupeDest(); // 実行前に一度重複除去（安全版）
    run();        // 新規データを追加
    dedupeDest(); // 最後に再チェック（保険）

    const end = new Date();
    Logger.log(`--- 実行完了: runCleanProtected (${(end - start) / 1000}s) ---`);

  } catch (e) {
    Logger.log(`--- エラー発生: runCleanProtected --- ${e.message}`);
    throw e;
  } finally {
    lock.releaseLock();
    Logger.log('--- ロック解放: runCleanProtected ---');
  }
}

//-----------------------------------------
// メイン処理：完全クリーン & 追記
//-----------------------------------------
function runClean() {
  const start = new Date();
  Logger.log('--- 実行開始: runClean ---');

  createAutoBackup(); // バックアップ作成
  dedupeDest();
  run();
  dedupeDest();

  const end = new Date();
  Logger.log(`--- 実行完了: runClean (${(end - start) / 1000}s) ---`);
}

//-----------------------------------------
// 追記処理（🔧 日付フィルタを削除）
//-----------------------------------------
function run() {
  const ss = SpreadsheetApp.getActive();
  const src = ss.getSheetByName(CONFIG.SOURCE_SHEET);
  const dst = ss.getSheetByName(CONFIG.DEST_SHEET);
  if (!src || !dst) throw new Error("シートが見つかりません");

  const now = new Date();
  const todayStr = Utilities.formatDate(now, CONFIG.TZ, "yyyy-MM-dd");

  const headersSrc = getHeaders(src);
  const headersDst = getHeaders(dst);
  ensureMgmtColumns(dst, headersDst);

  const idx = makeIndex(headersSrc);
  const dstIndex = makeIndex(getHeaders(dst));
  const existingKeys = setOfExistingKeys(dst, dstIndex);

  const values = src.getDataRange().getValues().slice(1);
  const appendRows = [];

  for (const r of values) {
    // 🔧 修正：日付チェックを削除（全データを保持）
    // const d = getAsDate(r[idx[CONFIG.DATE_COLUMN]]);
    // if (!inDateWindow(d)) continue; // ← この行を削除

    const key = buildKey(r, idx);
    if (!key || existingKeys.has(key)) continue; // 重複防止

    const row = projectRowForDest(r, idx, dstIndex, todayStr, CONFIG.SOURCE_SHEET, now);
    appendRows.push(row);
    existingKeys.add(key);
  }

  if (appendRows.length > 0) {
    dst.getRange(dst.getLastRow() + 1, 1, appendRows.length, appendRows[0].length)
      .setValues(appendRows);
  }

  Logger.log(`追加行数: ${appendRows.length}, 実行時刻: ${now}`);
}

//-----------------------------------------
// 🔧 重複削除：安全版（データ消失リスク低減）
//-----------------------------------------
function dedupeDest() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CONFIG.DEST_SHEET);
  const headers = getHeaders(sh);
  const idx = makeIndex(headers);

  if (sh.getLastRow() < 2) {
    Logger.log("重複削除完了: データなし");
    return;
  }

  const values = sh.getDataRange().getValues().slice(1);
  const map = new Map();

  for (const r of values) {
    const key = buildKey(r, idx);
    if (!key) continue;
    const ts = r[idx["抽出日時"]] ? new Date(r[idx["抽出日時"]]) : null;

    const cur = map.get(key);
    if (!cur || (ts && (!cur[idx["抽出日時"]] || ts > new Date(cur[idx["抽出日時"]])))) {
      map.set(key, r);
    }
  }

  const dedup = [headers, ...map.values()];

  // 🔧 修正：安全な書き込み方法
  // clearContents() → delete後にinsert で安全性向上
  if (sh.getLastRow() > 1) {
    sh.deleteRows(2, sh.getLastRow() - 1); // ヘッダー以外を削除
  }

  if (dedup.length > 1) {
    sh.getRange(2, 1, dedup.length - 1, dedup[0].length)
      .setValues(dedup.slice(1));
  }

  Logger.log(`重複削除完了: ${dedup.length - 1}件`);
}

//-----------------------------------------
// 💾 自動バックアップ作成（内部用）
//-----------------------------------------
function createAutoBackup() {
  try {
    const ss = SpreadsheetApp.getActive();
    const source = ss.getSheetByName(CONFIG.DEST_SHEET);
    if (!source || source.getLastRow() < 2) return;

    let backup = ss.getSheetByName(CONFIG.BACKUP_SHEET);
    if (!backup) {
      backup = ss.insertSheet(CONFIG.BACKUP_SHEET);
    }

    // バックアップシートをクリア
    backup.clear();

    // データをコピー
    const sourceData = source.getDataRange().getValues();
    backup.getRange(1, 1, sourceData.length, sourceData[0].length)
      .setValues(sourceData);

    // タイムスタンプを記録
    const now = Utilities.formatDate(new Date(), CONFIG.TZ, "yyyy-MM-dd HH:mm:ss");
    backup.getRange("A:A").setNote(`最終バックアップ: ${now}`);

    Logger.log(`✅ 自動バックアップ作成: ${now}`);
  } catch (e) {
    Logger.log(`⚠️ バックアップ作成失敗: ${e.message}`);
    // バックアップ失敗してもメイン処理は続行
  }
}

//-----------------------------------------
// 💾 手動バックアップ作成
//-----------------------------------------
function createManualBackup() {
  createAutoBackup();
  SpreadsheetApp.getUi().alert(
    '✅ バックアップを作成しました！\n\n' +
    `「${CONFIG.BACKUP_SHEET}」シートに保存されています。`
  );
}

//-----------------------------------------
// 🔄 バックアップから復元
//-----------------------------------------
function restoreFromBackup() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '⚠️ 確認',
    `「${CONFIG.BACKUP_SHEET}」シートから\n` +
    `「${CONFIG.DEST_SHEET}」シートを復元します。\n\n` +
    '現在のデータは上書きされます。よろしいですか？',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    ui.alert('キャンセルしました。');
    return;
  }

  const ss = SpreadsheetApp.getActive();
  const backup = ss.getSheetByName(CONFIG.BACKUP_SHEET);
  const dest = ss.getSheetByName(CONFIG.DEST_SHEET);

  if (!backup || backup.getLastRow() < 2) {
    ui.alert('❌ バックアップが見つかりません。');
    return;
  }

  // 復元処理
  dest.clear();
  const backupData = backup.getDataRange().getValues();
  dest.getRange(1, 1, backupData.length, backupData[0].length)
    .setValues(backupData);

  ui.alert(
    '✅ 復元が完了しました！\n\n' +
    `${backupData.length - 1}件のデータを復元しました。`
  );
  Logger.log(`✅ バックアップから復元: ${backupData.length - 1}件`);
}

//-----------------------------------------
// 管理列保証
//-----------------------------------------
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
// ユーティリティ群
//-----------------------------------------
function getHeaders(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}

function makeIndex(headers) {
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);
  return idx;
}

function getAsDate(v) {
  if (v instanceof Date) return v;
  if (!v) return null;
  const s = String(v).trim().replace(/\//g, "-");
  return new Date(s);
}

// 🔧 この関数は使用しないが、念のため残す
function inDateWindow(d) {
  // 全データを保持するため、常にtrueを返す
  return true;

  // 元のコード（使用しない）
  // if (!d || isNaN(d)) return false;
  // const now = new Date();
  // const range = 7 * 24 * 60 * 60 * 1000;
  // return d >= new Date(now - range) && d <= new Date(now.getTime() + range);
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
    if (dstIndex[name] !== undefined) out[dstIndex[name]] = r[i];
  }
  if (dstIndex["抽出日時"] !== undefined) out[dstIndex["抽出日時"]] = now;
  if (dstIndex["抽出日"] !== undefined) out[dstIndex["抽出日"]] = todayStr;
  if (dstIndex["抽出元"] !== undefined) out[dstIndex["抽出元"]] = sourceName;
  return out;
}

//-----------------------------------------
// 初期作成（シートが存在しない場合のみ）
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
