// Basit durumlar
const state = {
    minDist: 20,
    maxDist: 220,
    vol: 0,
    beatVol: 0,
    smoothAlpha: 0.35,
    smoothVol: null,
    smoothBeatVol: null,
    lastSet: 0,
    lastSetBeat: 0,
    setIntervalMs: 100, // 10Hz
    mode: 'page', // 'page' | 'system' (çıktının nereye gideceği)
    pageTarget: 'audio', // 'audio' | 'yt'
    bridge: { available: false, base: 'http://127.0.0.1:52789' },
    yt: { apiReady: false, ready: false },
    selected: { main: false, beat: false },
    leadMs: 10,
    currentName: '',
};

// leadMs: Vocal-beat başlangıç farkı (ms). ROTA=-10, MERMER=10, TAK3=12, SNAP=-10

const els = {
    startBtn: document.getElementById('startBtn'),
    bridgeStatus: document.getElementById('bridgeStatus'),
    modeStatus: document.getElementById('modeStatus'),
    video: document.getElementById('video'),
    overlay: document.getElementById('overlay'),
    volFill: document.getElementById('volFill'),
    volText: document.getElementById('volText'),
    beatFill: document.getElementById('beatFill'),
    beatText: document.getElementById('beatText'),
    distTextR: document.getElementById('distTextR'),
    distTextL: document.getElementById('distTextL'),
    testAudio: document.getElementById('testAudio'),
    beatAudio: document.getElementById('beatAudio'),
    fileInput: document.getElementById('fileInput'),
    fileName: document.getElementById('fileName'),
    beatFileInput: document.getElementById('beatFileInput'),
    beatFileName: document.getElementById('beatFileName'),
    ytUrlInput: document.getElementById('ytUrlInput'),
    ytLoadBtn: document.getElementById('ytLoadBtn'),
    ytWrap: document.getElementById('ytWrap'),
    playBothBtn: document.getElementById('playBothBtn'),
    bothHint: document.getElementById('bothHint'),
    mainPreset: document.getElementById('mainPreset'),
    beatPreset: document.getElementById('beatPreset'),
    songModal: document.getElementById('songModal'),
    mainPresetWrap: document.getElementById('mainPresetWrap'),
    beatPresetWrap: document.getElementById('beatPresetWrap'),
    beatFileWrap: document.getElementById('beatFileWrap'),
    bothControls: document.getElementById('bothControls'),
    singlePickerWrap: document.getElementById('singlePickerWrap'),
    mainTag: document.getElementById('mainTag'),
    beatTag: document.getElementById('beatTag'),
};

const ctx = els.overlay.getContext('2d');

// Tema yönetimi
const THEME_KEY = 'theme';
function applyTheme(mode) {
    const dark = mode === 'dark';
    document.body.classList.toggle('theme-dark', dark);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = dark ? 'Light Mode' : 'Night Mode';
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);
    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.addEventListener('click', () => {
            const current = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            localStorage.setItem(THEME_KEY, next);
            applyTheme(next);
        });
    }
}
initTheme();

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function closeSongModal() {
    try {
        if (els.songModal) {
            els.songModal.hidden = true;
            els.songModal.style.display = 'none';
            // Tamamen kaldır: etkileşimi engellemesin
            els.songModal.remove();
            els.songModal = null;
        }
    } catch (_) { /* yoksay */ }
}

