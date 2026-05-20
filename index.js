// ==========================================
// CONFIGURAÇÃO SUPABASE
// ==========================================
import { supabase } from './js/supabase-client.js';

// ==========================================
// VARIÁVEIS GLOBAIS
// ==========================================
let allStores = []; 
let allBanners = [];
let globalCities = [];
let allActiveSponsors = [];
let allCoupons = []; 

let currentCategoryFilter = null; 
let bannerInterval; 
let userCity = localStorage.getItem('userCity');

let userFavorites = JSON.parse(localStorage.getItem('userFavorites')) || [];
let quickFilters = { freeShipping: false, hasCoupon: false, openNow: false, favorites: false };

// 🟢 BUSCAR STATUS DO USUÁRIO LOGADO
let isSponsorAssociated = false;
const loggedCustomer = JSON.parse(localStorage.getItem('loggedCustomer'));
const userEmail = loggedCustomer ? loggedCustomer.email : localStorage.getItem('userEmail');

// Use Supabase Auth session if available
supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
        supabase.from('customers')
            .select('isSicoob')
            .eq('auth_id', session.user.id)
            .single()
            .then(({ data }) => {
                if (data) {
                    isSponsorAssociated = data.isSicoob === true;
                    if (userCity) window.renderStores();
                }
            });
    }
});

// ==========================================
// LÓGICA DE AVISOS GLOBAIS
// ==========================================
let dismissedAlerts = JSON.parse(localStorage.getItem('dismissedAlerts')) || [];

async function loadAlerts() {
    const { data, error } = await supabase.from('global_alerts').select('*');
    const container = document.getElementById('global-alerts-container');
    if(error || !container || !data) return;

    let alertsHtml = '';
    let alerts = data.sort((a,b) => b.timestamp - a.timestamp);

    alerts.forEach(alertData => {
        if (alertData.active !== false && !dismissedAlerts.includes(alertData.id)) {
            let typeClass = 'info'; let icon = '📢';
            if(alertData.type === 'promo') { typeClass = 'promo'; icon = '🎉'; }
            if(alertData.type === 'success') { typeClass = 'success'; icon = '✅'; }

            const safeId = String(alertData.id).replace(/[^a-zA-Z0-9_-]/g, '');
            alertsHtml += `
                <div class="global-alert-card ${typeClass}" id="alert-${safeId}" data-alert-id="${safeId}">
                    <div style="font-size: 1.4rem;">${icon}</div>
                    <div class="alert-text"></div>
                    <button class="alert-close" data-dismiss="${safeId}">✕</button>
                </div>
            `;
        }
    });
    container.innerHTML = alertsHtml;
    // Fill text via textContent to prevent XSS
    container.querySelectorAll('.global-alert-card').forEach((card, i) => {
        const alert = alerts.filter(a => a.active !== false && !dismissedAlerts.includes(a.id))[i];
        if (alert) {
            const textEl = card.querySelector('.alert-text');
            if (textEl) textEl.textContent = alert.text;
        }
        const btn = card.querySelector('.alert-close');
        if (btn) btn.addEventListener('click', () => window.dismissAlert(btn.dataset.dismiss));
    });
}

window.dismissAlert = (id) => {
    dismissedAlerts.push(id);
    localStorage.setItem('dismissedAlerts', JSON.stringify(dismissedAlerts));
    const alertEl = document.getElementById(`alert-${id}`);
    if(alertEl) alertEl.style.display = 'none';
};

// ==========================================
// CARREGAMENTO DOS DADOS (SUPABASE)
// ==========================================
async function loadCities() {
    const { data, error } = await supabase.from('cities').select('*');
    if (!error && data) {
        globalCities = data.sort((a,b) => a.name.localeCompare(b.name));
        if(document.getElementById('city-modal').classList.contains('active')) {
            window.openCityModal(!(!userCity)); 
        }
    }
}

async function loadStores() {
    const { data, error } = await supabase.from('stores').select('*');
    if (!error && data) {
        allStores = data;
        if(userCity) {
            window.renderStores();
            window.renderFeaturedStores();
        }
    }
}

async function loadBanners() {
    const { data, error } = await supabase.from('banners').select('*');
    if (!error && data) {
        allBanners = data;
        if(userCity) window.renderBanners();
    }
}

