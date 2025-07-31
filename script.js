// グローバル変数
let schoolsData = null;
let currentUser = null;
let predictions = JSON.parse(localStorage.getItem('predictions')) || [];
let gameState = JSON.parse(localStorage.getItem('gameState')) || {
    phase: 'prediction', // prediction, locked, final, revenge
    finalTeams: [],
    winner: null,
    lockTime: null
};
let selectedSchool = null;

// 重要日程
const IMPORTANT_DATES = {
    firstCardDraw: new Date('2025-08-01T10:00:00'),
    mainDraw: new Date('2025-08-03T16:00:00'),
    tournamentStart: new Date('2025-08-06T08:00:00')
};

// スコア表
const SCORE_TABLE = {
    '優勝': 100,
    '準優勝': 70,
    'ベスト4': 50,
    'ベスト8': 30,
    'ベスト16': 20,
    'その他': 10
};

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    await loadSchoolsData();
    initializeApp();
    setupEventListeners();
    updateCountdown();
    setInterval(updateCountdown, 1000);
});

// 学校データ読み込み
async function loadSchoolsData() {
    try {
        const response = await fetch('2025.json');
        schoolsData = await response.json();
    } catch (error) {
        console.error('学校データの読み込みに失敗しました:', error);
        alert('データの読み込みに失敗しました。ページを再読み込みしてください。');
    }
}

// アプリ初期化
function initializeApp() {
    // ユーザー確認
    currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        showUserModal();
        return;
    }

    // UI初期化
    initializeRegionGrid();
    initializeAllSchoolsList();
    initializeJapanMap();
    updateUI();
    
    // 管理者パネル表示（開発用）
    if (currentUser === 'admin') {
        document.getElementById('adminPanel').style.display = 'block';
    }
}

// イベントリスナー設定
function setupEventListeners() {
    // ルール説明の開閉
    const toggleRules = document.getElementById('toggleRules');
    const rulesContent = document.getElementById('rulesContent');
    const rulesHeader = document.querySelector('.rules-header');
    
    rulesHeader.addEventListener('click', () => {
        const isVisible = rulesContent.style.display !== 'none';
        rulesContent.style.display = isVisible ? 'none' : 'block';
        toggleRules.textContent = isVisible ? '▼ 詳細を見る' : '▲ 閉じる';
    });

    // タブ切り替え
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchInputMethod(btn.dataset.method));
    });

    // 検索
    document.getElementById('searchInput').addEventListener('input', handleSearch);

    // 予想送信
    document.getElementById('submitPrediction').addEventListener('click', submitPrediction);
    document.getElementById('resetSelection').addEventListener('click', resetSelection);

    // ユーザー登録
    document.getElementById('registerUser').addEventListener('click', registerUser);

    // 予想編集・削除ボタン
    document.getElementById('editPrediction').addEventListener('click', editCurrentPrediction);
    document.getElementById('deletePrediction').addEventListener('click', deleteCurrentPrediction);
    
    // ナビゲーションボタン
    document.getElementById('showPredictionsBtn').addEventListener('click', showPredictionsList);
    document.getElementById('showParticipantsBtn').addEventListener('click', showParticipants);
    document.getElementById('showAllPredictionsBtn').addEventListener('click', showAllPredictions);

    // 管理者機能
    document.getElementById('lockPredictions').addEventListener('click', lockPredictions);
    document.getElementById('setFinalTeams').addEventListener('click', setFinalTeams);
    document.getElementById('announceWinner').addEventListener('click', announceWinner);
    document.getElementById('resetAll').addEventListener('click', resetAll);

    // リベンジマッチ
    document.getElementById('submitRevenge').addEventListener('click', submitRevenge);
}