// Preset tanımları: yeni parçaları buraya ekle
const PRESETS = {
    ROTA: { vocal: 'music/rota-vocal.mp3', beat: 'music/rota-beat.mp3', leadMs: 45 },
    MERMER: { vocal: 'music/mermer-vocal.mp3', beat: 'music/mermer-beat.mp3', leadMs: 30 },
    TAK3: { vocal: 'music/tak-tak-tak-vocal.mp3', beat: 'music/tak-tak-tak-beat.mp3', leadMs: 30 },
    SNAP: { vocal: 'music/snap-vocal.mp3', beat: 'music/snap-beat.mp3', leadMs: -40 },
    LUTHER: { vocal: 'music/luther-vocal.mp3', beat: 'music/luther-beat.mp3', leadMs: 30 },
    SPRINTER: { vocal: 'music/sprinter-vocal.mp3', beat: 'music/sprinter-beat.mp3', leadMs: 30 },
    DUNYA_FANI: { vocal: 'music/dunya-fani-vocal.mp3', beat: 'music/dunya-fani-beat.mp3', leadMs: 30 },
    ESPRESSO: { vocal: 'music/espresso-vocal.mp3', beat: 'music/espresso-beat.mp3', leadMs: 9 },
};

function populatePresetSelects() {
    try {
        if (els.mainPreset) {
            while (els.mainPreset.options.length > 1) els.mainPreset.remove(1);
            Object.entries(PRESETS).forEach(([key, p]) => {
                const opt = document.createElement('option');
                opt.value = p.vocal; opt.textContent = `${key} Vocal`;
                els.mainPreset.appendChild(opt);
            });
        }
        if (els.beatPreset) {
            while (els.beatPreset.options.length > 1) els.beatPreset.remove(1);
            Object.entries(PRESETS).forEach(([key, p]) => {
                const opt = document.createElement('option');
                opt.value = p.beat; opt.textContent = `${key} Beat`;
                els.beatPreset.appendChild(opt);
            });
        }
    } catch (_) { /* yoksay */ }
}

function applyPresetKey(key) {
    const p = PRESETS[key];
    if (!p) return;
    try { if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; } } catch (_) { }
    try { if (currentBeatUrl) { URL.revokeObjectURL(currentBeatUrl); currentBeatUrl = null; } } catch (_) { }
    els.testAudio.src = p.vocal;
    els.beatAudio.src = p.beat;
    try { els.testAudio.load(); } catch (_) { }
    try { els.beatAudio.load(); } catch (_) { }
    if (els.mainPreset) els.mainPreset.value = p.vocal;
    if (els.beatPreset) els.beatPreset.value = p.beat;
    state.currentName = prettyNameFromKey(key);
    updateChosenTags();
    state.pageTarget = 'audio';
    state.selected.main = true;
    state.selected.beat = true;
    if (typeof p.leadMs === 'number') state.leadMs = p.leadMs;
    updatePlayBothState();
    closeSongModal();
    enterSimpleSelectionMode();
    autoStartPlayback();
}

function showSongModal() {
    if (!els.songModal) return;
    els.songModal.hidden = false;
    const btns = els.songModal.querySelectorAll('.btn-preset[data-preset]');
    btns.forEach(btn => btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-preset');
        applyPresetKey(key);
    }, { once: true }));
    // Dışarı tıklayınca veya ESC ile kapat
    const onBackdrop = (e) => { if (e.target === els.songModal) closeSongModal(); };
    const onEsc = (e) => { if (e.key === 'Escape') closeSongModal(); };
    els.songModal.addEventListener('click', onBackdrop, { once: true });
    window.addEventListener('keydown', onEsc, { once: true });
}

async function probeBridge() {
    try {
        const r = await fetch(`${state.bridge.base}/ping`, { method: 'GET', cache: 'no-store' });
        if (r.ok) {
            state.bridge.available = true;
            state.mode = 'system';
        } else {
            state.bridge.available = false; state.mode = 'page';
        }
    } catch (_) {
        state.bridge.available = false; state.mode = 'page';
    }
    els.bridgeStatus.textContent = `Köprü: ${state.bridge.available ? 'Var' : 'Yok'}`;
    els.modeStatus.textContent = `Mod: ${state.mode === 'system' ? 'Sistem Sesi' : 'Sayfa Sesi'}`;
}

async function setSystemVolume(pct) {
    try {
        await fetch(`${state.bridge.base}/set-volume?p=${pct}`, { method: 'POST' });
    } catch (_) { /* yoksay */ }
}