async function loadSponsors() {
    const { data, error } = await supabase.from('sponsors').select('*');
    if (!error && data) {
        allActiveSponsors = data.sort((a,b) => a.timestamp - b.timestamp);
    }
}

async function loadCoupons() {
    const { data, error } = await supabase.from('coupons').select('*');
    if (!error && data) {
        allCoupons = data;
        if(userCity) window.renderStores(); 
    }
}

// Inicializa a recolha de dados
loadAlerts();
loadCities();
loadStores();
loadBanners();
loadSponsors();
loadCoupons();

// ==========================================
// INSTALAÇÃO DO PWA
// ==========================================
let deferredPrompt;
const installBanner = document.getElementById('install-banner');
const installBtn = document.getElementById('btn-install-app');
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; installBanner.style.display = 'flex'; });
if(installBtn) {
    installBtn.addEventListener('click', async () => { installBanner.style.display = 'none'; if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; } });
}

// ==========================================
// 🟢 INICIALIZAÇÃO DA TELA COM VÍDEO MP4 🟢
// ==========================================
window.addEventListener('load', async () => {
    const splash = document.getElementById('splash-screen');
    const defaultLogo = document.getElementById('splash-default-logo');
    const splashVideo = document.getElementById('splash-video');
    const sponsorWrapper = document.getElementById('sponsor-wrapper');
    const sponsorContent = document.getElementById('sponsor-content');

    if (sessionStorage.getItem('splashShown') === 'true') {
        if (splash) splash.style.display = 'none';
        if (sponsorWrapper) sponsorWrapper.style.display = 'none';
        
        if (!userCity) { 
            window.openCityModal(false); 
        } else { 
            document.getElementById('header-city-name').innerText = userCity.split(' - ')[0];
            window.loadCityContent(); 
        }
        return;
    }

    sessionStorage.setItem('splashShown', 'true');
    let splashDone = false;

    const proceedAfterSplash = () => {
        if (splashDone) return;
        splashDone = true;

        let citySponsors = [];
        if (userCity) {
            citySponsors = allActiveSponsors.filter(s => !s.city || s.city === 'all' || s.city === userCity);
        }

        if (userCity && citySponsors.length > 0 && sponsorWrapper) {
            sponsorWrapper.style.display = 'flex';
            const spAtual = citySponsors[0];
            sponsorContent.className = `effect-${spAtual.transition || 'fade'}`; 
            sponsorContent.innerHTML = `<img src="${spAtual.image}" alt="Patrocinador" style="width:100%; height:100%; object-fit:cover;">`;
            sponsorContent.classList.add('active'); 
        }

        if (splash) splash.classList.add('hidden'); 
        
        setTimeout(() => { 
            if (splash) splash.style.display = 'none'; 
            
            if (!userCity) {
                document.documentElement.classList.add('skip-splash');
                window.openCityModal(false);
            } else {
                document.getElementById('header-city-name').innerText = userCity.split(' - ')[0];
                
                if(citySponsors.length > 0 && sponsorWrapper) {
                    let indexAtual = 0;
                    function mostrarProximoPatrocinador() {
                        if (indexAtual >= citySponsors.length) {
                            sponsorWrapper.style.transition = "opacity 0.5s ease"; 
                            sponsorWrapper.style.opacity = "0";
                            setTimeout(() => { 
                                sponsorWrapper.style.display = 'none'; 
                                document.documentElement.classList.add('skip-splash'); 
                                window.loadCityContent(); 
                            }, 500); 
                            return;
                        }
                        
                        const spAtual = citySponsors[indexAtual];
                        const tempoMs = (spAtual.duration || 2) * 1000;
                        
                        if (indexAtual > 0) {
                            sponsorContent.className = `effect-${spAtual.transition || 'fade'}`; 
                            sponsorContent.innerHTML = `<img src="${spAtual.image}" alt="Patrocinador" style="width:100%; height:100%; object-fit:cover;">`;
                            void sponsorContent.offsetWidth; 
                            sponsorContent.classList.add('active'); 
                        }

                        setTimeout(() => {
                            sponsorContent.classList.remove('active'); 
                            setTimeout(() => { indexAtual++; mostrarProximoPatrocinador(); }, 600); 
                        }, tempoMs); 
                    }
                    mostrarProximoPatrocinador(); 
                } else {
                    if (sponsorWrapper) sponsorWrapper.style.display = 'none'; 
                    document.documentElement.classList.add('skip-splash'); 
                    window.loadCityContent();
                }
            }
        }, 500); 
    };

    // Busca o vídeo no Supabase
    try {
        const { data, error } = await supabase.from('global_settings').select('*').eq('id', 'splash_video').single();
        if (data && data.videoData) {
            
            defaultLogo.style.display = 'none';
            splashVideo.src = data.videoData;
            splashVideo.style.display = 'block';

            splashVideo.play().catch(() => proceedAfterSplash());
            splashVideo.onended = proceedAfterSplash;
            
            setTimeout(proceedAfterSplash, 6000); 
        } else {
            setTimeout(proceedAfterSplash, 2000);
        }
    } catch(e) {
        setTimeout(proceedAfterSplash, 2000);
    }
});

