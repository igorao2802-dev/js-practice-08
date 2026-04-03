'use strict';

// --- Состояние приложения ---
const appState = {
    currentUsername: '',
    currentReposPage: 1,
    isFetchingMore: false,
    totalPublicRepos: 0,
    abortController: null
};

// --- DOM-элементы (строгий querySelector) ---
const searchForm = document.querySelector('#search-form');
const usernameInput = document.querySelector('#username');
const searchBtn = document.querySelector('#searchBtn');
const errorDiv = document.querySelector('#error');
const loader = document.querySelector('#loader');
const profileSection = document.querySelector('#profile-section');
const profileDiv = document.querySelector('#profile');
const reposSection = document.querySelector('#repos-section');
const reposList = document.querySelector('#repos');
const historySection = document.querySelector('#history-section');
const historyDiv = document.querySelector('#history');
const clearHistoryBtn = document.querySelector('#clearHistory');
const loadMoreBtn = document.querySelector('#load-more-btn');
const suggestionsContainer = document.querySelector('#suggestions-container');
const formatSelect = document.querySelector('#number-format');

// --- Утилиты управления UI ---
function showLoader() { loader.classList.remove('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }

function showError(message) {
    clearError();
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function clearError() {
    errorDiv.textContent = '';
    errorDiv.classList.add('hidden');
}

function clearContainer(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

function hideSuggestions() {
    suggestionsContainer.classList.add('hidden');
    clearContainer(suggestionsContainer);
}

// --- Debounce (Бонус 3.3) ---
function debounce(func, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        // ПОЧЕМУ setTimeout? — Откладывает выполнение до прекращения ввода, снижая нагрузку на API и предотвращая спам запросами.
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

// --- Форматирование (Бонус 3.5) ---
const FORMAT_KEY = 'gh_format_preference';
function getFormatPreference() { return localStorage.getItem(FORMAT_KEY) || 'full'; }
function saveFormatPreference(pref) { localStorage.setItem(FORMAT_KEY, pref); }

function formatNumber(num) {
    const pref = getFormatPreference();
    // ПОЧЕМУ Intl.NumberFormat? — Стандартный безопасный способ форматирования без ручных строк, учитывает локаль и компактную запись.
    if (pref === 'short') {
        return new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(num);
    }
    return new Intl.NumberFormat('ru-RU').format(num);
}

// --- Нормализация имени (для тестов) ---
// ПОЧЕМУ вынесена отдельно? — Позволяет покрыть её unit-тестами и избежать дублирования логики очистки ввода.
function normalizeUsername(username) {
    return typeof username === 'string' ? username.trim().replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() : '';
}
window.normalizeUsername = normalizeUsername; // Экспорт для tests.js

// --- История поиска (3.1) ---
const HISTORY_KEY = 'gh_search_history';
const MAX_HISTORY = 3;

function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch (error) { console.error('Ошибка чтения истории:', error); return []; }
}

function saveHistory(historyArray) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(historyArray)); }
    catch (error) { console.error('Ошибка записи истории:', error); }
}

function updateHistory(username) {
    const clean = normalizeUsername(username);
    if (!clean) return;
    const history = loadHistory().filter(u => u !== clean);
    saveHistory([clean, ...history].slice(0, MAX_HISTORY));
    renderHistory();
}

function renderHistory() {
    clearContainer(historyDiv);
    const history = loadHistory();
    if (history.length === 0) {
        historySection.classList.add('hidden');
        return;
    }
    historySection.classList.remove('hidden');
    history.forEach(login => {
        const tag = document.createElement('button');
        tag.textContent = login;
        tag.addEventListener('click', () => {
            usernameInput.value = login;
            searchForm.dispatchEvent(new Event('submit'));
            hideSuggestions();
        });
        historyDiv.appendChild(tag);
    });
}

// --- API Запросы ---
async function getUser(username) {
    // ПОЧЕМУ async/await? — Позволяет писать асинхронный код так, будто он синхронный; читается легче, чем цепочки .then().
    // ПОЧЕМУ try/catch? — Единственный способ поймать ошибки сети (например, пропал интернет) при использовании await.
    try {
        const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`);
        // ПОЧЕМУ!response.ok? — fetch не считает ошибки 404/500 исключениями; нужно вручную проверять успешность статус-кода.
        if (!response.ok) {
            if (response.status === 404) throw new Error('Пользователь не найден');
            if (response.status === 403) throw new Error('Превышен лимит запросов GitHub.');
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        const contentType = response.headers.get('Content-Type');
        if (!contentType?.includes('application/json')) throw new Error('Неверный формат ответа');
        return await response.json();
    } catch (error) {
        if (error.name === 'TypeError') throw new Error('Ошибка сети: проверьте интернет');
        throw error;
    }
}

async function getRepos(username, page = 1) {
    try {
        const params = new URLSearchParams({ sort: 'updated', per_page: 5, page });
        const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?${params}`);
        if (!response.ok) throw new Error(`Не удалось загрузить репозитории: ${response.status}`);
        return await response.json();
    } catch (error) {
        if (error.name === 'TypeError') throw new Error('Ошибка сети при загрузке репозиториев');
        throw error;
    }
}