function setMainPageVolume(pct) {
    const v = clamp(pct, 0, 100) / 100;
    if (state.pageTarget === 'yt' && window.ytPlayer && state.yt.ready) {
        // YouTube API 0..100 bekler
        window.ytPlayer.setVolume(Math.round(clamp(pct, 0, 100)));
    } else {
        els.testAudio.volume = v;
    }
}

function setBeatPageVolume(pct) {
    const v = clamp(pct, 0, 100) / 100;
    els.beatAudio.volume = v;
}

function updateMainUI(pct, distR) {
    els.volFill.style.height = `${clamp(pct, 0, 100)}%`;
    els.volText.textContent = `Ana Ses: ${Math.round(clamp(pct, 0, 100))}%`;
    const el = els.distTextR; if (el) el.textContent = `R dist: ${distR != null ? distR.toFixed(1) : '-'}`;
}

function updateBeatUI(pct, distL) {
    if (els.beatFill) els.beatFill.style.height = `${clamp(pct, 0, 100)}%`;
    if (els.beatText) els.beatText.textContent = `Beat: ${Math.round(clamp(pct, 0, 100))}%`;
    const el = els.distTextL; if (el) el.textContent = `L dist: ${distL != null ? distL.toFixed(1) : '-'}`;
}

function updatePlayBothState() {
    const mainReady = state.selected.main || (state.pageTarget === 'yt' && state.yt.ready);
    const beatReady = state.selected.beat;
    const enabled = mainReady && beatReady;
    if (els.playBothBtn) els.playBothBtn.disabled = !enabled;
    if (els.bothHint) els.bothHint.textContent = enabled ? 'Hazır. Başlat’a tıklayın.' : 'Önce iki dosyayı da seçin.';
}

// HTML içinde varsayılan kaynaklar varsa seçili kabul et
function initDefaultsFromHtml() {
    try {
        const mainSrc = (els.testAudio?.querySelector('source')?.getAttribute('src')) || els.testAudio?.getAttribute('src');
        if (mainSrc) {
            state.pageTarget = 'audio';
            state.selected.main = true;
            const nm = guessNameFromJoined(mainSrc);
            if (nm) state.currentName = nm;
        }
        const beatSrc = (els.beatAudio?.querySelector('source')?.getAttribute('src')) || els.beatAudio?.getAttribute('src');
        if (beatSrc) {
            state.selected.beat = true;
            const nm2 = guessNameFromJoined(beatSrc);
            if (!state.currentName && nm2) state.currentName = nm2;
        }
    } catch (_) { /* yoksay */ }
    updateChosenTags();
    updatePlayBothState();
}

// Sayfa yüklendiğinde varsayılanları uygula
populatePresetSelects();
initDefaultsFromHtml();
// Açılışta sor: ROTA mı MERMER mi?
showSongModal();

// Yardımcılar: tek şarkı seçen bir arayüzde geri kalan unsurları gizle
function enterSimpleSelectionMode() {
    try {
        if (els.mainPresetWrap) els.mainPresetWrap.hidden = true;
        if (els.beatPresetWrap) els.beatPresetWrap.hidden = true;
        if (els.beatFileWrap) els.beatFileWrap.hidden = true;
        if (els.bothControls) els.bothControls.hidden = true;
    } catch (_) { }
}