// ==========================================
// FUNÇÕES DO MODAL DE CIDADES
// ==========================================
window.openCityModal = (canClose = true) => {
    const modal = document.getElementById('city-modal');
    const closeBtn = document.getElementById('btn-close-city-modal');
    
    document.getElementById('city-search-input').value = '';
    
    if (canClose && userCity) { closeBtn.style.display = 'flex'; } 
    else { closeBtn.style.display = 'none'; }

    window.renderCityList(globalCities);
    modal.classList.add('active');
};

window.renderCityList = (citiesToRender) => {
    const listContainer = document.getElementById('modal-city-list');
    if (citiesToRender.length === 0) {
        listContainer.innerHTML = '<p style="color:#aaa; text-align:center; padding: 20px;">Nenhuma cidade encontrada.</p>';
    } else {
        listContainer.innerHTML = citiesToRender.map(c => {
            const cityString = `${c.name} - ${c.state}`;
            const isSelected = userCity === cityString;
            return `
            <button class="city-item-btn" onclick="window.selectCity('${cityString}')" ${isSelected ? 'style="border-color:#ea1d2c; background:#fff5f5;"' : ''}>
                <span style="font-weight: 700; color: #111;">${c.name} <span style="font-weight: normal; color: #888; font-size: 0.85rem;">(${c.state})</span></span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${isSelected ? '#ea1d2c' : '#ccc'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            `;
        }).join('');
    }
};

window.filterCityList = () => {
    const query = document.getElementById('city-search-input').value.toLowerCase().trim();
    if (!query) {
        window.renderCityList(globalCities);
        return;
    }
    const filtered = globalCities.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.state.toLowerCase().includes(query)
    );
    window.renderCityList(filtered);
};

window.closeCityModal = () => { document.getElementById('city-modal').classList.remove('active'); };

window.selectCity = (cityString) => {
    userCity = cityString;
    localStorage.setItem('userCity', cityString);
    document.getElementById('header-city-name').innerText = cityString.split(' - ')[0];
    closeCityModal();
    document.documentElement.classList.add('skip-splash');
    window.loadCityContent();
};

// ==========================================
// RENDERIZAÇÃO CENTRAL 
// ==========================================
window.loadCityContent = () => {
    document.getElementById('main-content').style.display = 'block';
    window.renderBanners();
    window.renderStores();
    window.renderFeaturedStores();
}

// BANNERS COM CLIQUE PARA LOJA VINCULADA OU LINK EXTERNO
window.renderBanners = () => {
    const bannerContainer = document.getElementById('banner-wrapper');
    const track = document.getElementById('banner-track');
    if(!userCity) return;

    let bannersHtml = '';
    allBanners.forEach(b => {
        if (!b.city || b.city === 'all' || b.city === userCity) {
            let clickAction = '';
            if (b.link) {
                clickAction = `onclick="window.open('${b.link}', '_blank')" style="cursor:pointer;"`;
            } else if (b.storeId) {
                clickAction = `onclick="window.location.href='loja.html?id=${b.storeId}'" style="cursor:pointer;"`;
            }
            bannersHtml += `<img src="${b.image}" class="banner-slide" ${clickAction}>`;
        }
    });
    
    if(bannersHtml === '') { 
        bannerContainer.style.display = 'none'; 
    } else { 
        bannerContainer.style.display = 'block'; 
        track.innerHTML = bannersHtml; 
        clearInterval(bannerInterval);
        let currentIndex = 0;
        bannerInterval = setInterval(() => {
            if (track.children.length > 1) {
                currentIndex++;
                if(currentIndex >= track.children.length) currentIndex = 0;
                track.scrollTo({ left: (track.clientWidth + 12) * currentIndex, behavior: 'smooth' });
            }
        }, 3500);
    }
};

