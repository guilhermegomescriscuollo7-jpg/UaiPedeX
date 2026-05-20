import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = 'https://mvhqsiyalupodrtsfncj.supabase.co';
const supabaseKey = 'sb_publishable_K_tmqPg95RJlCCzwRZln4Q_kmfrUw0G'; 
const supabase = createClient(supabaseUrl, supabaseKey);

const loggedStore = JSON.parse(localStorage.getItem('loggedStore'));

if (!loggedStore) {
    window.location.href = "login-vendedor.html";
}

window.onload = async () => {
    document.getElementById('ui-store-name').innerText = loggedStore.name || "Minha Loja";
    
    // Buscar status real do banco
    const { data: storeData } = await supabase.from('stores').select('status').eq('id', loggedStore.id).single();
    document.getElementById('btn-toggle-status').checked = storeData?.status === 'Aberto';
    
    loadProducts();
};

async function loadProducts() {
    const container = document.getElementById('product-list-container');
    
    // Consulta produtos filtrando pelo ID da loja
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('storeId', loggedStore.id); // Certifique-se que o campo no Supabase é 'storeId'

    if (error) {
        container.innerHTML = "Erro ao carregar: " + error.message;
        console.error(error);
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = "<p>Nenhum produto cadastrado nesta loja.</p>";
        return;
    }

    container.innerHTML = data.map(p => `
        <div class="product-row">
            <div><strong>${p.name}</strong> - R$ ${parseFloat(p.price).toFixed(2)}</div>
            <button onclick="window.deleteProduct('${p.id}')">Excluir</button>
        </div>
    `).join('');
}

window.deleteProduct = async (id) => {
    if(confirm("Deseja apagar este produto?")) {
        await supabase.from('products').delete().eq('id', id);
        loadProducts();
    }
};

window.toggleStoreStatus = async () => {
    const isChecked = document.getElementById('btn-toggle-status').checked;
    const newStatus = isChecked ? 'Aberto' : 'Fechado';
    await supabase.from('stores').update({ status: newStatus }).eq('id', loggedStore.id);
    alert("Loja definida como: " + newStatus);
};

window.logoutStore = () => {
    localStorage.removeItem('loggedStore');
    window.location.href = 'login-vendedor.html';
};