function assignFilesByName(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    let beatSet = false, vocalSet = false;
    const names = [];
    for (const f of files) {
        const name = (f.name || '').toLowerCase();
        names.push(f.name);
        const url = URL.createObjectURL(f);
        if (name.includes('beat')) {
            if (currentBeatUrl) try { URL.revokeObjectURL(currentBeatUrl); } catch (_) { }
            currentBeatUrl = url;
            els.beatAudio.src = currentBeatUrl;
            state.selected.beat = true;
            beatSet = true;
        } else if (name.includes('vocal')) {
            if (currentObjectUrl) try { URL.revokeObjectURL(currentObjectUrl); } catch (_) { }
            currentObjectUrl = url;
            state.pageTarget = 'audio';
            els.testAudio.src = currentObjectUrl;
            state.selected.main = true;
            vocalSet = true;
        } else {
            // Belirsiz: eğer vocal boşsa ana parçaya, değilse beat'e ata
            if (!vocalSet) {
                if (currentObjectUrl) try { URL.revokeObjectURL(currentObjectUrl); } catch (_) { }
                currentObjectUrl = url;
                els.testAudio.src = currentObjectUrl;
                state.selected.main = true;
                vocalSet = true;
            } else if (!beatSet) {
                if (currentBeatUrl) try { URL.revokeObjectURL(currentBeatUrl); } catch (_) { }
                currentBeatUrl = url;
                els.beatAudio.src = currentBeatUrl;
                state.selected.beat = true;
                beatSet = true;
            } else {
                // ikisi de dolu ise, ana parçayı değiştir
                try { URL.revokeObjectURL(currentObjectUrl); } catch (_) { }
                currentObjectUrl = url;
                els.testAudio.src = currentObjectUrl;
            }
        }
    }
    // İsimden şarkı adı tahmini
    const joined = names.map(n => (n || '').toLowerCase()).join(' ');
    const nm = guessNameFromJoined(joined) || (names[0] ? (names[0] + '').replace(/\.[^.]+$/, '').replace(/[\-_]+/g, ' ').trim() : '');
    if (nm) state.currentName = nm.toUpperCase();
    // İsimlerden preset gecikmesini belirle
    try {
        if (joined.includes('rota')) state.leadMs = -10;
        else if (joined.includes('mermer')) state.leadMs = 10;
        else if (joined.includes('tak-tak-tak') || joined.includes('taktaktak') || joined.includes('tak tak tak')) state.leadMs = 12;
        else if (joined.includes('snap') || joined.includes('snao')) state.leadMs = -10;
        else if (joined.includes('sprinter')) state.leadMs = 0;
        else if (joined.includes('dünya fani') || joined.includes('dunya fani') || (joined.includes('dünya') && joined.includes('fani')) || (joined.includes('dunya') && joined.includes('fani'))) state.leadMs = 0;
        else if (joined.includes('espresso')) state.leadMs = 0;
    } catch (_) { }
    updatePlayBothState();
    updateChosenTags();
}

function autoStartPlayback() {
    // Başlangıç senaryosu: YouTube yok, yerel/ağ sesleri. Negatif lead destekli.
    const lead = Number(state.leadMs) || 0;
    const d = Math.abs(lead);
    try {
        if (lead >= 0) {
            try { els.testAudio.currentTime = lead / 1000; } catch (_) { }
            if (state.selected.main) { try { els.testAudio.play(); } catch (_) { } }
            if (state.selected.beat) { setTimeout(() => { try { els.beatAudio.play(); } catch (_) { } }, lead); }
        } else {
            try { els.beatAudio.currentTime = d / 1000; } catch (_) { }
            if (state.selected.beat) { try { els.beatAudio.play(); } catch (_) { } }
            if (state.selected.main) { setTimeout(() => { try { els.testAudio.play(); } catch (_) { } }, d); }
        }
    } catch (_) { }
}

// Tek girişten (fileInput) çoklu seçimi isimden ayır, UI'yi basitleştir ve otomatik başlat
els.fileInput?.addEventListener('change', (e) => {
    const files = e.target.files;
    assignFilesByName(files);
    enterSimpleSelectionMode();
    autoStartPlayback();
    closeSongModal();
    updateChosenTags();
});

// Sadece şarkı adı görünsün; adı tıklayınca dosya seçtir
els.fileName?.addEventListener('click', () => { try { els.fileInput?.click(); } catch (_) { } });