// SECÇÃO DE DESTAQUES
window.renderFeaturedStores = () => {
    const featuredSection = document.getElementById('featured-section');
    const track = document.getElementById('featured-track-container');
    if (!userCity) return;

    const now = new Date(); const daysMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const currentDayStr = daysMap[now.getDay()]; const currentMins = now.getHours() * 60 + now.getMinutes();

    let featured = allStores.filter(s => s.city === userCity && s.isActive !== false && s.isFeatured === true);
    
    featured = featured.filter(s => {
        let dynamicStatus = s.status || 'Aberto';
        if (dynamicStatus === 'Aberto' && s.schedule) {
            const todaySch = s.schedule[currentDayStr];
            if (!todaySch || !todaySch.active) { dynamicStatus = 'Fechado'; } 
            else {
                const [oH, oM] = (todaySch.open || '00:00').split(':').map(Number);
                const [cH, cM] = (todaySch.close || '23:59').split(':').map(Number);
                const openMins = (oH || 0) * 60 + (oM || 0); const closeMins = (cH || 0) * 60 + (cM || 0);
                let isOpen = (closeMins >= openMins) ? (currentMins >= openMins && currentMins <= closeMins) : (currentMins >= openMins || currentMins <= closeMins);
                if (!isOpen) dynamicStatus = 'Fechado';
            }
        }
        return dynamicStatus === 'Aberto'; 
    });

    if (featured.length === 0) {
        featuredSection.style.display = 'none';
        return;
    }

    featuredSection.style.display = 'block';

    track.innerHTML = featured.slice(0, 5).map(s => {
        return `
        <a href="loja.html?id=${s.id}" class="featured-card">
            <div class="featured-card-header"></div>
            <img src="${s.logo || 'https://via.placeholder.com/80'}" class="featured-logo" alt="Logo">
            <div class="featured-name">${s.name}</div>
            <div class="featured-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Aberto
            </div>
        </a>`;
    }).join('');
};

