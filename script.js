document.addEventListener('DOMContentLoaded', function() {
    // 定数
    const KEYS = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];
    const OCTAVES = [7, 6, 5, 4, 3, 2, 1, 0];
    const ROW_HEIGHT = 24;
    const CELL_WIDTH = 80; // 4分音符の幅
    const BEATS_PER_BAR = 4;
    // 変数に変更
    let BARS = 16;
    
    // 状態
    let notes = [];
    let selectedNote = null;
    let grid = [];
    let gridSize = 1; // デフォルト: 4分音符
    let isTriplet = false;
    let audioContext = null;
    let audioInitialized = false;
    let masterVolume = 0.5; // デフォルト音量（0.0〜1.0）
    let masterVolumeNode = null;
    let longPressTimer = null; // 長押し検出用タイマー
    let isLongPress = false;   // 長押し状態フラグ
    let lyricInputMode = 'punctuation'; // 'punctuation' または 'char'
    
    // グローバル変数としてタップ情報を追跡
    let lastTappedNoteId = null;
    let lastTapNoteTime = 0;
    
    // 履歴管理用の状態
    let history = [];
    let historyIndex = -1;
    let isUndoingRedoing = false;
    
    // 再生関連の状態
    let isPlaying = false;     // 再生中フラグ
    let isPaused = false;      // 一時停止フラグ
    let currentPlaybackTime = 0;  // 現在の再生位置（ビート単位）
    let playbackStartTime = 0;    // 再生開始時間（audioContext.currentTime基準）
    let playbackCursorEl = null;  // 再生カーソル要素
    let scheduledNotes = {};   // スケジュール済みノート
    let lookaheadTime = 0.1;   // スケジュールの先読み時間（秒）
    let scheduleIntervalId = null; // スケジューラーのインターバルID
    let tempo = 120;           // テンポ（BPM）
    let currentEditingNoteEl = null; // 現在歌詞を編集中のノート要素
    
    // DOM要素
    const pianoKeysEl = document.getElementById('piano-keys');
    const gridEl = document.getElementById('grid');
    const gridAreaEl = document.getElementById('grid-area');
    const barNumbersEl = document.getElementById('bar-numbers');
    const clearBtn = document.getElementById('clear-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const saveMidiBtn = document.getElementById('save-midi-btn');
    const tripletCheckbox = document.getElementById('triplet-grid');
    const overlapInfoEl = document.getElementById('overlap-info');
    const soundTestBtn = document.getElementById('sound-test');
    const volumeSlider = document.getElementById('volume-slider');
    
    // 再生関連
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    const tempoInput = document.getElementById('tempo-input');
    
    // 小節数入力
    const barCountInput = document.getElementById('bar-count-input');
    
    // 歌詞入力モード
    const lyricModeBtn = document.getElementById('lyric-mode-btn');
    
    // 操作パネル
    const moveLeftBtn = document.getElementById('move-left');
    const moveRightBtn = document.getElementById('move-right');
    const moveUpBtn = document.getElementById('move-up');
    const moveDownBtn = document.getElementById('move-down');
    const shorterBtn = document.getElementById('shorter');
    const longerBtn = document.getElementById('longer');
    const grid4thBtn = document.getElementById('grid-4th');
    const grid8thBtn = document.getElementById('grid-8th');
    const grid16thBtn = document.getElementById('grid-16th');
    const grid32ndBtn = document.getElementById('grid-32nd');
    
    // オーディオ初期化
    function initAudio() {
        if (audioInitialized) return;
        
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            // マスターボリュームノード作成
            masterVolumeNode = audioContext.createGain();
            masterVolumeNode.gain.value = masterVolume;
            masterVolumeNode.connect(audioContext.destination);
            
            audioInitialized = true;
        } catch (e) {
            console.error('Web Audio API is not supported in this browser', e);
        }
    }
    
    // 特定の音階の音を鳴らす
    function playNote(noteIndex) {
        if (!audioInitialized) initAudio();
        if (!audioContext) return;
        
        const midiPitch = getMIDIPitch(noteIndex);
        const freq = midiToFrequency(midiPitch);
        
        // シンプルなピアノ風音色のオシレーター
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine'; // 基本的なサイン波
        oscillator.frequency.value = freq;
        
        // エンベロープ
        const envelope = audioContext.createGain();
        envelope.gain.setValueAtTime(0, audioContext.currentTime);
        envelope.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
        envelope.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.1);
        envelope.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);
        
        // マスターボリュームノードに接続
        oscillator.connect(envelope);
        envelope.connect(masterVolumeNode);
        
        // 音を鳴らす
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
    }
    
    // 指定時間にノートを再生
    function playNoteAtTime(noteIndex, startTime, duration) {
        if (!audioContext) return;
        
        const midiPitch = getMIDIPitch(noteIndex);
        const freq = midiToFrequency(midiPitch);
        
        // シンプルなピアノ風音色のオシレーター
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine'; // 基本的なサイン波
        oscillator.frequency.value = freq;
        
        // エンベロープ（ピアノらしいATTACK/DECAY/SUSTAIN/RELEASE）
        const envelope = audioContext.createGain();
        envelope.gain.setValueAtTime(0, startTime);
        envelope.gain.linearRampToValueAtTime(0.3, startTime + 0.01); // 急速なアタック
        envelope.gain.linearRampToValueAtTime(0.15, startTime + 0.1); // 初期減衰
        envelope.gain.linearRampToValueAtTime(0.1, startTime + duration * 0.6); // サステイン
        envelope.gain.linearRampToValueAtTime(0, startTime + duration); // リリース
        
        // マスターボリュームに接続
        oscillator.connect(envelope);
        envelope.connect(masterVolumeNode);
        
        // 音を鳴らす
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
    }
    
    // マスターボリュームを設定
    function setMasterVolume(value) {
        masterVolume = value;
        
        if (masterVolumeNode) {
            masterVolumeNode.gain.value = masterVolume;
        }
    }
    
    // MIDIノート番号から周波数への変換
    function midiToFrequency(midiNote) {
        return 440 * Math.pow(2, (midiNote - 69) / 12);
    }
    
    // グリッド生成
    function generateGrid() {
        grid = [];
        let noteIndex = 0;
        
        OCTAVES.forEach(octave => {
            KEYS.forEach(key => {
                const isBlackKey = key.includes('#');
                grid.push({
                    octave,
                    key,
                    isBlackKey,
                    noteIndex
                });
                noteIndex++;
            });
        });
        
        return grid;
    }
    
    // ピアノキー描画
    function renderPianoKeys() {
        pianoKeysEl.innerHTML = '';
        
        grid.forEach(note => {
            const keyEl = document.createElement('div');
            keyEl.className = `piano-key ${note.isBlackKey ? 'black' : 'white'}`;
            keyEl.textContent = `${note.key}${note.octave}`;
            keyEl.style.top = `${note.noteIndex * ROW_HEIGHT}px`;
            
            // ピアノキーをクリックしたときに音を鳴らす
            keyEl.addEventListener('click', function() {
                playNote(note.noteIndex);
            });
            
            pianoKeysEl.appendChild(keyEl);
        });
        
        // スクロール同期
        pianoKeysEl.addEventListener('scroll', function() {
            gridAreaEl.scrollTop = pianoKeysEl.scrollTop;
        });
    }
    
    // グリッド描画
    function renderGrid() {
        // 全体のサイズ設定
        gridEl.style.height = `${grid.length * ROW_HEIGHT}px`;
        gridEl.style.width = `${BARS * BEATS_PER_BAR * CELL_WIDTH}px`;
        
        // 既存のグリッド行をクリア
        gridEl.innerHTML = '';
        
        // グリッド行を作成
        grid.forEach(note => {
            const rowEl = document.createElement('div');
            rowEl.className = `grid-row ${note.isBlackKey ? 'black' : 'white'}`;
            rowEl.style.top = `${note.noteIndex * ROW_HEIGHT}px`;
            rowEl.style.width = '100%';
            
            // グリッドのクリックイベント（ノート作成）
            rowEl.addEventListener('click', function(e) {
                // スクロール可能なコンテナ(gridAreaEl)を基準にした位置計算
                const containerRect = gridAreaEl.getBoundingClientRect();
                const offsetX = e.clientX - containerRect.left;
                const absoluteX = offsetX + gridAreaEl.scrollLeft;
                
                // デバッグ情報を出力
                console.log('====== クリック座標計算 ======');
                console.log('containerRect.left:', containerRect.left);
                console.log('e.clientX:', e.clientX);
                console.log('offsetX:', offsetX);
                console.log('gridAreaEl.scrollLeft:', gridAreaEl.scrollLeft);
                console.log('計算後の絶対X座標:', absoluteX);
                
                // ピクセル位置をビート単位に変換
                let beatPosition = absoluteX / CELL_WIDTH;
                
                // グリッドにスナップ
                beatPosition = quantize(beatPosition);
                console.log('最終ビート位置:', beatPosition);
                
                // 新しいノートを作成（既存ノートがなければ）
                if (!isClickingNote(e)) {
                    createNote(note.noteIndex, beatPosition);
                }
            });
            
            gridEl.appendChild(rowEl);
        });
        
        // 小節線と拍線を描画
        drawGridLines();
        
        // 小節番号を描画
        renderBarNumbers();
        
        // ノートを描画
        renderNotes();
        
        // スクロール同期
        gridAreaEl.addEventListener('scroll', function() {
            pianoKeysEl.scrollTop = gridAreaEl.scrollTop;
            // スクロールに合わせて小節番号の表示領域も調整
            barNumbersEl.scrollLeft = gridAreaEl.scrollLeft;
        });
        
        // C4が中央に来るようにスクロール
        scrollToMiddleC();
    }
    
    // 小節番号の描画
    function renderBarNumbers() {
        barNumbersEl.innerHTML = '';
        
        // すべての小節の番号を作成
        for (let i = 0; i < BARS; i++) {
            const barNumberEl = document.createElement('div');
            barNumberEl.className = 'bar-number';
            barNumberEl.style.left = `${i * BEATS_PER_BAR * CELL_WIDTH}px`;
            barNumberEl.textContent = i + 1;
            barNumbersEl.appendChild(barNumberEl);
        }
    }
    
    // C4が画面中央に来るようにスクロール
    function scrollToMiddleC() {
        // C4のノートインデックスを探す
        let middleCIndex = -1;
        grid.forEach((note, index) => {
            if (note.key === 'C' && note.octave === 4) {
                middleCIndex = index;
            }
        });
        
        if (middleCIndex !== -1) {
            // C4の位置
            const c4Position = middleCIndex * ROW_HEIGHT;
            // ビューポートの高さの半分だけオフセット
            const offset = gridAreaEl.clientHeight / 2;
            // スクロール位置を設定
            gridAreaEl.scrollTop = c4Position - offset;
        }
    }
    
    // 小節線と拍線を描画
    function drawGridLines() {
        // 既存の線を削除
        document.querySelectorAll('.bar-line, .beat-line, .grid-line').forEach(el => el.remove());
        
        // 小節線（1小節ごと）
        for (let i = 0; i <= BARS; i++) {
            const barLine = document.createElement('div');
            barLine.className = 'bar-line';
            barLine.style.position = 'absolute';
            barLine.style.top = '0';
            barLine.style.bottom = '0';
            barLine.style.left = `${i * BEATS_PER_BAR * CELL_WIDTH}px`;
            barLine.style.width = '1px';
            barLine.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            barLine.style.pointerEvents = 'none';
            gridEl.appendChild(barLine);
        }
        
        // 拍線（1拍ごと）
        for (let i = 0; i < BARS * BEATS_PER_BAR; i++) {
            if (i % BEATS_PER_BAR !== 0) {  // 小節線と重複しないように
                const beatLine = document.createElement('div');
                beatLine.className = 'beat-line';
                beatLine.style.position = 'absolute';
                beatLine.style.top = '0';
                beatLine.style.bottom = '0';
                beatLine.style.left = `${i * CELL_WIDTH}px`;
                beatLine.style.width = '1px';
                beatLine.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                beatLine.style.pointerEvents = 'none';
                gridEl.appendChild(beatLine);
            }
        }
        
        // グリッドライン（グリッドサイズに応じて）
        const effectiveGridSize = isTriplet ? gridSize * 2/3 : gridSize;
        const gridLinesPerBeat = 1 / effectiveGridSize;
        
        for (let bar = 0; bar < BARS; bar++) {
            for (let beat = 0; beat < BEATS_PER_BAR; beat++) {
                const beatPosition = bar * BEATS_PER_BAR + beat;
                
                // 拍の中での分割線（グリッドサイズに応じて）
                for (let i = 1; i < gridLinesPerBeat; i++) {
                    const position = beatPosition + (i * effectiveGridSize);
                    const gridLine = document.createElement('div');
                    gridLine.className = 'grid-line';
                    gridLine.style.position = 'absolute';
                    gridLine.style.top = '0';
                    gridLine.style.bottom = '0';
                    gridLine.style.left = `${position * CELL_WIDTH}px`;
                    gridLine.style.width = '1px';
                    gridLine.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                    gridLine.style.pointerEvents = 'none';
                    gridEl.appendChild(gridLine);
                }
            }
        }
    }
    
    // クオンタイズ（グリッドへのスナップ）
    function quantize(value) {
        const effectiveGridSize = isTriplet ? gridSize * 2/3 : gridSize;
        return Math.round(value / effectiveGridSize) * effectiveGridSize;
    }
    
    // ノート描画
    function renderNotes() {
        // 既存のノートを削除
        try {
            const noteElements = document.querySelectorAll('.note');
            noteElements.forEach(el => {
                try {
                    if (el && el.parentNode) {
                        el.parentNode.removeChild(el);
                    }
                } catch (err) {
                    // 個別の要素削除エラーを無視
                }
            });
        } catch (err) {
            console.log("ノート削除中にエラーが発生しました", err);
        }
        
        // ノートの重なりを検出
        detectOverlappingNotes();
        
        // ノートを描画
        notes.forEach(note => {
            const noteEl = document.createElement('div');
            noteEl.className = 'note';
            noteEl.style.top = `${note.noteIndex * ROW_HEIGHT + 2}px`;
            noteEl.style.left = `${note.startBeat * CELL_WIDTH}px`;
            noteEl.style.width = `${note.duration * CELL_WIDTH - 6}px`; // マージンを設定
            noteEl.setAttribute('data-id', note.id);
            
            // 選択状態
            if (note === selectedNote) {
                noteEl.classList.add('selected');
            }
            
            // 重なり状態
            if (note.isOverlapping) {
                noteEl.classList.add('overlapping');
            }
            
            // ノート情報と歌詞表示
            const noteName = grid[note.noteIndex] ? `${grid[note.noteIndex].key}${grid[note.noteIndex].octave}` : '';
            
            // 歌詞があれば歌詞を表示、なければ音階名を表示
            if (note.lyric && note.lyric.trim() !== '') {
                noteEl.textContent = note.lyric;
            } else {
                noteEl.textContent = noteName;
            }
            
            // ノートクリックイベント（選択）
            noteEl.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!isLongPress) {
                    selectNote(note);
                }
            });
            
            // ダブルクリックでノート削除
            noteEl.addEventListener('dblclick', function(e) {
                e.stopPropagation();
                e.preventDefault(); // ダブルタップによるズームを防止
                deleteNote(note);
            });
            
            // ノートのタッチイベント処理
            noteEl.addEventListener('touchstart', function(e) {
                e.preventDefault(); // デフォルトの長押しメニューを防止
                
                const now = new Date().getTime();
                const timeSince = now - lastTapNoteTime;
                
                if (lastTappedNoteId === note.id && timeSince < 300) {
                    // 同じノートへのダブルタップを検出
                    clearLongPressTimer(); // タイマーをクリア
                    isLongPress = false;   // 長押しフラグをリセット
                    
                    // ノートを削除
                    deleteNote(note);
                    return;
                }
                
                // シングルタップとして処理し、長押し検出を開始
                lastTappedNoteId = note.id;
                lastTapNoteTime = now;
                startLongPressTimer(note, noteEl, e);
            });
            
            // 長押し検出（マウス用）
            noteEl.addEventListener('mousedown', function(e) {
                startLongPressTimer(note, noteEl, e);
            });
            
            // タッチ/マウス終了で長押しタイマーをリセット
            noteEl.addEventListener('mouseup', function() {
                if (!isLongPress) {
                    clearLongPressTimer();
                }
            });
            
            // タッチ終了時の処理
            noteEl.addEventListener('touchend', function(e) {
                // 長押しでなかった場合は選択処理を実行
                if (!isLongPress) {
                    clearLongPressTimer();
                    selectNote(note);
                }
            });
            
            noteEl.addEventListener('mouseleave', function() {
                clearLongPressTimer();
            });
            
            gridEl.appendChild(noteEl);
        });
        
        // 既存の歌詞入力フィールドがあれば削除
        removeInlineLyricEditor();
    }
    
    // 重なっているノートを検出する
    function detectOverlappingNotes() {
        // 重なりフラグをリセット
        notes.forEach(note => {
            note.isOverlapping = false;
        });
        
        // ノートを時間順にソート
        const sortedNotes = [...notes].sort((a, b) => a.startBeat - b.startBeat);
        
        // 各ノートについて、他のノートとの重なりをチェック
        for (let i = 0; i < sortedNotes.length; i++) {
            const currentNote = sortedNotes[i];
            const currentEnd = currentNote.startBeat + currentNote.duration;
            
            for (let j = i + 1; j < sortedNotes.length; j++) {
                const nextNote = sortedNotes[j];
                
                // 後続のノートが現在のノートの終了前に開始する場合、重なりがある
                if (nextNote.startBeat < currentEnd) {
                    currentNote.isOverlapping = true;
                    nextNote.isOverlapping = true;
                } else {
                    // ソートされているため、これ以上の重なりはない
                    break;
                }
            }
        }
        
        // 重なり情報を表示
        const overlappingCount = notes.filter(note => note.isOverlapping).length;
        if (overlappingCount > 0) {
            overlapInfoEl.textContent = `警告: ${overlappingCount}個のノートが重なっています (モノフォン)`;
        } else {
            overlapInfoEl.textContent = '';
        }
    }
    
    // 履歴に状態を保存
    function saveToHistory() {
        if (isUndoingRedoing) return;
        
        // 現在の状態よりも後の履歴を削除（やり直しを上書き）
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        
        // 現在のノート配列をディープコピー
        const notesCopy = JSON.parse(JSON.stringify(notes));
        
        // 履歴に追加
        history.push(notesCopy);
        historyIndex = history.length - 1;
        
        // ボタンの状態を更新
        updateUndoRedoButtons();
    }
    
    // 元に戻す処理
    function handleUndo() {
        if (historyIndex <= 0) return;
        
        isUndoingRedoing = true;
        historyIndex--;
        
        // 履歴から状態を復元
        notes = JSON.parse(JSON.stringify(history[historyIndex]));
        
        // ボタンの状態を更新
        updateUndoRedoButtons();
        
        // 選択状態をリセット
        selectedNote = null;
        
        // 再描画
        renderNotes();
        
        isUndoingRedoing = false;
    }
    
    // やり直し処理
    function handleRedo() {
        if (historyIndex >= history.length - 1) return;
        
        isUndoingRedoing = true;
        historyIndex++;
        
        // 履歴から状態を復元
        notes = JSON.parse(JSON.stringify(history[historyIndex]));
        
        // ボタンの状態を更新
        updateUndoRedoButtons();
        
        // 選択状態をリセット
        selectedNote = null;
        
        // 再描画
        renderNotes();
        
        isUndoingRedoing = false;
    }
    
    // 元に戻す/やり直しボタンの状態を更新
    function updateUndoRedoButtons() {
        undoBtn.disabled = historyIndex <= 0;
        redoBtn.disabled = historyIndex >= history.length - 1;
        
        undoBtn.style.opacity = undoBtn.disabled ? '0.5' : '1';
        redoBtn.style.opacity = redoBtn.disabled ? '0.5' : '1';
    }
    
    // ノート選択
    function selectNote(note) {
        selectedNote = note;
        
        // 選択時に音を鳴らす
        playNote(note.noteIndex);
        
        renderNotes();
    }
    
    // クリック位置にノートが存在するか確認
    function isClickingNote(e) {
        const noteElements = document.querySelectorAll('.note');
        for (const noteEl of noteElements) {
            const rect = noteEl.getBoundingClientRect();
            if (
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom
            ) {
                return true;
            }
        }
        return false;
    }
    
    // 新しいノートを作成
    function createNote(noteIndex, startBeat) {
        const effectiveGridSize = isTriplet ? gridSize * 2/3 : gridSize;
        
        const newNote = {
            id: Date.now(),
            noteIndex,
            startBeat,
            duration: effectiveGridSize, // トリプレット対応のグリッドサイズに合わせる
            lyric: '', // 歌詞を初期化
            isOverlapping: false // 重なりフラグを初期化
        };
        
        notes.push(newNote);
        selectNote(newNote);
        
        // 音を鳴らす
        playNote(noteIndex);
        
        // 履歴に保存
        saveToHistory();
        
        renderNotes();
    }
    
    // ノートを削除
    function deleteNote(note) {
        const index = notes.indexOf(note);
        if (index !== -1) {
            notes.splice(index, 1);
            if (selectedNote === note) {
                selectedNote = null;
            }
            
            // 履歴に保存
            saveToHistory();
            
            renderNotes();
        }
    }
    
    // Deleteキーでノートを削除
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Delete' && selectedNote) {
            deleteNote(selectedNote);
        }
    });
    
    // ノートを移動
    function moveNote(direction) {
        if (!selectedNote) return;
        
        const effectiveGridSize = isTriplet ? gridSize * 2/3 : gridSize;
        const oldNoteIndex = selectedNote.noteIndex;
        
        switch (direction) {
            case 'left':
                selectedNote.startBeat = Math.max(0, selectedNote.startBeat - effectiveGridSize);
                break;
            case 'right':
                selectedNote.startBeat += effectiveGridSize;
                break;
            case 'up':
                selectedNote.noteIndex = Math.max(0, selectedNote.noteIndex - 1);
                break;
            case 'down':
                selectedNote.noteIndex = Math.min(grid.length - 1, selectedNote.noteIndex + 1);
                break;
        }
        
        // 音階変更時に音を鳴らす
        if ((direction === 'up' || direction === 'down') && oldNoteIndex !== selectedNote.noteIndex) {
            playNote(selectedNote.noteIndex);
        }
        
        // 履歴に保存
        saveToHistory();
        
        renderNotes();
    }
    
    // ノートの長さを変更
    function changeNoteDuration(change) {
        if (!selectedNote) return;
        
        const effectiveGridSize = isTriplet ? gridSize * 2/3 : gridSize;
        
        if (change === 'shorter') {
            selectedNote.duration = Math.max(effectiveGridSize, selectedNote.duration - effectiveGridSize);
        } else {
            selectedNote.duration += effectiveGridSize;
        }
        
        // 履歴に保存
        saveToHistory();
        
        renderNotes();
    }
    
    // グリッドサイズボタンのハイライト更新
    function updateGridButtons() {
        grid4thBtn.classList.remove('active');
        grid8thBtn.classList.remove('active');
        grid16thBtn.classList.remove('active');
        grid32ndBtn.classList.remove('active');
        
        if (gridSize === 1) grid4thBtn.classList.add('active');
        else if (gridSize === 0.5) grid8thBtn.classList.add('active');
        else if (gridSize === 0.25) grid16thBtn.classList.add('active');
        else if (gridSize === 0.125) grid32ndBtn.classList.add('active');
    }

    // グリッドサイズ変更
    function changeGridSize(size) {
        gridSize = size;
        updateGridButtons();
        drawGridLines();
    }
    
    // 小節数変更
    function changeBarCount(newBarCount) {
        // 有効な範囲に制限
        newBarCount = Math.max(1, Math.min(100, newBarCount));
        
        // 減少する場合の確認
        if (newBarCount < BARS) {
            const maxBeat = newBarCount * BEATS_PER_BAR;
            const notesOutOfRange = notes.filter(note => note.startBeat >= maxBeat);
            
            if (notesOutOfRange.length > 0) {
                if (!confirm(`最後の${BARS - newBarCount}小節に${notesOutOfRange.length}個のノートがあります。削除しますか？`)) {
                    // キャンセルの場合、入力フィールドを元の値に戻す
                    barCountInput.value = BARS;
                    return;
                }
                
                // 範囲外のノートを削除
                notes = notes.filter(note => note.startBeat < maxBeat);
            }
        }
        
        // 小節数を更新
        BARS = newBarCount;
        
        // UIを更新
        updateBarCount();
        
        // 履歴に保存
        saveToHistory();
    }
    
    // 小節数変更に伴うUI更新
    function updateBarCount() {
        // グリッド幅を更新
        gridEl.style.width = `${BARS * BEATS_PER_BAR * CELL_WIDTH}px`;
        
        // 小節線と拍線を再描画
        drawGridLines();
        
        // 小節番号を再描画
        renderBarNumbers();
        
        // ノートを再描画
        renderNotes();
    }