// Hazır şarkı/beat seçimi (preset) değiştiğinde kaynakları bağla
els.mainPreset?.addEventListener('change', (e) => {
    const src = e.target.value;
    if (!src) return;
    try { if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; } } catch (_) { }
    els.testAudio.src = src;
    try { els.testAudio.load(); } catch (_) { }
    state.pageTarget = 'audio';
    state.selected.main = true;
    const nm = guessNameFromJoined(src); if (nm) state.currentName = nm;
    updateChosenTags();
    // lead belirle
    const low = (src || '').toLowerCase();
    if (low.includes('rota')) state.leadMs = -10;
    else if (low.includes('mermer')) state.leadMs = 10;
    else if (low.includes('tak-tak-tak') || low.includes('taktaktak') || low.includes('tak tak tak')) state.leadMs = 12;
    else if (low.includes('snap') || low.includes('snao')) state.leadMs = -10;
    else if (low.includes('sprinter')) state.leadMs = 0;
    else if (low.includes('dünya fani') || low.includes('dunya fani') || (low.includes('dünya') && low.includes('fani')) || (low.includes('dunya') && low.includes('fani'))) state.leadMs = 0;
    else if (low.includes('espresso')) state.leadMs = 0;
    updatePlayBothState();
    closeSongModal();
});

els.beatPreset?.addEventListener('change', (e) => {
    const src = e.target.value;
    if (!src) return;
    try { if (currentBeatUrl) { URL.revokeObjectURL(currentBeatUrl); currentBeatUrl = null; } } catch (_) { }
    els.beatAudio.src = src;
    try { els.beatAudio.load(); } catch (_) { }
    state.selected.beat = true;
    const nm = guessNameFromJoined(src); if (nm) state.currentName = nm;
    updateChosenTags();
    // lead belirle (beat kaynağına göre de tahmin et)
    const low = (src || '').toLowerCase();
    if (low.includes('rota')) state.leadMs = -10;
    else if (low.includes('mermer')) state.leadMs = 10;
    else if (low.includes('tak-tak-tak') || low.includes('taktaktak') || low.includes('tak tak tak')) state.leadMs = 12;
    else if (low.includes('snap') || low.includes('snao')) state.leadMs = -10;
    else if (low.includes('sprinter')) state.leadMs = 0;
    else if (low.includes('dünya fani') || low.includes('dunya fani') || (low.includes('dünya') && low.includes('fani')) || (low.includes('dunya') && low.includes('fani'))) state.leadMs = 0;
    else if (low.includes('espresso')) state.leadMs = 0;
    updatePlayBothState();
    closeSongModal();
});

function drawHand(points, colorLine, colorDot) {
    const [x4, y4, x8, y8] = points;
    ctx.lineWidth = 2;
    ctx.strokeStyle = colorLine;
    ctx.fillStyle = colorDot;
    ctx.beginPath(); ctx.moveTo(x4, y4); ctx.lineTo(x8, y8); ctx.stroke();
    ctx.beginPath(); ctx.arc(x4, y4, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x8, y8, 6, 0, Math.PI * 2); ctx.fill();
}

function mapDistanceToVolume(d) {
    const clamped = clamp(d, state.minDist, state.maxDist);
    const t = (clamped - state.minDist) / (state.maxDist - state.minDist);
    return clamp(Math.round(t * 100), 0, 100);
}

// MediaPipe Hands kurulumu
let hands, camera;
function initHands() {
    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
    });
    hands.onResults(onResults);
}