// CÓDIGO ATUALIZADO DE LOJAS (COM CUPONS GLOBAIS E CHIPS)
window.renderStores = () => {
    const container = document.getElementById('store-list-container');
    if(!userCity) return;

    let filteredStores = allStores.filter(s => s.city === userCity && s.isActive !== false);

    if (currentCategoryFilter && currentCategoryFilter !== 'Todos') {
        filteredStores = filteredStores.filter(s => s.cat && s.cat.toLowerCase().includes(currentCategoryFilter.toLowerCase()));
    }

    const now = new Date(); const daysMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const currentDayStr = daysMap[now.getDay()]; const currentMins = now.getHours() * 60 + now.getMinutes();

    filteredStores = filteredStores.map(s => {
        let dynamicStatus = s.status || 'Aberto';
        if (dynamicStatus === 'Aberto' && s.schedule) {
            const todaySch = s.schedule[currentDayStr];
            if (!todaySch || !todaySch.active) { dynamicStatus = 'Fechado'; } 
            else {
                const [oH, oM] = (todaySch.open || '00:00').split(':').map(Number);
                const [cH, cM] = (todaySch.close || '23:59').split(':').map(Number);
                const openMins = (oH || 0) * 60 + (oM || 0); const closeMins = (cH || 0) * 60 + (cM || 0);
                let isOpen = (closeMins >= openMins) ? (currentMins >= openMins && currentMins <= closeMins) : (currentMins >= openMins || currentMins <= closeMins);
                if (!isOpen) dynamicStatus = 'Fechado';
            }
        }
        return { ...s, dynamicStatus };
    });

    if (quickFilters.hasCoupon) {
        filteredStores = filteredStores.filter(s => {
            return allCoupons.some(c => {
                if (c.active !== true) return false;
                if (c.usageLimit && (c.usedCount || 0) >= c.usageLimit) return false;
                
                if (c.storeId === s.id) return true;
                if (c.storeId === 'GLOBAL' && c.targetCity === s.city) {
                    const isSicoobCoupon = (c.exclusiveFor === 'sicoob') || (c.sponsorName && c.sponsorName.toLowerCase().includes('sicoob'));
                    if (isSicoobCoupon && !isSponsorAssociated) return false;
                    return true;
                }
                return false;
            });
        });
    }

    if (quickFilters.freeShipping) {
        filteredStores = filteredStores.filter(s => !s.deliveryFee || parseFloat(s.deliveryFee) === 0);
    }
    if (quickFilters.openNow) {
        filteredStores = filteredStores.filter(s => s.dynamicStatus === 'Aberto');
    }
    if (quickFilters.favorites) {
        filteredStores = filteredStores.filter(s => userFavorites.includes(s.id));
    }

    if (filteredStores.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                <h3>Nenhuma loja encontrada</h3>
                <p>Tente alterar os filtros selecionados.</p>
            </div>`;
        return;
    }

    filteredStores.sort((a, b) => {
        const getWeight = (store) => { if (store.dynamicStatus === 'Fechado') return 1; return 0; };
        return getWeight(a) - getWeight(b);
    });

    container.innerHTML = filteredStores.map(s => {
        const isClosed = s.dynamicStatus === 'Fechado';
        const cardClass = isClosed ? 'store-card closed' : 'store-card';
        let statusText = s.dynamicStatus; let statusColor = isClosed ? '#717171' : '#00a14b'; 
        
        let deliveryTimeText = s.deliveryTime ? s.deliveryTime : '--';
        let deliveryTimeHtml = `<div>Delivery: ${deliveryTimeText}</div>`;
        
        let deliveryFeeValue = s.deliveryFee !== undefined && s.deliveryFee !== '' ? parseFloat(s.deliveryFee) : 0;
        let deliveryFeeHtml = deliveryFeeValue > 0 ? `<div>Entrega: R$ ${deliveryFeeValue.toFixed(2).replace('.', ',')}</div>` : '<div>Entrega: Grátis</div>';
        
        let storeCoupons = allCoupons.filter(c => {
            if (c.active !== true) return false;
            if (c.usageLimit && (c.usedCount || 0) >= c.usageLimit) return false;

            if (c.storeId === s.id) return true;
            if (c.storeId === 'GLOBAL' && c.targetCity === s.city) {
                const isSicoobCoupon = (c.exclusiveFor === 'sicoob') || (c.sponsorName && c.sponsorName.toLowerCase().includes('sicoob'));
                if (isSicoobCoupon && !isSponsorAssociated) return false;
                return true;
            }
            return false;
        });

        let couponHtml = '';
        
        if (storeCoupons.length > 0) {
            let couponsTags = storeCoupons.map(c => {
                const isGlobal = c.storeId === 'GLOBAL';
                const isSicoob = isGlobal && ((c.exclusiveFor === 'sicoob') || (c.sponsorName && c.sponsorName.toLowerCase().includes('sicoob')));
                
                let color = '#ea1d2c'; 
                if (isGlobal) {
                    color = isSicoob ? '#00a14b' : '#0d6efd'; 
                }

                let discountText = '';
                if (c.type === 'percentage') discountText = `${c.value}% OFF`;
                else if (c.type === 'free_shipping') discountText = `ENTREGA GRÁTIS`;
                else discountText = `R$ ${c.value.toFixed(2).replace('.', ',')} OFF`;

                return `<span class="coupon-badge-btn" style="color: ${color}; border-color: ${color};">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line>
                    </svg>
                    ${c.code}: ${discountText}
                </span>`;
            }).join('');
            
            couponHtml = `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">${couponsTags}</div>`;
        }

        let isFav = userFavorites.includes(s.id);
        let favClass = isFav ? 'heart-btn favorited' : 'heart-btn';

        return `
        <a href="loja.html?id=${s.id}" class="${cardClass}">
            
            <button class="${favClass}" onclick="window.toggleFavorite('${s.id}', event)">
                <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </button>

            <img src="${s.logo || 'https://via.placeholder.com/80'}" class="store-logo" alt="Logo">
            <div class="store-info">
                <div class="store-name">${s.name}</div>
                <div class="store-details"><span>${s.cat || 'Geral'}</span><span class="dot">•</span><span style="font-weight: bold; color: ${statusColor};">${statusText}</span></div>
                
                <div class="store-delivery-info">
                    ${deliveryTimeHtml}
                    ${deliveryFeeHtml}
                </div>
                ${couponHtml}
            </div>
        </a>`;
    }).join('');
};