async function getSuggestions(query) {
    // ПОЧЕМУ AbortController? — Предотвращает "гонку запросов": при быстром вводе отменяется устаревший запрос, экономя трафик.
    if (appState.abortController) appState.abortController.abort();
    appState.abortController = new AbortController();

    try {
        if (query.length < 2) return [];
        const params = new URLSearchParams({ q: query, per_page: 5 });
        const response = await fetch(`https://api.github.com/search/users?${params}`, { signal: appState.abortController.signal });
        if (!response.ok) return [];
        const data = await response.json();
        return data.items || [];
    } catch (error) {
        if (error.name !== 'AbortError') console.warn('Ошибка подсказок:', error);
        return [];
    }
}

// --- Отрисовка данных (без innerHTML) ---
function renderProfile(data) {
    clearContainer(profileDiv);
    const card = document.createElement('div');
    card.className = 'profile-card';

    const avatar = document.createElement('img');
    avatar.src = data.avatar_url || '';
    avatar.alt = `Аватар ${data.login}`;
    card.appendChild(avatar);

    const info = document.createElement('div');
    info.className = 'profile-info';

    const nameEl = document.createElement('h2');
    nameEl.textContent = data.name || data.login;
    info.appendChild(nameEl);

    if (data.bio) {
        const bioEl = document.createElement('p');
        bioEl.textContent = data.bio;
        info.appendChild(bioEl);
    }

    appState.totalPublicRepos = data.public_repos || 0;
    const reposCountEl = document.createElement('span');
    reposCountEl.textContent = `Публичных репозиториев: ${formatNumber(appState.totalPublicRepos)}`;
    info.appendChild(reposCountEl);

    card.appendChild(info);
    profileDiv.appendChild(card);
    profileSection.classList.remove('hidden');
}

function renderRepos(repos, append = false) {
    if (!append) clearContainer(reposList);
    if (!repos || repos.length === 0 && !append) {
        if (!append) {
            const emptyMsg = document.createElement('li');
            emptyMsg.textContent = 'Репозитории не найдены';
            reposList.appendChild(emptyMsg);
        }
        return;
    }

    repos.forEach(repo => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = repo.html_url || '#';
        link.textContent = repo.name || 'Без названия';
        link.target = '_blank';
        link.rel = 'noopener noreferrer'; // ПОЧЕМУ rel? — Защита от reverse tabnapping при открытии внешних ссылок.
        li.appendChild(link);

        const desc = document.createElement('p');
        desc.textContent = repo.description || 'Описание отсутствует';
        li.appendChild(desc);

        const stars = document.createElement('span');
        stars.textContent = `⭐ ${formatNumber(repo.stargazers_count)}`;
        li.appendChild(stars);

        reposList.appendChild(li);
    });

    if (!append) reposSection.classList.remove('hidden');
}

function renderSuggestions(users) {
    clearContainer(suggestionsContainer);
    if (!users || users.length === 0) {
        hideSuggestions();
        return;
    }
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user.login;
        li.addEventListener('click', () => {
            usernameInput.value = user.login;
            hideSuggestions();
            searchForm.dispatchEvent(new Event('submit'));
        });
        suggestionsContainer.appendChild(li);
    });
    suggestionsContainer.classList.remove('hidden');
}

function updateLoadMoreBtn(hasMore) {
    if (hasMore) {
        loadMoreBtn.textContent = 'Загрузить ещё репозитории';
        loadMoreBtn.classList.remove('hidden');
        loadMoreBtn.disabled = false;
    } else {
        loadMoreBtn.textContent = 'Все репозитории загружены';
        loadMoreBtn.classList.remove('hidden'); // Оставляем видимой, чтобы показать статус
        loadMoreBtn.disabled = true;
    }
}