let lastDistR = null, lastDistL = null;
function onResults(results) {
    const video = els.video;
    const width = video.videoWidth;
    const height = video.videoHeight;
    els.overlay.width = width;
    els.overlay.height = height;

    let distR = null, distL = null;
    ctx.clearRect(0, 0, width, height);
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handsLm = results.multiHandLandmarks;
        const handsHd = results.multiHandedness || [];
        for (let i = 0; i < handsLm.length; i++) {
            const lm = handsLm[i];
            const hd = handsHd[i];
            const label = hd && hd.label ? hd.label : null; // 'Left' | 'Right'
            const p4 = lm[4];
            const p8 = lm[8];
            const x4 = Math.round(p4.x * width), y4 = Math.round(p4.y * height);
            const x8 = Math.round(p8.x * width), y8 = Math.round(p8.y * height);
            const d = Math.hypot(x8 - x4, y8 - y4);
            if (label === 'Right') {
                distR = d; lastDistR = d; drawHand([x4, y4, x8, y8], '#00d084', '#37ff93');
            } else if (label === 'Left') {
                distL = d; lastDistL = d; drawHand([x4, y4, x8, y8], '#2a85ff', '#6fb3ff');
            } else {
                distR = d; lastDistR = d; drawHand([x4, y4, x8, y8], '#00d084', '#37ff93');
            }
        }
    }

    const now = performance.now();
    if (distR != null) {
        const target = mapDistanceToVolume(distR);
        if (state.smoothVol == null) state.smoothVol = target;
        else state.smoothVol = lerp(state.smoothVol, target, state.smoothAlpha);
        state.vol = Math.round(state.smoothVol);
        if (now - state.lastSet > state.setIntervalMs) {
            if (state.mode === 'system' && state.bridge.available) setSystemVolume(state.vol);
            else setMainPageVolume(state.vol);
            state.lastSet = now;
        }
    }

    if (distL != null) {
        const targetB = mapDistanceToVolume(distL);
        if (state.smoothBeatVol == null) state.smoothBeatVol = targetB;
        else state.smoothBeatVol = lerp(state.smoothBeatVol, targetB, state.smoothAlpha);
        state.beatVol = Math.round(state.smoothBeatVol);
        if (now - state.lastSetBeat > state.setIntervalMs) {
            setBeatPageVolume(state.beatVol);
            state.lastSetBeat = now;
        }
    }

    updateMainUI(state.vol, distR);
    updateBeatUI(state.beatVol, distL);
}

els.startBtn.addEventListener('click', async () => {
    els.startBtn.disabled = true;
    // Köprü var mı bak
    await probeBridge();
    initHands();
    camera = new Camera(els.video, {
        onFrame: async () => { await hands.send({ image: els.video }); },
        width: 1280, height: 720,
    });
    camera.start();

    // Autoplay kısıtları için audio başlatmayı tetikle
    // Sesleri kamera başlatırken otomatik oynatmıyoruz
});

// Klavye ile kalibrasyon
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    // c: o anki mesafeyi min kabul et; v: max
    const d = (typeof lastDistR === 'number') ? lastDistR : lastDistL;
    if (k === 'c' && d != null) state.minDist = d;
    if (k === 'v' && d != null) state.maxDist = d;
});


// YouTube IFrame API hazır olduğunda çağrılır
window.onYouTubeIframeAPIReady = function () {
    state.yt.apiReady = true;
};

function parseYouTubeId(url) {
    try {
        const u = new URL(url);
        if (u.hostname === 'youtu.be') return u.pathname.slice(1);
        if (u.hostname.includes('youtube.com')) {
            if (u.pathname.startsWith('/watch')) return u.searchParams.get('v');
            if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2];
        }
    } catch (_) { /* boş */ }
    return null;
}

function loadYouTube(videoId) {
    if (!state.yt.apiReady) {
        alert('YouTube API yüklenemedi. İnternet bağlantısını kontrol edin.');
        return;
    }
    els.ytWrap.hidden = false;
    if (window.ytPlayer) {
        window.ytPlayer.loadVideoById(videoId);
    } else {
        window.ytPlayer = new YT.Player('ytPlayer', {
            width: '100%', height: '100%',
            videoId,
            playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
            events: {
                onReady: () => { state.yt.ready = true; if (!state.selected.main) state.selected.main = true; updatePlayBothState(); },
                onStateChange: () => { },
            }
        });
    }
    state.pageTarget = 'yt';
    if (!state.selected.main) state.selected.main = true;
    updatePlayBothState();
}