// USTファイルとして保存する関数（Shift_JIS版をAPI経由でDL）
function saveUST() {
    // USTコンテンツを生成
    let ustContent = "";

    // バージョン情報
    ustContent += "[#VERSION]\nUST Version1.2\n";

    // 設定セクション
    ustContent += "[#SETTING]\n";
    ustContent += `Tempo=${tempo.toFixed(2)}\n`;
    ustContent += "Tracks=1\n";
    ustContent += "ProjectName=PianoRollProject\n";
    ustContent += "VoiceDir=%VOICE%uta\n";
    ustContent += "Tool1=wavtool.exe\n";
    ustContent += "Tool2=resampler.exe\n";
    ustContent += "Mode2=True\n";

    // ノートをソート
    const sortedNotes = [...notes].sort((a, b) => a.startBeat - b.startBeat);

    // 休符を追加するための処理
    const completedNotes = addRestNotes(sortedNotes);

    // 各ノートをUSTフォーマットに変換
    completedNotes.forEach((note, index) => {
        const prevNote = index > 0 ? completedNotes[index - 1] : null;
        const nextNote = index < completedNotes.length - 1 ? completedNotes[index + 1] : null;

        ustContent += `[#${String(index).padStart(4, '0')}]\n`;

        // 長さを変換（ビート→UST単位）
        const noteLength = Math.round(note.duration * 480);
        ustContent += `Length=${noteLength}\n`;

        // 歌詞
        ustContent += `Lyric=${note.lyric || 'R'}\n`;

        // MIDIノート番号
        const midiPitch = getMIDIPitch(note.noteIndex);
        ustContent += `NoteNum=${midiPitch}\n`;

        // 休符以外のノートのみ詳細パラメータを追加
        if (note.lyric !== 'R') {
            ustContent += "Intensity=100\n";
            ustContent += "Modulation=0\n";
            ustContent += "PBType=5\n";
            const pitchBend = calculatePitchBend(note, prevNote);
            ustContent += `PitchBend=${pitchBend}\n`;
            ustContent += "PBS=-33\n";
            ustContent += "PBW=66\n";
            ustContent += "PBStart=-40\n";
            if (nextNote && nextNote.lyric !== 'R') {
                ustContent += "Envelope=0,5,35,0,100,100,0\n";
            } else {
                ustContent += "Envelope=0,5,35,0,100,100,100,%,0\n";
            }
        }
    });

    // トラック終了
    ustContent += "[#TRACKEND]\n";

    // デバッグ出力
    console.log("生成されたUSTファイル内容:", ustContent);

    // 🔄 Render上のShift_JIS APIに送信
    const apiUrl = "https://utf2sj4ust.onrender.com/ust";
    fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "text/plain"
        },
        body: ustContent
    })
    .then(response => {
        if (!response.ok) throw new Error("変換APIでエラーが発生しました");
        return response.blob();
    })
    .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pianroll_export_shiftjis.ust";
        a.click();
        URL.revokeObjectURL(url);
    })
    .catch(error => {
        console.error("UST保存中にエラー:", error);
        alert("USTファイルの保存に失敗しました");
    });
}

    // 長押しタイマーを開始
    function startLongPressTimer(note, noteEl, event) {
        clearLongPressTimer(); // 既存のタイマーをクリア
        isLongPress = false;
        
        longPressTimer = setTimeout(function() {
            isLongPress = true;
            // 長押しで直接歌詞入力を表示
            showInlineLyricEditor(note, noteEl, event);
        }, 500); // 500ms（0.5秒）の長押しで歌詞入力を表示
    }
    
    // 長押しタイマーをクリア
    function clearLongPressTimer() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        // isLongPressはここではクリアしない
    }
    
    // インライン歌詞エディタを表示
    function showInlineLyricEditor(note, noteEl, event) {
        if (event) {
            event.preventDefault(); // デフォルトの長押しメニューを防止
            event.stopPropagation();
        }
        
        // 選択状態にする（再描画しない）
        selectedNote = note;
        
        // 既存のエディタがあれば削除
        removeInlineLyricEditor();
        
        // エディタコンテナ作成
        const editorContainer = document.createElement('div');
        editorContainer.className = 'inline-lyric-editor';
        editorContainer.style.left = `${noteEl.offsetWidth / 2 - 50}px`;
        
        // 入力フィールド作成
        const inputField = document.createElement('input');
        inputField.value = note.lyric || '';
        inputField.placeholder = '歌詞を入力';
        
        // エンターキーで適用
        inputField.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                applyLyrics(inputField.value, lyricInputMode === 'char');
                removeInlineLyricEditor();
                e.preventDefault();
            } else if (e.key === 'Escape') {
                removeInlineLyricEditor();
                e.preventDefault();
            }
        });
        
        // フィールド外クリックで適用
        inputField.addEventListener('blur', function() {
            applyLyrics(inputField.value, lyricInputMode === 'char');
            removeInlineLyricEditor();
        });
        
        editorContainer.appendChild(inputField);
        noteEl.appendChild(editorContainer);
        
        // フォーカスを設定
        inputField.focus();
        inputField.select();
        
        currentEditingNoteEl = noteEl;
        
        // 選択状態を視覚的に表示（クラスを直接追加）
        noteEl.classList.add('selected');
    }
    
    // インライン歌詞エディタを削除
    function removeInlineLyricEditor() {
        const editor = document.querySelector('.inline-lyric-editor');
        if (editor) {
            editor.remove();
        }
        currentEditingNoteEl = null;
    }
    
    // 歌詞入力モードを切り替え
    function toggleLyricInputMode() {
        if (lyricInputMode === 'punctuation') {
            lyricInputMode = 'char';
            lyricModeBtn.title = '1文字分配モード';
        } else {
            lyricInputMode = 'punctuation';
            lyricModeBtn.title = '句点分配モード';
        }
        
        // ボタンの見た目を更新
        updateLyricModeButton();
    }
    
    // 歌詞入力モードボタンの更新
    function updateLyricModeButton() {
        if (lyricInputMode === 'char') {
            lyricModeBtn.innerHTML = '<i>1️⃣</i>';
        } else {
            lyricModeBtn.innerHTML = '<i>🔤</i>';
        }
    }
    
    // 歌詞を適用
    function applyLyrics(lyricsText, isCharMode) {
        if (!selectedNote) return;
        
        if (isCharMode) {
            // 1文字分配モード: 歌詞を処理して1文字（または1モーラ）ずつ割り当て
            const processedChars = getProcessedChars(lyricsText);
            
            // 選択されたノートと続くノートを時間順にソート
            const sortedNotes = [...notes].sort((a, b) => a.startBeat - b.startBeat);
            
            // 選択されたノートのインデックスを取得
            const selectedIndex = sortedNotes.findIndex(note => note === selectedNote);
            if (selectedIndex === -1) return;
            
            // 各文字を適用
            processedChars.forEach((char, i) => {
                const targetIndex = selectedIndex + i;
                if (targetIndex < sortedNotes.length) {
                    sortedNotes[targetIndex].lyric = char;
                }
            });
        } else {
            // 句点分配モード: 「、」や「,」で歌詞を分割
            const lyricSegments = lyricsText.split(/[、,]/);
            
            // 選択されたノートと続くノートを時間順にソート
            const sortedNotes = [...notes].sort((a, b) => a.startBeat - b.startBeat);
            
            // 選択されたノートのインデックスを取得
            const selectedIndex = sortedNotes.findIndex(note => note === selectedNote);
            if (selectedIndex === -1) return;
            
            // 各セグメントを適用
            lyricSegments.forEach((segment, i) => {
                const targetIndex = selectedIndex + i;
                if (targetIndex < sortedNotes.length) {
                    // 小さい「ぁぃぅぇぉゃゅょっ」を考慮した歌詞の処理
                    sortedNotes[targetIndex].lyric = processLyric(segment.trim());
                }
            });
        }
        
        // 履歴に保存
        saveToHistory();
        
        // 再描画
        renderNotes();
    }
    
    // 歌詞を文字（モーラ）単位に分割して処理
    function getProcessedChars(text) {
        // 小さい仮名のパターン
        const smallKanaPattern = /[ぁぃぅぇぉゃゅょっァィゥェォャュョッ]/;
        const result = [];
        
        for (let i = 0; i < text.length; i++) {
            // カンマやピリオドは無視
            if (text[i] === '、' || text[i] === ',') continue;
            
            if (i + 1 < text.length && smallKanaPattern.test(text[i + 1])) {
                // 次の文字が小さい仮名の場合、一緒に追加
                result.push(text[i] + text[i + 1]);
                i++; // 次の文字はスキップ
            } else {
                // 通常の文字
                result.push(text[i]);
            }
        }
        
        return result;
    }
    
    // 歌詞を処理（小さい文字「ぁぃぅぇぉゃゅょっ」を前の文字とまとめる）
    function processLyric(lyric) {
        // 小さい仮名のパターン
        const smallKanaPattern = /[ぁぃぅぇぉゃゅょっァィゥェォャュョッ]/;
        
        let processedLyric = '';
        for (let i = 0; i < lyric.length; i++) {
            const char = lyric[i];
            
            // 現在の文字が小さい仮名かつ、前の文字が存在する場合
            if (smallKanaPattern.test(char) && i > 0) {
                // 前の文字と一緒にする（既に追加済みなので何もしない）
            } else {
                // 通常の文字、または小さい仮名だが先頭にある場合
                processedLyric += char;
                
                // 次の文字が小さい仮名なら、それも一緒に追加
                if (i + 1 < lyric.length && smallKanaPattern.test(lyric[i + 1])) {
                    processedLyric += lyric[i + 1];
                    i++; // 次の文字はスキップ
                }
            }
        }
        
        return processedLyric;
    }
    
    // 再生カーソルの初期化
    function initPlaybackCursor() {
        playbackCursorEl = document.createElement('div');
        playbackCursorEl.className = 'playback-cursor';
        playbackCursorEl.style.display = 'none';
        gridEl.appendChild(playbackCursorEl);
    }
    
    // 再生カーソルの更新
    function updatePlaybackCursor(beatPosition) {
        if (playbackCursorEl) {
            playbackCursorEl.style.left = `${beatPosition * CELL_WIDTH}px`;
            
            // 再生カーソルが見えるようにスクロール
            const cursorLeft = beatPosition * CELL_WIDTH;
            const viewportLeft = gridAreaEl.scrollLeft;
            const viewportRight = viewportLeft + gridAreaEl.clientWidth;
            
            // カーソルが画面外の場合はスクロール
            if (cursorLeft < viewportLeft || cursorLeft > viewportRight) {
                gridAreaEl.scrollLeft = cursorLeft - (gridAreaEl.clientWidth / 2);
            }
        }
    }
    
    // 再生開始
    function startPlayback() {
        if (!audioContext) initAudio();
        
        if (isPaused) {
            // 一時停止からの再開
            const elapsedBeats = currentPlaybackTime;
            const currentTime = audioContext.currentTime;
            
            playbackStartTime = currentTime - (elapsedBeats * (60 / tempo));
            isPaused = false;
        } else {
            // 新規再生
            if (isPlaying) {
                stopPlayback();
            }
            
            currentPlaybackTime = 0;
            playbackStartTime = audioContext.currentTime;
            scheduledNotes = {};
        }
        
        isPlaying = true;
        playbackCursorEl.style.display = 'block';
        
        // スケジューラー開始
        scheduleIntervalId = setInterval(scheduleNotes, 100);
        
        // アニメーションフレーム開始
        requestAnimationFrame(updatePlaybackAnimation);
        
        // ボタンの状態更新
        updatePlaybackButtons();
    }
    
    // 一時停止
    function pausePlayback() {
        if (!isPlaying) return;
        
        // 現在の再生位置を保存
        const currentTime = audioContext.currentTime;
        currentPlaybackTime = (currentTime - playbackStartTime) * (tempo / 60);
        
        // 再生を一時停止
        clearInterval(scheduleIntervalId);
        isPaused = true;
        isPlaying = false;
        
        // ボタンの状態更新
        updatePlaybackButtons();
    }
    
    // 停止
    function stopPlayback() {
        if (!isPlaying && !isPaused) return;
        
        // 再生を停止
        clearInterval(scheduleIntervalId);
        isPlaying = false;
        isPaused = false;
        currentPlaybackTime = 0;
        
        // 再生カーソルを非表示
        playbackCursorEl.style.display = 'none';
        
        // ボタンの状態更新
        updatePlaybackButtons();
    }
    
    // ノートのスケジュール
    function scheduleNotes() {
        if (!isPlaying) return;
        
        const currentTime = audioContext.currentTime;
        const elapsedBeats = (currentTime - playbackStartTime) * (tempo / 60);
        const endTime = elapsedBeats + lookaheadTime * (tempo / 60);
        
        // ソートされたノート配列
        const sortedNotes = [...notes].sort((a, b) => a.startBeat - b.startBeat);
        
        // 再生範囲内のノートをスケジュール
        for (let i = 0; i < sortedNotes.length; i++) {
            const note = sortedNotes[i];
            const noteStart = note.startBeat;
            const noteEnd = noteStart + note.duration;
            
            // スケジュール済みのノートはスキップ
            if (scheduledNotes[note.id]) continue;
            
            // 再生範囲内のノートをスケジュール
            if (noteStart >= elapsedBeats && noteStart < endTime) {
                const noteStartTime = playbackStartTime + (noteStart * 60 / tempo);
                const noteDuration = note.duration * 60 / tempo;
                
                // ノートの音を鳴らす
                playNoteAtTime(note.noteIndex, noteStartTime, noteDuration);
                
                // スケジュール済みとしてマーク
                scheduledNotes[note.id] = true;
            }
        }
        
        // 曲の終わりに達したら停止
        if (sortedNotes.length > 0) {
            const lastNote = sortedNotes[sortedNotes.length - 1];
            const lastBeat = lastNote.startBeat + lastNote.duration;
            
            if (elapsedBeats > lastBeat + 1) {
                stopPlayback();
            }
        }
    }
    
    // 再生アニメーションの更新
    function updatePlaybackAnimation() {
        if (!isPlaying) return;
        
        const currentTime = audioContext.currentTime;
        const elapsedBeats = (currentTime - playbackStartTime) * (tempo / 60);
        
        // 現在の再生位置を更新
        currentPlaybackTime = elapsedBeats;
        
        // 再生カーソルの位置を更新
        updatePlaybackCursor(elapsedBeats);
        
        // アニメーションフレームを更新
        requestAnimationFrame(updatePlaybackAnimation);
    }
    
    // 再生ボタンの状態を更新
    function updatePlaybackButtons() {
        playBtn.disabled = isPlaying;
        pauseBtn.disabled = !isPlaying;
        stopBtn.disabled = !isPlaying && !isPaused;
    }
    
    // ピンチズーム対応
    function setupPinchZoom() {
        let initialScale = 1;
        let currentScale = 1;
        let initialDistance = 0;
        let isZooming = false;
        
        // タッチ開始時の処理
        gridAreaEl.addEventListener('touchstart', function(e) {
            if (e.touches.length === 2) {
                // 2本指でのタッチ開始
                initialDistance = getDistance(e.touches[0], e.touches[1]);
                initialScale = currentScale;
                isZooming = true;
            }
        });
        
        // タッチ移動時の処理
        gridAreaEl.addEventListener('touchmove', function(e) {
            if (isZooming && e.touches.length === 2) {
                // ピンチ操作中
                const currentDistance = getDistance(e.touches[0], e.touches[1]);
                const scaleChange = currentDistance / initialDistance;
                
                // スケールを更新（0.5〜2.0の範囲に制限）
                currentScale = Math.min(Math.max(initialScale * scaleChange, 0.5), 2.0);
                
                // ズームの適用
                applyZoom(currentScale);
                
                // デフォルトのスクロール動作を防止
                e.preventDefault();
            }
        });
        
        // タッチ終了時の処理
        gridAreaEl.addEventListener('touchend', function(e) {
            if (e.touches.length < 2) {
                isZooming = false;
            }
        });
        
        // 2点間の距離を計算する関数
        function getDistance(touch1, touch2) {
            const dx = touch1.clientX - touch2.clientX;
            const dy = touch1.clientY - touch2.clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }
        
        // ズームを適用する関数
        function applyZoom(scale) {
            // セルの幅を調整
            const originalCellWidth = 80; // デフォルトの4分音符の幅
            const scaledCellWidth = originalCellWidth * scale;
            
            // ピアノロールのスケールを変更
            gridEl.style.transition = 'none';
            gridEl.style.width = `${BARS * BEATS_PER_BAR * scaledCellWidth}px`;
            
            // すべてのグリッド線とノートの位置を更新
            document.querySelectorAll('.bar-line, .beat-line, .grid-line').forEach(el => {
                const position = parseFloat(el.style.left) * scale / currentScale;
                el.style.left = `${position}px`;
            });
            
            // ノートの位置とサイズも更新
            document.querySelectorAll('.note').forEach(el => {
                const left = parseFloat(el.style.left) * scale / currentScale;
                const width = parseFloat(el.style.width) * scale / currentScale;
                el.style.left = `${left}px`;
                el.style.width = `${width}px`;
            });
            
            // 小節番号も更新
            document.querySelectorAll('.bar-number').forEach(el => {
                const left = parseFloat(el.style.left) * scale / currentScale;
                el.style.left = `${left}px`;
            });
            
            // グリッド再描画
            if (Math.abs(scale - currentScale) > 0.1) {
                drawGridLines();
                renderNotes();
            }
        }
    }
    
    // イベントリスナー設定
    function setupEventListeners() {
        // クリアボタン
        clearBtn.addEventListener('click', function() {
            if (notes.length === 0) return;
            
            notes = [];
            selectedNote = null;
            
            // 履歴に保存
            saveToHistory();
            
            renderNotes();
        });
        
        // トリプレット切り替え
        tripletCheckbox.addEventListener('change', function() {
            isTriplet = this.checked;
            drawGridLines();
        });
        
        // 元に戻す/やり直しのイベントリスナー
        undoBtn.addEventListener('click', handleUndo);
        redoBtn.addEventListener('click', handleRedo);
        
        // MIDI保存ボタン
        saveMidiBtn.addEventListener('click', saveMIDI);
        
        // ノート操作ボタン
        moveLeftBtn.addEventListener('click', () => moveNote('left'));
        moveRightBtn.addEventListener('click', () => moveNote('right'));
        moveUpBtn.addEventListener('click', () => moveNote('up'));
        moveDownBtn.addEventListener('click', () => moveNote('down'));
        shorterBtn.addEventListener('click', () => changeNoteDuration('shorter'));
        longerBtn.addEventListener('click', () => changeNoteDuration('longer'));
        
        // グリッドサイズボタン
        grid4thBtn.addEventListener('click', () => changeGridSize(1));
        grid8thBtn.addEventListener('click', () => changeGridSize(0.5));
        grid16thBtn.addEventListener('click', () => changeGridSize(0.25));
        grid32ndBtn.addEventListener('click', () => changeGridSize(0.125));
    }
    
    // 初期化
    function init() {
        generateGrid();
        renderPianoKeys();
        renderGrid();
        updateGridButtons();
        initPlaybackCursor();
        
        // 初期状態を履歴に保存
        saveToHistory();
        
        // ボタンの初期状態を設定
        updateUndoRedoButtons();
        updateLyricModeButton();
        
        // 小節数入力フィールドの初期化
        barCountInput.value = BARS;
        
        // 音テストボタンのイベントリスナー
        soundTestBtn.addEventListener('click', function() {
            if (!audioContext) initAudio();
            
            // C4を検索
            let c4Index = -1;
            grid.forEach((note, index) => {
                if (note.key === 'C' && note.octave === 4) {
                    c4Index = index;
                }
            });
            
            if (c4Index !== -1) {
                playNote(c4Index);
            }
        });
        
        // 音量スライダーのイベントリスナー
        volumeSlider.addEventListener('input', function() {
            const volumeValue = parseInt(this.value) / 100;
            setMasterVolume(volumeValue);
        });
        
        // テンポ入力のイベントリスナー
        tempoInput.addEventListener('input', function() {
            const newTempo = parseInt(this.value);
            if (!isNaN(newTempo) && newTempo >= 40 && newTempo <= 300) {
                tempo = newTempo;
            }
        });
        
        // 小節数入力フィールドのイベントリスナー
        barCountInput.addEventListener('change', function() {
            const newBarCount = parseInt(this.value);
            if (!isNaN(newBarCount) && newBarCount >= 1 && newBarCount <= 100) {
                changeBarCount(newBarCount);
            } else {
                // 無効な入力の場合、現在の値に戻す
                this.value = BARS;
            }
        });
        
        // 再生ボタンのイベントリスナー
        playBtn.addEventListener('click', startPlayback);
        
        // 一時停止ボタンのイベントリスナー
        pauseBtn.addEventListener('click', pausePlayback);
        
        // 停止ボタンのイベントリスナー
        stopBtn.addEventListener('click', stopPlayback);
        
        // 歌詞入力モード切替ボタンのイベントリスナー
        lyricModeBtn.addEventListener('click', toggleLyricInputMode);
        
        // イベントリスナーのセットアップ
        setupEventListeners();
        
        // オーディオの初期化（ユーザージェスチャーが必要なため遅延）
        document.addEventListener('click', function initOnFirstClick() {
            initAudio();
            document.removeEventListener('click', initOnFirstClick);
        }, { once: true });
        
        // ピンチズーム対応
        setupPinchZoom();
        
        // グリッド外クリックで歌詞エディタを閉じる
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.inline-lyric-editor') && !e.target.closest('.note')) {
                removeInlineLyricEditor();
            }
        });
        
        // ダブルタップによるズームを防止しつつタップ機能を維持
        let lastTapTime = 0;
        gridAreaEl.addEventListener('touchstart', function(e) {
            if (e.target.closest('.note')) {
                // ノート上のタッチはノート自身で処理するのでスキップ
                return;
            }
            
            const now = new Date().getTime();
            const timeSince = now - lastTapTime;
            
            if (timeSince < 300 && timeSince > 0) {
                // ダブルタップと判断された場合のみキャンセル
                e.preventDefault();
            }
            
            lastTapTime = now;
        }, { passive: false });
        
        // タッチイベントの即時実行を確保
        document.addEventListener('touchstart', function() {}, {passive: false});
    }
    
    // 実行
    init();
});