// --- Обработчики событий ---
searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideSuggestions();
    clearError();
    profileSection.classList.add('hidden');
    reposSection.classList.add('hidden');
    loadMoreBtn.classList.add('hidden');

    const rawUsername = usernameInput.value.trim();
    // ПОЧЕМУ проверяем пустоту и длину? — Защита от отправки некорректных запросов к API, экономия лимитов и UX.
    if (!rawUsername) { showError('Введите имя пользователя GitHub'); return; }
    if (rawUsername.length > 256) { showError('Имя не должно превышать 256 символов'); return; }

    appState.currentUsername = normalizeUsername(rawUsername);
    appState.currentReposPage = 1;
    usernameInput.value = appState.currentUsername;

    // ПОЧЕМУ блокируем кнопку? — Предотвращает повторные клики и дублирование запросов во время выполнения асинхронной операции.
    searchBtn.disabled = true;
    showLoader();

    try {
        // 3.2 ПОЧЕМУ Promise.all? — Параллельные запросы выполняются одновременно, что сокращает общее время ожидания пользователя.
        const [userData, reposData] = await Promise.all([
            getUser(appState.currentUsername),
            getRepos(appState.currentUsername, 1)
        ]);

        renderProfile(userData);
        renderRepos(reposData, false);
        // Проверяем, есть ли ещё страницы (GitHub возвращает < per_page только на последней странице)
        updateLoadMoreBtn(reposData.length === 5);
        updateHistory(appState.currentUsername);
    } catch (error) {
        showError(error.message || 'Ошибка загрузки данных');
        console.error('Fetch error:', error);
    } finally {
        hideLoader();
        searchBtn.disabled = false;
    }
});

// 3.4 Пагинация (исправлена логика повторных срабатываний)
loadMoreBtn.addEventListener('click', async () => {
    if (appState.isFetchingMore || !appState.currentUsername) return;
    appState.isFetchingMore = true;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Загрузка...';

    try {
        appState.currentReposPage++;
        const moreRepos = await getRepos(appState.currentUsername, appState.currentReposPage);
        renderRepos(moreRepos, true);
        // Если пришло меньше 5, значит это последняя страница
        const hasMore = moreRepos.length === 5;
        updateLoadMoreBtn(hasMore);
    } catch (error) {
        showError(error.message);
        loadMoreBtn.textContent = 'Ошибка. Попробовать снова?';
        loadMoreBtn.disabled = false;
    } finally {
        // ПОЧЕМУ finally? — Гарантирует сброс флага загрузки независимо от успеха или падения запроса.
        appState.isFetchingMore = false;
    }
});

// 3.3 Debounce на ввод
usernameInput.addEventListener('input', debounce(async (event) => {
    const query = event.target.value.trim();
    if (query.length < 2) { hideSuggestions(); return; }
    const users = await getSuggestions(query);
    renderSuggestions(users);
}, 300));

clearHistoryBtn.addEventListener('click', () => {
    saveHistory([]);
    renderHistory();
    usernameInput.value = '';
    profileSection.classList.add('hidden');
    reposSection.classList.add('hidden');
    clearError();
});

document.addEventListener('click', (event) => {
    if (!searchForm.contains(event.target)) hideSuggestions();
});

// 3.5 Сохранение формата
formatSelect.value = getFormatPreference();
formatSelect.addEventListener('change', (event) => {
    saveFormatPreference(event.target.value);
    // Мгновенно обновляем видимые числа без перезагрузки
    const countSpan = profileDiv.querySelector('span');
    if (countSpan) countSpan.textContent = `Публичных репозиториев: ${formatNumber(appState.totalPublicRepos)}`;
    const stars = reposList.querySelectorAll('span');
    // Для звёзд пересчитываем на основе текущего текста (упрощённо)
    stars.forEach(span => {
        const match = span.textContent.match(/⭐\s*([\d.,]+)/);
        if (match) {
            const raw = match[1].replace(/[,.]/g, '');
            span.textContent = `⭐ ${formatNumber(Number(raw))}`;
        }
    });
});

// --- Инициализация ---
document.addEventListener('DOMContentLoaded', () => {
    renderHistory();
    formatSelect.value = getFormatPreference();
});