// カウントダウン更新
function updateCountdown() {
    const now = new Date();
    const target = gameState.phase === 'prediction' ? IMPORTANT_DATES.mainDraw : IMPORTANT_DATES.tournamentStart;
    const diff = target - now;

    if (diff <= 0) {
        document.getElementById('countdown').textContent = '大会開催中！';
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const targetName = gameState.phase === 'prediction' ? '本抽選会まで' : '大会開始まで';
    document.getElementById('countdown').textContent = 
        `${targetName} ${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;
    
    // 予想締切時間も更新
    updatePredictionDeadline();
}

// ユーザーモーダル表示
function showUserModal() {
    document.getElementById('userModal').style.display = 'flex';
}

// ユーザー登録
function registerUser() {
    const userName = document.getElementById('userName').value.trim();
    if (!userName) {
        alert('ニックネームを入力してください');
        return;
    }

    currentUser = userName;
    localStorage.setItem('currentUser', currentUser);
    document.getElementById('userModal').style.display = 'none';
    initializeApp();
}

// 入力方式切り替え
function switchInputMethod(method) {
    // タブの状態更新
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.method === method);
    });

    // 入力方式の表示切り替え
    document.querySelectorAll('.input-method').forEach(el => {
        el.style.display = 'none';
    });
    document.getElementById(method + 'Method').style.display = 'block';
}

// 地域グリッド初期化
function initializeRegionGrid() {
    const regionGrid = document.getElementById('regionGrid');
    regionGrid.innerHTML = '';

    schoolsData.regions.forEach(region => {
        const regionCard = document.createElement('button');
        regionCard.className = 'region-card';
        regionCard.textContent = region.region;
        regionCard.addEventListener('click', () => showPrefectures(region));
        regionGrid.appendChild(regionCard);
    });
}

// 都道府県表示
function showPrefectures(region) {
    const prefectureList = document.getElementById('prefectureList');
    prefectureList.innerHTML = '<h3>都道府県を選択</h3>';
    prefectureList.style.display = 'block';

    region.teams.forEach(team => {
        const prefItem = document.createElement('div');
        prefItem.className = 'prefecture-item';
        prefItem.textContent = team.pref;
        prefItem.addEventListener('click', () => selectSchool(team));
        prefectureList.appendChild(prefItem);
    });

    document.getElementById('schoolList').style.display = 'none';
}

// 学校選択
function selectSchool(team) {
    // 既存の予想をチェック
    const existingPrediction = predictions.find(p => p.user === currentUser);
    const now = new Date();
    const deadline = IMPORTANT_DATES.tournamentStart;
    const canEdit = now < deadline;
    
    // 既存の予想があり、締め切り前の場合は確認ダイアログを表示
    if (existingPrediction && canEdit) {
        const confirmMessage = `あなたは「${existingPrediction.school}」を予想済みです。変更しますか？`;
        if (!confirm(confirmMessage)) {
            return; // キャンセルされた場合は処理を中止
        }
    }
    
    selectedSchool = {
        region: findRegionByTeam(team),
        pref: team.pref,
        school: team.school,
        appearance: team.appearance
    };
    showSelectedSchool();
}

// 選択された学校表示
function showSelectedSchool() {
    const selectedDiv = document.getElementById('selectedSchool');
    const schoolCard = document.getElementById('schoolCard');
    
    schoolCard.innerHTML = `
        <h4>${selectedSchool.school}</h4>
        <p>${selectedSchool.pref} (${selectedSchool.region})</p>
        <p>${selectedSchool.appearance}</p>
    `;
    
    selectedDiv.style.display = 'block';
    selectedDiv.scrollIntoView({ behavior: 'smooth' });
}

// 地域検索
function findRegionByTeam(team) {
    for (const region of schoolsData.regions) {
        if (region.teams.some(t => t.school === team.school)) {
            return region.region;
        }
    }
    return '';
}

// 検索処理
function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    const resultsDiv = document.getElementById('searchResults');
    
    if (query.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }

    const results = [];
    schoolsData.regions.forEach(region => {
        region.teams.forEach(team => {
            if (team.school.toLowerCase().includes(query) || 
                team.pref.toLowerCase().includes(query)) {
                results.push({ ...team, region: region.region });
            }
        });
    });

    resultsDiv.innerHTML = '';
    results.slice(0, 10).forEach(team => {
        const resultItem = document.createElement('div');
        resultItem.className = 'school-item';
        resultItem.innerHTML = `
            <div>
                <div class="school-name">${team.school}</div>
                <div style="font-size: 0.8rem; color: #666;">${team.pref} (${team.region})</div>
            </div>
            <div class="school-appearance">${team.appearance}</div>
        `;
        resultItem.addEventListener('click', () => {
            selectSchool(team);
            document.getElementById('searchInput').value = '';
            resultsDiv.innerHTML = '';
        });
        resultsDiv.appendChild(resultItem);
    });
}

// 全学校リスト初期化
function initializeAllSchoolsList() {
    const listDiv = document.getElementById('allSchoolsList');
    listDiv.innerHTML = '';

    schoolsData.regions.forEach(region => {
        const regionHeader = document.createElement('h4');
        regionHeader.textContent = region.region;
        regionHeader.style.cssText = 'margin: 20px 0 10px 0; color: #667eea; font-size: 1.1rem;';
        listDiv.appendChild(regionHeader);

        region.teams.forEach(team => {
            const schoolItem = document.createElement('div');
            schoolItem.className = 'school-item';
            schoolItem.innerHTML = `
                <div>
                    <div class="school-name">${team.school}</div>
                    <div style="font-size: 0.8rem; color: #666;">${team.pref}</div>
                </div>
                <div class="school-appearance">${team.appearance}</div>
            `;
            schoolItem.addEventListener('click', () => selectSchool({ ...team, region: region.region }));
            listDiv.appendChild(schoolItem);
        });
    });
}

// 日本地図初期化（簡易版）
function initializeJapanMap() {
    const mapDiv = document.getElementById('japanMap');
    mapDiv.innerHTML = '';

    const allPrefs = [];
    schoolsData.regions.forEach(region => {
        region.teams.forEach(team => {
            allPrefs.push({ ...team, region: region.region });
        });
    });

    allPrefs.forEach(team => {
        const prefBtn = document.createElement('button');
        prefBtn.className = 'prefecture-btn';
        prefBtn.textContent = team.pref;
        prefBtn.addEventListener('click', () => selectSchool(team));
        mapDiv.appendChild(prefBtn);
    });
}

// 予想送信
function submitPrediction() {
    if (!selectedSchool) {
        alert('学校を選択してください');
        return;
    }

    if (gameState.phase !== 'prediction') {
        alert('予想受付は終了しています');
        return;
    }

    // 既存の予想を更新または新規追加
    const existingIndex = predictions.findIndex(p => p.user === currentUser);
    const prediction = {
        user: currentUser,
        school: selectedSchool.school,
        pref: selectedSchool.pref,
        region: selectedSchool.region,
        timestamp: new Date().toISOString()
    };

    if (existingIndex >= 0) {
        predictions[existingIndex] = prediction;
    } else {
        predictions.push(prediction);
    }

    localStorage.setItem('predictions', JSON.stringify(predictions));
    alert(`${selectedSchool.school}で予想を登録しました！`);
    resetSelection();
    updateUI();
}

// 選択リセット
function resetSelection() {
    selectedSchool = null;
    document.getElementById('selectedSchool').style.display = 'none';
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
}

// UI更新
function updateUI() {
    // 現在のフェーズに応じてセクション表示
    hideAllSections();
    
    const predictionSection = document.getElementById('predictionSection');
    const allPredictionsBtn = document.getElementById('showAllPredictionsBtn');
    
    // 締め切り後に全予想公開ボタンを表示
    const now = new Date();
    const deadline = IMPORTANT_DATES.tournamentStart;
    if (now >= deadline) {
        allPredictionsBtn.style.display = 'inline-block';
    }

    switch (gameState.phase) {
        case 'prediction':
            predictionSection.style.display = 'block';
            // 現在の予想があれば表示
            if (currentUser) {
                showCurrentPrediction();
            }
            break;
        case 'locked':
            showPredictionsList();
            break;
        case 'final':
        case 'revenge':
            showResults();
            break;
    }
    
    // 現在の予想を表示
    showCurrentPrediction();
}

// 現在の予想表示
function showCurrentPrediction() {
    const currentPredictionDiv = document.getElementById('currentPrediction');
    const currentPredictionCard = document.getElementById('currentPredictionCard');
    
    if (!currentUser) {
        currentPredictionDiv.style.display = 'none';
        return;
    }
    
    const userPrediction = predictions.find(p => p.user === currentUser);
    
    if (userPrediction) {
        currentPredictionDiv.style.display = 'block';
        
        const predictionTime = new Date(userPrediction.timestamp).toLocaleString('ja-JP');
        const now = new Date();
        const deadline = IMPORTANT_DATES.tournamentStart;
        const canEdit = now < deadline;
        
        // 締め切り前後で表示を変更
        const editMessage = canEdit ? 
            `<div style="background: #e8f5e8; padding: 10px; border-radius: 8px; margin-top: 15px; border-left: 4px solid #4caf50;">
                <div style="font-weight: bold; color: #2e7d32; margin-bottom: 5px;">✅ 変更可能</div>
                <div style="color: #388e3c; font-size: 0.9em;">締め切り前のため、予想の変更・削除が可能です</div>
            </div>` :
            `<div style="background: #ffebee; padding: 10px; border-radius: 8px; margin-top: 15px; border-left: 4px solid #f44336;">
                <div style="font-weight: bold; color: #c62828; margin-bottom: 5px;">🔒 変更不可</div>
                <div style="color: #d32f2f; font-size: 0.9em;">締め切り後のため、予想の変更はできません</div>
            </div>`;
        
        currentPredictionCard.innerHTML = `
            <div style="text-align: center; margin-bottom: 15px;">
                <div style="font-size: 1.5em; font-weight: bold; color: #1976d2; margin-bottom: 8px;">🏆 あなたの優勝予想</div>
                <div style="font-size: 2em; font-weight: bold; color: #d32f2f; background: linear-gradient(135deg, #fff3e0, #fce4ec); padding: 15px; border-radius: 10px; border: 3px solid #ff9800;">${userPrediction.school}</div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;">
                <div style="background: #e3f2fd; padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-weight: bold; color: #1976d2;">都道府県</div>
                    <div style="color: #666;">${userPrediction.pref}</div>
                </div>
                <div style="background: #f3e5f5; padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-weight: bold; color: #7b1fa2;">地域</div>
                    <div style="color: #666;">${userPrediction.region}</div>
                </div>
            </div>
            <div style="text-align: center; margin-top: 15px; padding: 10px; background: #f5f5f5; border-radius: 8px;">
                <div style="font-size: 0.9em; color: #666;">📅 予想日時: ${predictionTime}</div>
            </div>
            ${editMessage}
        `;
        
        // 編集・削除ボタンの表示制御
        const editBtn = document.getElementById('editPrediction');
        const deleteBtn = document.getElementById('deletePrediction');
        if (editBtn && deleteBtn) {
            editBtn.style.display = canEdit ? 'inline-block' : 'none';
            deleteBtn.style.display = canEdit ? 'inline-block' : 'none';
        }
    } else {
        // 予想がない場合の表示
        currentPredictionDiv.style.display = 'block';
        currentPredictionCard.innerHTML = `
            <div style="text-align: center; padding: 30px;">
                <div style="font-size: 3em; margin-bottom: 15px;">🤔</div>
                <div style="font-size: 1.3em; font-weight: bold; color: #ff9800; margin-bottom: 10px;">まだ予想していません</div>
                <div style="color: #666; margin-bottom: 20px;">下記の方法から優勝校を予想してください</div>
                <div style="background: linear-gradient(135deg, #fff3e0, #fce4ec); padding: 15px; border-radius: 10px; border-left: 4px solid #ff9800;">
                    <div style="font-weight: bold; color: #e65100; margin-bottom: 8px;">⚠️ 予想締切まで</div>
                    <div id="predictionDeadline" style="font-size: 1.1em; color: #d84315;"></div>
                </div>
            </div>
        `;
        
        // 締切までの時間を表示
        updatePredictionDeadline();
    }
}

// 予想締切時間の更新
function updatePredictionDeadline() {
    const deadlineDiv = document.getElementById('predictionDeadline');
    if (!deadlineDiv) return;
    
    const now = new Date();
    const deadline = IMPORTANT_DATES.tournamentStart;
    const timeDiff = deadline - now;
    
    if (timeDiff > 0) {
        const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        
        deadlineDiv.innerHTML = `あと ${days}日 ${hours}時間 ${minutes}分`;
    } else {
        deadlineDiv.innerHTML = '予想受付終了';
    }
}

// 予想編集
function editCurrentPrediction() {
    const userPrediction = predictions.find(p => p.user === currentUser);
    if (!userPrediction) return;
    
    // 現在の予想を選択状態にセット
    selectedSchool = {
        school: userPrediction.school,
        pref: userPrediction.pref,
        region: userPrediction.region
    };
    
    // 選択された学校を表示
    showSelectedSchool();
    
    // 予想入力セクションにスクロール
    document.querySelector('.input-method-tabs').scrollIntoView({ behavior: 'smooth' });
}

// 予想削除
function deleteCurrentPrediction() {
    if (!currentUser) return;
    
    if (confirm('予想を削除してもよろしいですか？')) {
        const index = predictions.findIndex(p => p.user === currentUser);
        if (index >= 0) {
            predictions.splice(index, 1);
            localStorage.setItem('predictions', JSON.stringify(predictions));
            alert('予想を削除しました');
            updateUI();
        }
    }
}

// 予想一覧表示
function showPredictionsList() {
    const section = document.getElementById('predictionsList');
    const grid = document.getElementById('predictionsGrid');
    
    // 他のセクションを非表示
    hideAllSections();
    
    // 予想一覧を表示
    section.style.display = 'block';
    
    grid.innerHTML = '';

    predictions.forEach(prediction => {
        const card = document.createElement('div');
        card.className = 'prediction-card';
        card.innerHTML = `
            <div class="prediction-user">${prediction.user}</div>
            <div class="prediction-school">${prediction.school}</div>
            <div style="font-size: 0.8rem; color: #666; margin-top: 5px;">
                ${prediction.pref} (${prediction.region})
            </div>
        `;
        grid.appendChild(card);
    });
}

// 参加者一覧表示
function showParticipants() {
    const section = document.getElementById('participantsSection');
    const statsDiv = document.getElementById('participantsStats');
    const listDiv = document.getElementById('participantsList');
    
    // 他のセクションを非表示
    hideAllSections();
    
    // 参加者セクションを表示
    section.style.display = 'block';
    
    // 参加者統計を表示
    const totalParticipants = predictions.length;
    const uniqueSchools = new Set(predictions.map(p => p.school)).size;
    const prefectures = new Set(predictions.map(p => p.pref)).size;
    
    statsDiv.innerHTML = `
        <div class="stat-item">
            <span class="stat-number">${totalParticipants}</span>
            <div class="stat-label">総参加者数</div>
        </div>
        <div class="stat-item">
            <span class="stat-number">${uniqueSchools}</span>
            <div class="stat-label">予想された学校数</div>
        </div>
        <div class="stat-item">
            <span class="stat-number">${prefectures}</span>
            <div class="stat-label">都道府県数</div>
        </div>
    `;
    
    // 参加者リストを表示
    listDiv.innerHTML = predictions.map((p, index) => {
        const joinDate = new Date(p.timestamp).toLocaleDateString('ja-JP');
        return `
            <div class="participant-card">
                <div class="participant-name">${p.user}</div>
                <div class="participant-info">
                    予想校: ${p.school}<br>
                    都道府県: ${p.pref}<br>
                    参加日: ${joinDate}
                </div>
            </div>
        `;
    }).join('');
}

// 全予想公開表示（締め切り後のみ）
function showAllPredictions() {
    // 締め切り時刻をチェック
    const now = new Date();
    const deadline = IMPORTANT_DATES.tournamentStart;
    
    if (now < deadline) {
        alert('全予想の公開は大会開始後に行われます。');
        return;
    }
    
    const section = document.getElementById('allPredictionsSection');
    const grid = document.getElementById('allPredictionsGrid');
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    // 他のセクションを非表示
    hideAllSections();
    
    // 全予想セクションを表示
    section.style.display = 'block';
    
    // フィルターボタンのイベントリスナー
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterPredictions(btn.dataset.filter);
        });
    });
    
    // 初期表示（全て）
    filterPredictions('all');
}

// 予想フィルタリング
function filterPredictions(filter) {
    const grid = document.getElementById('allPredictionsGrid');
    let filteredPredictions = [...predictions];
    
    switch (filter) {
        case 'region':
            // 地域別でソート
            filteredPredictions.sort((a, b) => {
                return a.region.localeCompare(b.region);
            });
            break;
        case 'school':
            // 学校名でソート
            filteredPredictions.sort((a, b) => a.school.localeCompare(b.school));
            break;
        default:
            // 参加順でソート
            filteredPredictions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
    
    grid.innerHTML = filteredPredictions.map(p => {
        const submitTime = new Date(p.timestamp).toLocaleString('ja-JP');
        
        return `
            <div class="prediction-card">
                <div class="prediction-header">
                    <div class="prediction-user">${p.user}</div>
                    <div class="prediction-time">${submitTime}</div>
                </div>
                <div class="prediction-school">${p.school}</div>
                <div class="prediction-details">
                    都道府県: ${p.pref}<br>
                    地域: ${p.region}
                </div>
            </div>
        `;
    }).join('');
}

// 全セクション非表示
function hideAllSections() {
    document.getElementById('predictionSection').style.display = 'none';
    document.getElementById('predictionsList').style.display = 'none';
    document.getElementById('participantsSection').style.display = 'none';
    document.getElementById('allPredictionsSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
}

// 結果表示
function showResults() {
    if (gameState.winner) {
        showWinnerAnnouncement();
    }
    showScoreBoard();
    
    if (gameState.phase === 'revenge' && gameState.finalTeams.length === 2) {
        showRevengeMatch();
    }
}

// 優勝発表
function showWinnerAnnouncement() {
    const announcement = document.getElementById('winnerAnnouncement');
    announcement.innerHTML = `
        <h3>🏆 優勝校発表</h3>
        <div style="font-size: 1.5rem; font-weight: bold; margin: 15px 0;">
            ${gameState.winner}
        </div>
        <p>おめでとうございます！</p>
    `;
}

// スコアボード表示
function showScoreBoard() {
    const scoreBoard = document.getElementById('scoreBoard');
    const scores = calculateScores();
    
    scoreBoard.innerHTML = '<h3>📊 最終スコア</h3>';
    
    scores.forEach((score, index) => {
        const item = document.createElement('div');
        item.className = `score-item ${score.isWinner ? 'winner' : ''} ${score.isRevenge ? 'revenge' : ''}`;
        
        const badges = [];
        if (score.isWinner) badges.push('<span class="badge crown">👑 本戦勝者</span>');
        if (score.isRevenge) badges.push('<span class="badge fire">🔥 リベンジ成功</span>');
        
        item.innerHTML = `
            <div class="user-info">
                <span>${score.user}</span>
                ${badges.join('')}
                <div style="font-size: 0.8rem; color: #666;">${score.school}</div>
            </div>
            <div class="score">${score.points}点</div>
        `;
        scoreBoard.appendChild(item);
    });
}

// スコア計算
function calculateScores() {
    const scores = predictions.map(prediction => {
        let points = 0;
        let isWinner = false;
        let isRevenge = false;
        
        if (gameState.winner) {
            if (prediction.school === gameState.winner) {
                points = SCORE_TABLE['優勝'];
                isWinner = true;
            } else {
                // 実際の大会では到達順位に応じてスコア付与
                // ここでは簡易的に10点とする
                points = SCORE_TABLE['その他'];
            }
        }
        
        // リベンジマッチの結果確認
        const revengeData = JSON.parse(localStorage.getItem('revengePredictions')) || [];
        const revengePrediction = revengeData.find(r => r.user === prediction.user);
        if (revengePrediction && revengePrediction.school === gameState.winner) {
            isRevenge = true;
            points = SCORE_TABLE['優勝'];
        }
        
        return {
            user: prediction.user,
            school: prediction.school,
            points,
            isWinner,
            isRevenge
        };
    });
    
    // スコア順でソート
    return scores.sort((a, b) => {
        if (a.isWinner && !b.isWinner) return -1;
        if (!a.isWinner && b.isWinner) return 1;
        if (a.isRevenge && !b.isRevenge) return -1;
        if (!a.isRevenge && b.isRevenge) return 1;
        return b.points - a.points;
    });
}

// リベンジマッチ表示
function showRevengeMatch() {
    const revengeDiv = document.getElementById('revengeMatch');
    const finalTeamsDiv = document.getElementById('finalTeams');
    
    // 本戦で外したユーザーのみ参加可能
    const userPrediction = predictions.find(p => p.user === currentUser);
    if (!userPrediction || userPrediction.school === gameState.winner) {
        revengeDiv.style.display = 'none';
        return;
    }
    
    revengeDiv.style.display = 'block';
    finalTeamsDiv.innerHTML = '';
    
    gameState.finalTeams.forEach(team => {
        const teamDiv = document.createElement('div');
        teamDiv.className = 'final-team';
        teamDiv.textContent = team;
        teamDiv.addEventListener('click', () => {
            document.querySelectorAll('.final-team').forEach(t => t.classList.remove('selected'));
            teamDiv.classList.add('selected');
        });
        finalTeamsDiv.appendChild(teamDiv);
    });
}

// リベンジ予想送信
function submitRevenge() {
    const selectedTeam = document.querySelector('.final-team.selected');
    if (!selectedTeam) {
        alert('決勝進出校を選択してください');
        return;
    }
    
    const revengePredictions = JSON.parse(localStorage.getItem('revengePredictions')) || [];
    const existingIndex = revengePredictions.findIndex(r => r.user === currentUser);
    const revengePrediction = {
        user: currentUser,
        school: selectedTeam.textContent,
        timestamp: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
        revengePredictions[existingIndex] = revengePrediction;
    } else {
        revengePredictions.push(revengePrediction);
    }
    
    localStorage.setItem('revengePredictions', JSON.stringify(revengePredictions));
    alert(`${selectedTeam.textContent}でリベンジ予想を登録しました！`);
    document.getElementById('revengeMatch').style.display = 'none';
}

// 管理者機能
function lockPredictions() {
    gameState.phase = 'locked';
    gameState.lockTime = new Date().toISOString();
    localStorage.setItem('gameState', JSON.stringify(gameState));
    updateUI();
    alert('予想をロックしました');
}

function setFinalTeams() {
    const team1 = prompt('決勝進出校1を入力してください:');
    const team2 = prompt('決勝進出校2を入力してください:');
    
    if (team1 && team2) {
        gameState.finalTeams = [team1, team2];
        gameState.phase = 'revenge';
        localStorage.setItem('gameState', JSON.stringify(gameState));
        updateUI();
        alert('決勝進出校を設定しました');
    }
}

function announceWinner() {
    const winner = prompt('優勝校を入力してください:');
    if (winner) {
        gameState.winner = winner;
        gameState.phase = 'final';
        localStorage.setItem('gameState', JSON.stringify(gameState));
        updateUI();
        alert('優勝校を発表しました');
    }
}

function resetAll() {
    if (confirm('全データをリセットしますか？')) {
        localStorage.clear();
        location.reload();
    }
}