// ==========================================
// FUNÇÕES DOS NOVOS FILTROS E FAVORITOS
// ==========================================
window.toggleQuickFilter = (type, btnElement) => {
    quickFilters[type] = !quickFilters[type];
    if (quickFilters[type]) {
        btnElement.classList.add('active');
    } else {
        btnElement.classList.remove('active');
    }
    window.renderStores();
};

window.toggleFavorite = (storeId, event) => {
    event.preventDefault(); 
    event.stopPropagation();
    
    if (userFavorites.includes(storeId)) {
        userFavorites = userFavorites.filter(id => id !== storeId);
    } else {
        userFavorites.push(storeId);
    }
    localStorage.setItem('userFavorites', JSON.stringify(userFavorites));
    window.renderStores(); 
};

window.filterCategory = (categoryName, element) => {
    document.querySelectorAll('#category-filters .button-item').forEach(btn => btn.classList.remove('active'));
    if (categoryName === 'Todos' || currentCategoryFilter === categoryName) {
        currentCategoryFilter = null; 
        document.querySelector('#category-filters .button-item').classList.add('active'); 
        document.getElementById('list-title').innerText = "Lojas Disponíveis";
    } else {
        element.classList.add('active'); 
        currentCategoryFilter = categoryName; 
        document.getElementById('list-title').innerText = "Lojas - " + element.querySelector('span').innerText;
    }
    window.renderStores();
};

// ==========================================
// MÓDULO DA BARRA DE BUSCA (MODAL)
// ==========================================
window.openSearchModal = (e) => {
    if(e) { e.preventDefault(); }
    document.getElementById('search-modal').style.display = 'flex';
    document.getElementById('sm-search-input').focus();
    window.filterSearchModal();
};

window.closeSearchModal = () => {
    document.getElementById('search-modal').style.display = 'none';
    document.getElementById('sm-search-input').value = '';
};

window.filterSearchModal = () => {
    const query = document.getElementById('sm-search-input').value.toLowerCase().trim();
    const container = document.getElementById('sm-results-container');
    const title = document.getElementById('sm-results-title');

    if (!query) {
        title.style.display = 'none';
        container.innerHTML = `
            <div style="text-align:center; padding:50px 20px; color:#999;">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ddd" stroke-width="2" style="margin-bottom:10px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <p style="font-size:0.9rem;">Encontre o que deseja num piscar de olhos.</p>
            </div>`;
        return;
    }

    title.style.display = 'block';
    let results = allStores.filter(s => s.city === userCity && s.isActive !== false && 
        (s.name.toLowerCase().includes(query) || (s.cat && s.cat.toLowerCase().includes(query)))
    );

    if (results.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#777;">
                <p>Nenhuma loja ou categoria encontrada para <b>"${query}"</b>.</p>
            </div>`;
        return;
    }

    container.innerHTML = results.map(s => {
        let statusColor = s.status === 'Fechado' ? '#717171' : '#00a14b'; 
        return `
        <a href="loja.html?id=${s.id}" class="store-card" style="box-shadow:none; border-bottom:1px solid #eee; border-radius:0; margin:0;">
            <img src="${s.logo || 'https://via.placeholder.com/80'}" class="store-logo" style="width:50px; height:50px;">
            <div class="store-info">
                <div class="store-name" style="font-size:1rem;">${s.name}</div>
                <div class="store-details"><span>${s.cat || 'Geral'}</span></div>
            </div>
        </a>`;
    }).join('');
};
