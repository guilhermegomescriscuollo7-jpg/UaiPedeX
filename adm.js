// ==========================================
// CONFIGURAÇÃO SUPABASE
// ==========================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = 'https://mvhqsiyalupodrtsfncj.supabase.co';
const supabaseKey = 'sb_publishable_K_tmqPg95RJlCCzwRZln4Q_kmfrUw0G'; 

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// VARIÁVEIS GLOBAIS E ESTADOS
// ==========================================
let allStores = []; let allDrivers = []; let globalBanners = []; let globalSponsors = []; let globalCities = [];
let globalUsers = []; let globalCoupons = []; let globalAlerts = [];
let storeImgBase64 = ''; let bannerImgBase64 = ''; let sponsorImgBase64 = '';
let editingStoreId = null; let editingDriverId = null;
let allOrders = [];

const formatBRL = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Função auxiliar para gerar IDs aleatórios (estilo Firebase) para novos registos
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// ==========================================
// 🟢 SISTEMA DE LOGIN VIA SESSÃO
// ==========================================
window.onload = () => {
    const isAdminLogged = sessionStorage.getItem('adminAuth');
    if(isAdminLogged === 'true') {
        document.getElementById('app-screen').style.display = 'flex';
        // Inicia o carregamento de todos os dados do Supabase
        loadAllData();
    } else {
        window.location.href = 'loginadm.html';
    }
};

window.logoutAdmin = () => {
    if(confirm("Deseja sair do painel administrativo?")) {
        sessionStorage.removeItem('adminAuth');
        window.location.href = 'loginadm.html';
    }
};

// ==========================================
// 🟢 CONTROLO DE MENU MOBILE E UTILITÁRIOS
// ==========================================
window.toggleSidebar = () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('active');
};

window.switchTab = (tabId, el) => {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    el.classList.add('active');
    
    if (window.innerWidth <= 850) {
        window.toggleSidebar();
    }
};

function resizeAndCompressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width; let height = img.height;
            const MAX_WIDTH = 800; 
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ==========================================
// CARREGADOR CENTRAL (Substitui os onSnapshots do Firebase)
// ==========================================
async function loadAllData() {
    await fetchCities();
    await fetchStores();
    await fetchUsers();
    await fetchCoupons();
    await fetchDrivers();
    await fetchBanners();
    await fetchSponsors();
    await fetchAlerts();
    await fetchOrders();
    await fetchSettingsAudio();
    await fetchSettingsVideo();
}

// ==========================================
// 1. ÁUDIO DE NOTIFICAÇÃO (global_settings)
// ==========================================
let alertAudioBase64 = '';

document.getElementById('audio-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 800000) { 
            alert("O ficheiro é muito grande! Escolha um áudio menor que 800KB.");
            this.value = ''; return;
        }
        const reader = new FileReader();
        reader.onload = function(evt) { alertAudioBase64 = evt.target.result; };
        reader.readAsDataURL(file);
    }
});

async function fetchSettingsAudio() {
    const { data, error } = await supabase.from('global_settings').select('*').eq('id', 'notification_audio').single();
    const container = document.getElementById('current-audio-container');
    if (data && data.audioData) {
        container.innerHTML = `
            <audio controls style="width: 100%; border-radius: 8px; margin-bottom: 15px; outline: none; background: #f9f9f9;">
                <source src="${data.audioData}">
                O seu navegador não suporta áudio.
            </audio>
            <button class="btn-del" onclick="window.deleteAudioAlert()" style="width: 100%; justify-content: center;">Restaurar Som Padrão</button>
        `;
    } else {
        container.innerHTML = '<p style="color:#999; font-size:0.9rem;">Nenhum áudio personalizado. Som padrão ativo.</p>';
    }
}

window.saveAudioAlert = async () => {
    if (!alertAudioBase64) return alert("Selecione um ficheiro de áudio primeiro.");
    const { error } = await supabase.from('global_settings').upsert({ id: 'notification_audio', audioData: alertAudioBase64, updatedAt: Date.now() });
    if (error) alert("Erro ao guardar áudio: " + error.message);
    else {
        alert("Áudio de notificação guardado com sucesso!");
        document.getElementById('audio-file').value = '';
        alertAudioBase64 = '';
        fetchSettingsAudio();
    }
};