els.ytLoadBtn.addEventListener('click', () => {
    const url = els.ytUrlInput.value.trim();
    const id = parseYouTubeId(url);
    if (!id) { alert('Geçerli bir YouTube bağlantısı girin.'); return; }
    loadYouTube(id);
});

// Yerel dosya seçimi (Downloads vb.)
let currentObjectUrl = null;

let currentBeatUrl = null;

// Her iki sesi birden başlat
els.playBothBtn?.addEventListener('click', async () => {
    // Baştan başlatmak için zamanları sıfırla
    try { els.testAudio.currentTime = 0; } catch (_) { }
    try { els.beatAudio.currentTime = 0; } catch (_) { }

    const tasks = [];
    if (state.pageTarget === 'yt' && window.ytPlayer && state.yt.ready) {
        // YouTube ana parça: lead >=0 ise YT önce; <0 ise beat önce
        const lead = Number(state.leadMs) || 0;
        const d = Math.abs(lead);
        if (lead >= 0) {
            try { window.ytPlayer.seekTo(0, true); window.ytPlayer.unMute(); window.ytPlayer.playVideo(); } catch (_) { }
            setTimeout(() => { try { els.beatAudio.play(); } catch (_) { } }, d);
        } else {
            try { els.beatAudio.currentTime = d / 1000; } catch (_) { }
            try { els.beatAudio.play(); } catch (_) { }
            setTimeout(() => {
                try { window.ytPlayer.seekTo(0, true); window.ytPlayer.unMute(); window.ytPlayer.playVideo(); } catch (_) { }
            }, d);
        }
    } else {
        // Yerel ana parça: negatif lead destekli
        const lead = Number(state.leadMs) || 0; const d = Math.abs(lead);
        if (lead >= 0) {
            try { els.testAudio.currentTime = d / 1000; } catch (_) { }
            tasks.push(els.testAudio.play());
            setTimeout(() => { try { els.beatAudio.play(); } catch (_) { } }, d);
        } else {
            try { els.beatAudio.currentTime = d / 1000; } catch (_) { }
            try { els.beatAudio.play(); } catch (_) { }
            setTimeout(() => { try { els.testAudio.play(); } catch (_) { } }, d);
        }
    }
    try { await Promise.allSettled(tasks); } catch (_) { }
});
function prettyNameFromKey(key) {
    const map = {
        ROTA: 'ROTA', MERMER: 'MERMER', TAK3: 'TAK TAK TAK', SNAP: 'SNAP',
        LUTHER: 'LUTHER', SPRINTER: 'SPRINTER', DUNYA_FANI: 'DÜNYA FANİ', ESPRESSO: 'ESPRESSO'
    };
    return map[key] || key || '';
}

function guessNameFromJoined(joined) {
    const j = (joined || '').toLowerCase();
    if (j.includes('rota')) return 'ROTA';
    if (j.includes('mermer')) return 'MERMER';
    if (j.includes('tak-tak-tak') || j.includes('taktaktak') || j.includes('tak tak tak')) return 'TAK TAK TAK';
    if (j.includes('snap') || j.includes('snao')) return 'SNAP';
    if (j.includes('luther')) return 'LUTHER';
    if (j.includes('sprinter')) return 'SPRINTER';
    if (j.includes('dünya fani') || j.includes('dunya fani') || (j.includes('dünya') && j.includes('fani')) || (j.includes('dunya') && j.includes('fani'))) return 'DÜNYA FANİ';
    if (j.includes('espresso')) return 'ESPRESSO';
    return '';
}

function updateChosenTags() {
    const name = state.currentName || '';
    if (els.fileName && name) els.fileName.textContent = name;
    if (els.mainTag) els.mainTag.textContent = state.selected.main && name ? `${name} + vocal` : '-';
    if (els.beatTag) els.beatTag.textContent = state.selected.beat && name ? `${name} + beat` : '-';
}