window.deleteAudioAlert = async () => {
    if(confirm("Remover áudio personalizado e voltar para o padrão?")) {
        await supabase.from('global_settings').delete().eq('id', 'notification_audio');
        alert("Áudio restaurado!"); fetchSettingsAudio();
    }
};

// ==========================================
// 2. VÍDEO SPLASH SCREEN (global_settings)
// ==========================================
let splashVideoBase64 = '';

document.getElementById('splash-video-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 10000000) { 
            alert("O ficheiro excede o limite de 10MB! Use um Link Externo.");
            this.value = ''; return;
        }
        const reader = new FileReader();
        reader.onload = function(evt) { splashVideoBase64 = evt.target.result; };
        reader.readAsDataURL(file);
    }
});

async function fetchSettingsVideo() {
    const { data, error } = await supabase.from('global_settings').select('*').eq('id', 'splash_video').single();
    const container = document.getElementById('current-splash-container');
    if (data && data.videoData) {
        container.innerHTML = `
            <video controls autoplay muted loop style="width: 100%; max-width: 250px; border-radius: 12px; margin-bottom: 15px; background: #000; border: 1px solid #eee;">
                <source src="${data.videoData}">
                O seu navegador não suporta vídeo.
            </video>
            <button class="btn-del" onclick="window.deleteSplashVideo()" style="width: 100%; justify-content: center;">Remover Vídeo e Usar Padrão</button>
        `;
    } else {
        container.innerHTML = '<p style="color:#999; font-size:0.9rem;">Nenhum vídeo personalizado. Animação padrão ativa.</p>';
    }
}

window.saveSplashVideo = async () => {
    const urlInput = document.getElementById('splash-video-url').value.trim();
    const finalVideo = urlInput ? urlInput : splashVideoBase64;
    
    if (!finalVideo) return alert("Carregue um vídeo MP4 ou insira um link externo válido.");
    
    const { error } = await supabase.from('global_settings').upsert({ id: 'splash_video', videoData: finalVideo, updatedAt: Date.now() });
    
    if (error) {
        if(error.message.includes('payload is too large')) alert("Vídeo grande demais para a base de dados. Use Link Externo.");
        else alert("Erro ao guardar vídeo: " + error.message);
    } else {
        alert("Vídeo guardado com sucesso!");
        document.getElementById('splash-video-file').value = '';
        document.getElementById('splash-video-url').value = '';
        splashVideoBase64 = '';
        fetchSettingsVideo();
    }
};

window.deleteSplashVideo = async () => {
    if(confirm("Remover vídeo de abertura e usar o padrão?")) {
        await supabase.from('global_settings').delete().eq('id', 'splash_video');
        alert("Vídeo restaurado!"); fetchSettingsVideo();
    }
};

// ==========================================
// 3. CIDADES
// ==========================================
async function fetchCities() {
    const { data, error } = await supabase.from('cities').select('*');
    if (!error && data) {
        globalCities = data;
        globalCities.sort((a, b) => a.name.localeCompare(b.name));
        renderCitiesList();
        populateCityDropdowns();
    }
}

window.saveCity = async () => {
    const name = document.getElementById('c-name').value.trim();
    const state = document.getElementById('c-state').value.trim().toUpperCase();
    if(!name || !state) return alert("Preencha o nome e estado.");
    
    const exists = globalCities.find(c => c.name.toLowerCase() === name.toLowerCase() && c.state === state);
    if(exists) return alert("Cidade já registada!");
    
    const { error } = await supabase.from('cities').insert([{ id: generateId(), name, state }]);
    if (error) alert("Erro ao registar cidade: " + error.message);
    else {
        document.getElementById('c-name').value = ''; document.getElementById('c-state').value = '';
        fetchCities();
    }
};

window.deleteCity = async (id) => {
    if(confirm("Tem a certeza que deseja apagar esta cidade?")) {
        await supabase.from('cities').delete().eq('id', id);
        fetchCities();
    }
};

function renderCitiesList() {
    const container = document.getElementById('city-list-container');
    if(globalCities.length === 0) { container.innerHTML = `<p style="color:#999; font-size:0.9rem;">Nenhuma cidade registada.</p>`; return; }
    container.innerHTML = globalCities.map(c => `
        <div class="card-item" style="justify-content: space-between;">
            <div style="display:flex; align-items:center; gap:12px;">
