"use strict";

// --- Состояние приложения ---
// ПОЧЕМУ единый объект appState? — Централизует данные приложения, упрощает отладку, предотвращает разброс глобальных переменных.
const appState = {
    currentUsername: "",
    currentPage: 1,
    perPage: 5,
    totalRepos: 0,
    isFetching: false,
    abortController: null,
    windowStart: 1,
};

const PAGES_PER_WINDOW = 5;

// --- DOM-элементы ---
// ПОЧЕМУ querySelector вверху? — Кэширование узлов при старте ускоряет работу (нет повторных обращений к DOM) и делает код чище.
const searchForm = document.querySelector("#search-form");
const usernameInput = document.querySelector("#username");
const searchBtn = document.querySelector("#searchBtn");
const errorDiv = document.querySelector("#error");
const loader = document.querySelector("#loader");
const profileSection = document.querySelector("#profile-section");
const profileDiv = document.querySelector("#profile");
const reposSection = document.querySelector("#repos-section");
const reposList = document.querySelector("#repos");
const historySection = document.querySelector("#history-section");
const historyDiv = document.querySelector("#history");
const clearHistoryBtn = document.querySelector("#clearHistory");
const suggestionsContainer = document.querySelector("#suggestions-container");
const perPageSelect = document.querySelector("#per-page");
const paginationDiv = document.querySelector("#pagination");
const scrollToTopBtn = document.querySelector("#scroll-to-top");
const sortBySelect = document.querySelector("#sort-by");

// --- Утилиты управления UI ---

// ПОЧЕМУ toggle класса hidden? — Разделение ответственности: CSS управляет видимостью, JS только переключает состояние. Легче поддерживать.
function showLoader() {
    loader.classList.remove("hidden"); // Убираем класс, чтобы показать лоадер
}

function hideLoader() {
    loader.classList.add("hidden"); // Добавляем класс, чтобы скрыть лоадер
}

function showError(message) {
    clearError(); // Сначала очищаем предыдущую ошибку
    errorDiv.textContent = message; // Вставляем текст ошибки
    errorDiv.classList.remove("hidden"); // Показываем блок ошибки
}

function clearError() {
    errorDiv.textContent = ""; // Очищаем текст
    errorDiv.classList.add("hidden"); // Скрываем блок
}

// ПОЧЕМУ while(firstChild)? — Безопасная очистка без innerHTML (исключает XSS), корректно удаляет все типы узлов.
function clearContainer(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild); // Удаляем первый дочерний элемент, пока они не закончатся
    }
}

function hideSuggestions() {
    suggestionsContainer.classList.add("hidden"); // Скрываем список подсказок
    clearContainer(suggestionsContainer); // Очищаем список от старых элементов
}

// --- Debounce ---
// ПОЧЕМУ debounce 300ms? — Баланс между отзывчивостью и экономией API-лимитов. Меньше 300мс вызовет спам запросов.
// ПОЧЕМУ setTimeout вместо setInterval? — setTimeout сбрасывает таймер при каждом вводе, выполняя функцию только после остановки набора.
function debounce(func, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer); // Сбрасываем предыдущий таймер
        // ПОЧЕМУ setTimeout? — Откладывает выполнение до прекращения ввода.
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

// --- Задержка для UX ---
// ПОЧЕМУ Promise-обёртка? — Позволяет использовать синтаксис async/await для таймеров, сохраняя линейную читаемость кода.
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms)); // Возвращаем промис, который разрешится через ms миллисекунд
}

// --- Нормализация (для тестов) ---
function normalizeUsername(username) {
    if (typeof username !== "string") return ""; // Если передано не строка, возвращаем пустую
    return username.trim().replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase(); // Убираем спецсимволы, пробелы и переводим в нижний регистр
}

// --- История поиска ---
const HISTORY_KEY = "gh_search_history";
const MAX_HISTORY = 3;

// ПОЧЕМУ try/catch вокруг localStorage? — Приватный режим браузера может выбрасывать исключения, которые без обработки заблокируют скрипт.
function loadHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; // Пытаемся прочитать и распарсить JSON
    } catch (error) {
        console.error("Ошибка чтения истории:", error);
        return []; // В случае ошибки возвращаем пустой массив
    }
}

function saveHistory(historyArray) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(historyArray)); // Сохраняем массив как строку JSON
    } catch (error) {
        console.error("Ошибка записи истории:", error);
    }
}

// ПОЧЕМУ filter + slice? — filter убирает дубликаты, slice строго лимитирует массив 3 элементами, сохраняя хронологию (новые сверху).
function updateHistory(username) {
    const clean = username.trim().toLowerCase();
    if (!clean) return; // Если имя пустое, ничего не делаем
    
    const history = loadHistory().filter((u) => u !== clean); // Удаляем дубликат, если он уже есть
    saveHistory([clean, ...history].slice(0, MAX_HISTORY)); // Добавляем новое имя в начало и обрезаем до 3
    renderHistory(); // Обновляем отображение
}

function renderHistory() {
    clearContainer(historyDiv); // Очищаем контейнер истории
    const history = loadHistory(); // Загружаем данные
    
    if (history.length === 0) {
        historySection.classList.add("hidden"); // Если истории нет, скрываем секцию
        return;
    }
    
    historySection.classList.remove("hidden"); // Иначе показываем секцию
    
    history.forEach((login) => {
        const tag = document.createElement("button"); // Создаем кнопку
        tag.textContent = login; // Вставляем логин
        tag.addEventListener("click", () => {
            usernameInput.value = login; // Подставляем логин в инпут
            searchForm.dispatchEvent(new Event("submit")); // Имитируем отправку формы
            hideSuggestions(); // Скрываем подсказки
        });
        historyDiv.appendChild(tag); // Добавляем кнопку в DOM
    });
}

// --- API Запросы ---

// ПОЧЕМУ async/await вместо .then()? — Код читается как синхронный, упрощает отладку и избавляет от вложенных цепочек.
async function getUser(username) {
    try {
        const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`);
        
        // ПОЧЕМУ ручная проверка response.ok? — fetch считает успешными даже ответы 404/500. Без проверки JSON распарсится некорректно.
        if (!response.ok) {
            if (response.status === 404) throw new Error("Пользователь не найден");
            if (response.status === 403) throw new Error("Превышен лимит запросов GitHub.");
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        // ПОЧЕМУ проверка Content-Type? — Защита от падений: если сервер вернёт HTML-ошибку вместо JSON, response.json() выбросит SyntaxError.
        const contentType = response.headers.get("Content-Type");
        if (!contentType?.includes("application/json")) throw new Error("Неверный формат ответа");
        
        return await response.json(); // Возвращаем распарсенные данные
    } catch (error) {
        // ПОЧЕМУ проверка error.name === 'TypeError'? — Отделяем сетевые сбои (нет интернета) от логических ошибок.
        if (error.name === "TypeError") throw new Error("Ошибка сети: проверьте интернет");
        throw error; // Пробрасываем ошибку дальше
    }
}

async function getRepos(username, page = 1, perPage = 5, sortBy = "updated_desc") {
    try {
        const [sortField, sortOrder] = sortBy.split("_"); // Разбираем строку сортировки на поле и направление
        
        // ПОЧЕМУ URLSearchParams вместо ручной строки? — Автоматическое экранирование спецсимволов, защита от XSS.
        const params = new URLSearchParams({
            sort: sortField,
            direction: sortOrder,
            per_page: perPage,
            page: page,
        });
        
        const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?${params}`);
        
        if (!response.ok) {
            throw new Error(`Не удалось загрузить репозитории: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        if (error.name === "TypeError") throw new Error("Ошибка сети при загрузке репозиториев");
        throw error;
    }
}

async function getSuggestions(query) {
    // ПОЧЕМУ AbortController? — Отменяет устаревшие запросы при быстром вводе, экономя трафик и предотвращая "гонку ответов".
    if (appState.abortController) appState.abortController.abort();
    appState.abortController = new AbortController();
    
    try {
        if (query.length < 2) return []; // Игнорируем короткие запросы
        
        const params = new URLSearchParams({ q: query, per_page: 5 });
        const response = await fetch(`https://api.github.com/search/users?${params}`, { signal: appState.abortController.signal });
        
        if (!response.ok) return []; // Если ошибка, возвращаем пустой массив
        const data = await response.json();
        return data.items || []; // Возвращаем массив пользователей или пустой
    } catch (error) {
        if (error.name !== "AbortError") console.warn("Ошибка подсказок:", error); // Игнорируем ошибку отмены
        return [];
    }
}

// --- Skeleton Loader ---
// ПОЧЕМУ скелетон + текст? — Пустой лоадер вызывает ощущение зависания. Текст + анимация дают явную обратную связь.
function showSkeletonLoader() {
    clearContainer(reposList); // Очищаем список репо
    reposSection.classList.remove("hidden"); // Показываем секцию
    
    const loadingText = document.createElement("div");
    loadingText.className = "loading-text";
    loadingText.textContent = "⏳ Загрузка...";
    loadingText.style.cssText = "text-align: center; padding: 20px; color: #586069; font-size: 1.1rem; font-weight: 500;";
    reposList.appendChild(loadingText); // Добавляем текст
    
    const skeletonContainer = document.createElement("div");
    skeletonContainer.className = "skeleton-container";
    const itemsCount = Math.min(parseInt(appState.perPage) || 5, 5); // Берем мин из perPage и 5

    for (let i = 0; i < itemsCount; i++) {
        const skeletonItem = document.createElement("div");
        skeletonItem.className = "skeleton-item";

        const titleLine = document.createElement("div");
        titleLine.className = "skeleton-line title";
        skeletonItem.appendChild(titleLine);

        const metaLine = document.createElement("div");
        metaLine.className = "skeleton-line meta";
        skeletonItem.appendChild(metaLine);

        const descLine1 = document.createElement("div");
        descLine1.className = "skeleton-line desc";
        skeletonItem.appendChild(descLine1);

        skeletonContainer.appendChild(skeletonItem);
    }
    reposList.appendChild(skeletonContainer); // Добавляем скелетоны
}

// --- Отрисовка ---
function renderProfile(data) {
    clearContainer(profileDiv);
    const card = document.createElement("div");
    card.className = "profile-card";

    const avatar = document.createElement("img");
    avatar.src = data.avatar_url || "";
    avatar.alt = `Аватар ${data.login}`;
    card.appendChild(avatar);

    const info = document.createElement("div");
    info.className = "profile-info";

    const nameEl = document.createElement("h2");
    nameEl.textContent = data.name || data.login;
    info.appendChild(nameEl);

    if (data.bio) {
        const bioEl = document.createElement("p");
        bioEl.textContent = data.bio;
        info.appendChild(bioEl);
    }

    // ПОЧЕМУ сохраняем в appState? — GitHub не отдаёт общее число страниц в ответе /repos. Берём точное значение из профиля.
    appState.totalRepos = data.public_repos || 0;
    const reposCountEl = document.createElement("span");
    reposCountEl.textContent = `Публичных репозиториев: ${appState.totalRepos}`;
    info.appendChild(reposCountEl);

    card.appendChild(info);
    profileDiv.appendChild(card);
    profileSection.classList.remove("hidden"); // Показываем секцию
}

function renderRepos(repos, append = false) {
    if (!append) clearContainer(reposList); // Очищаем список, если не режим добавления

    if (!repos || repos.length === 0) {
        if (!append) {
            const emptyMsg = document.createElement("li");
            emptyMsg.textContent = "Репозитории не найдены";
            reposList.appendChild(emptyMsg);
        }
        return;
    }

    repos.forEach((repo) => {
        const li = document.createElement("li");

        const link = document.createElement("a");
        link.href = repo.html_url || "#";
        link.textContent = repo.name || "Без названия";
        link.target = "_blank";
        // ПОЧЕМУ rel="noopener noreferrer"? — Защита от reverse tabnapping: новая страница не получает доступ к window.opener.
        link.rel = "noopener noreferrer";
        li.appendChild(link);

        if (repo.description) {
            const desc = document.createElement("p");
            desc.className = "repo-description";
            desc.textContent = repo.description;
            li.appendChild(desc);
        } else {
            const noDesc = document.createElement("p");
            noDesc.className = "no-description";
            noDesc.textContent = "Описание отсутствует";
            li.appendChild(noDesc);
        }

        const stats = document.createElement("div");
        stats.className = "repo-stats";

        const stars = document.createElement("span");
        stars.textContent = `⭐ ${repo.stargazers_count}`;
        stars.title = "Количество звёзд (popularity)";
        stats.appendChild(stars);

        const forks = document.createElement("span");
        forks.textContent = `🍴 ${repo.forks_count}`;
        forks.title = "Количество форков (forks)";
        stats.appendChild(forks);

        if (repo.language) {
            const lang = document.createElement("span");
            lang.textContent = `💻 ${repo.language}`;
            lang.title = `Язык программирования: ${repo.language}`;
            stats.appendChild(lang);
        } else {
            const lang = document.createElement("span");
            lang.textContent = "💻 Не указан";
            lang.title = "Язык программирования не указан";
            stats.appendChild(lang);
        }

        const updated = document.createElement("span");
        const updateDate = new Date(repo.updated_at);
        const shortDate = updateDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
        updated.textContent = `📅 ${shortDate}`;
        updated.title = `Последнее обновление: ${updateDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}`;
        stats.appendChild(updated);

        li.appendChild(stats);
        reposList.appendChild(li);
    });

    if (!append) reposSection.classList.remove("hidden"); // Показываем секцию
}

// --- Scroll to Top ---
function initScrollToTop() {
    if (!scrollToTopBtn) return;
    
    scrollToTopBtn.addEventListener("click", () => {
        // ПОЧЕМУ behavior: 'smooth'? — Современный UX-стандарт: плавная прокрутка воспринимается мягче.
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    window.addEventListener("scroll", () => {
        // ПОЧЕМУ порог 25% высоты? — Кнопка появляется достаточно рано, чтобы быть полезной, но не мелькает при микро-скролле.
        const showThreshold = window.innerHeight / 4;
        if (window.pageYOffset > showThreshold) {
            scrollToTopBtn.classList.remove("hidden"); // Показываем кнопку
        } else {
            scrollToTopBtn.classList.add("hidden"); // Скрываем кнопку
        }
    });
}

// --- Создание кнопки пагинации ---
function createPageButton(pageNum) {
    const btn = document.createElement("button");
    btn.textContent = pageNum;
    
    if (pageNum === appState.currentPage) {
        btn.classList.add("active"); // Выделяем активную страницу
        // ПОЧЕМУ disabled на активной странице? — Визуально фиксирует состояние и блокирует повторный запрос.
        btn.disabled = true;
    }
    
    btn.addEventListener("click", () => {
        appState.currentPage = pageNum; // Обновляем состояние
        fetchAndRenderRepos(); // Загружаем данные
    });

    return btn;
}

// --- Пагинация ---
function renderPagination(totalPages) {
    clearContainer(paginationDiv);
    
    if (totalPages <= 1) {
        paginationDiv.classList.add("hidden"); // Скрываем, если всего 1 страница
        return;
    }
    
    paginationDiv.classList.remove("hidden"); // Показываем пагинацию

    // === ЛОГИКА: два режима пагинации ===
    // ПОЧЕМУ два режима? — ≤10 страниц: показываем всё. >10: окно из 5 (экономим место, избегаем "полотна" кнопок).
    if (totalPages <= 10) {
        // РЕЖИМ 1: Простая пагинация (все кнопки)
        if (appState.currentPage > 1) {
            const prevBtn = document.createElement("button");
            prevBtn.className = "nav-btn prev";
            prevBtn.innerHTML = "← Назад";
            prevBtn.addEventListener("click", () => {
                if (appState.currentPage > 1) {
                    appState.currentPage--; // Переходим назад
                    fetchAndRenderRepos();
                }
            });
            paginationDiv.appendChild(prevBtn);
        }

        for (let i = 1; i <= totalPages; i++) {
            paginationDiv.appendChild(createPageButton(i)); // Рисуем все страницы
        }

        if (appState.currentPage < totalPages) {
            const nextBtn = document.createElement("button");
            nextBtn.className = "nav-btn next";
            nextBtn.innerHTML = "<span>Вперёд →</span>";
            nextBtn.addEventListener("click", () => {
                if (appState.currentPage < totalPages) {
                    appState.currentPage++; // Переходим вперед
                    fetchAndRenderRepos();
                }
            });
            paginationDiv.appendChild(nextBtn);
        }
        return;
    }

    // РЕЖИМ 2: Оконная пагинация (для больших списков)
    if (appState.currentPage < appState.windowStart) {
        appState.windowStart = appState.currentPage;
    } else if (appState.currentPage >= appState.windowStart + PAGES_PER_WINDOW) {
        appState.windowStart = appState.currentPage - PAGES_PER_WINDOW + 1;
    }
    
    if (appState.windowStart < 1) appState.windowStart = 1;
    if (appState.windowStart + PAGES_PER_WINDOW - 1 > totalPages) {
        appState.windowStart = Math.max(1, totalPages - PAGES_PER_WINDOW + 1);
    }
    
    const windowEnd = Math.min(appState.windowStart + PAGES_PER_WINDOW - 1, totalPages);

    if (appState.windowStart > 1) {
        const prevBtn = document.createElement("button");
        prevBtn.className = "nav-btn prev";
        prevBtn.innerHTML = "← Назад";
        prevBtn.addEventListener("click", () => {
            appState.windowStart = Math.max(1, appState.windowStart - PAGES_PER_WINDOW); // Сдвигаем окно назад
            appState.currentPage = appState.windowStart;
            fetchAndRenderRepos();
        });
        paginationDiv.appendChild(prevBtn);
    }

    for (let i = appState.windowStart; i <= windowEnd; i++) {
        paginationDiv.appendChild(createPageButton(i)); // Рисуем кнопки текущего окна
    }

    if (windowEnd < totalPages) {
        const ellipsis = document.createElement("button");
        ellipsis.textContent = "...";
        ellipsis.className = "ellipsis";
        ellipsis.disabled = true;
        paginationDiv.appendChild(ellipsis);
        
        paginationDiv.appendChild(createPageButton(totalPages)); // Кнопка последней страницы

        const nextBtn = document.createElement("button");
        nextBtn.className = "nav-btn next";
        nextBtn.innerHTML = "<span>Вперёд →</span>";
        nextBtn.addEventListener("click", () => {
            const newWindowStart = appState.windowStart + PAGES_PER_WINDOW;
            if (newWindowStart <= totalPages) {
                appState.windowStart = newWindowStart; // Сдвигаем окно вперед
                appState.currentPage = appState.windowStart;
                fetchAndRenderRepos();
            }
        });
        paginationDiv.appendChild(nextBtn);
    }
}

// --- Основная функция постраничной загрузки ---
async function fetchAndRenderRepos() {
    // ПОЧЕМУ флаг isFetching? — Защита от гонки запросов: второй запрос не начнётся, пока не завершится первый.
    if (appState.isFetching) return;
    appState.isFetching = true;

    // ПОЧЕМУ блокируем UI? — Предотвращаем повторные клики и лишнюю нагрузку на API.
    searchBtn.disabled = true;
    perPageSelect.disabled = true;
    if (sortBySelect) sortBySelect.disabled = true;
    
    showSkeletonLoader(); // Показываем скелетон
    showLoader();

    try {
        const perPageValue = parseInt(appState.perPage);
        // ПОЧЕМУ Promise.all? — Ждём одновременно запрос данных и искусственную задержку для UX.
        const [reposData] = await Promise.all([
            getRepos(appState.currentUsername, appState.currentPage, perPageValue, sortBySelect ? sortBySelect.value : "updated_desc"),
            delay(700), // Минимальное время показа скелетона
        ]);

        renderRepos(reposData, false); // Отрисовываем данные
        
        const totalPages = appState.totalRepos > 0 ? Math.ceil(appState.totalRepos / perPageValue) : 1;
        renderPagination(totalPages); // Обновляем пагинацию
        
        reposSection.scrollIntoView({ behavior: "smooth", block: "start" }); // Прокручиваем к списку
    } catch (error) {
        showError(error.message || "Ошибка загрузки репозиториев");
        console.error("Fetch repos error:", error);
    } finally {
        // ПОЧЕМУ finally? — Гарантирует разблокировку интерфейса независимо от успеха или падения запроса.
        hideLoader();
        searchBtn.disabled = false;
        perPageSelect.disabled = false;
        if (sortBySelect) sortBySelect.disabled = false;
        appState.isFetching = false;
    }
}

function updateReposDisplay() {
    appState.currentPage = 1; // Сброс на первую страницу
    appState.windowStart = 1;
    fetchAndRenderRepos(); // Запускаем загрузку
}

function renderSuggestions(users) {
    clearContainer(suggestionsContainer);
    
    if (!users || users.length === 0) {
        hideSuggestions(); // Скрываем, если нет подсказок
        return;
    }
    
    users.forEach((user) => {
        const li = document.createElement("li");
        li.textContent = user.login;
        li.addEventListener("click", () => {
            usernameInput.value = user.login;
            hideSuggestions();
            searchForm.dispatchEvent(new Event("submit")); // Имитируем поиск
        });
        suggestionsContainer.appendChild(li);
    });
    suggestionsContainer.classList.remove("hidden"); // Показываем список
}

// --- Обработчики событий ---
searchForm.addEventListener("submit", async (event) => {
    event.preventDefault(); // Предотвращаем перезагрузку страницы
    hideSuggestions();
    clearError();
    profileSection.classList.add("hidden"); // Скрываем старые данные
    reposSection.classList.add("hidden");
    paginationDiv.classList.add("hidden");

    const rawUsername = usernameInput.value.trim();
    
    if (!rawUsername) {
        showError("Введите имя пользователя GitHub");
        return;
    }
    if (rawUsername.length > 256) {
        showError("Имя не должно превышать 256 символов");
        return;
    }

    appState.currentUsername = rawUsername.trim().toLowerCase();
    appState.currentPage = 1;
    appState.windowStart = 1;
    usernameInput.value = appState.currentUsername;

    searchBtn.disabled = true;
    showLoader();

    try {
        // ПОЧЕМУ Promise.all для поиска? — Профиль и репозитории независимы. Параллельный запрос сокращает время загрузки.
        const [userData, reposData] = await Promise.all([
            getUser(appState.currentUsername),
            getRepos(appState.currentUsername, 1, parseInt(appState.perPage), sortBySelect ? sortBySelect.value : "updated_desc"),
            delay(700),
        ]);
        
        renderProfile(userData);
        renderRepos(reposData, false);
        
        const perPage = parseInt(appState.perPage);
        const totalPages = Math.ceil(userData.public_repos / perPage);
        renderPagination(totalPages);

        updateHistory(appState.currentUsername); // Сохраняем в историю
    } catch (error) {
        showError(error.message || "Ошибка загрузки данных");
        console.error("Fetch error:", error);
    } finally {
        hideLoader();
        searchBtn.disabled = false;
    }
});

perPageSelect.addEventListener("change", (event) => {
    appState.perPage = event.target.value; // Обновляем состояние
    updateReposDisplay(); // Перезагружаем список
});

if (sortBySelect) {
    sortBySelect.addEventListener("change", () => {
        appState.currentPage = 1;
        appState.windowStart = 1;
        fetchAndRenderRepos(); // Перезагружаем с новой сортировкой
    });
}

usernameInput.addEventListener("input", debounce(async (event) => {
    const query = event.target.value.trim();
    if (query.length < 2) {
        hideSuggestions();
        return;
    }
    const users = await getSuggestions(query);
    renderSuggestions(users);
}, 300));

clearHistoryBtn.addEventListener("click", () => {
    saveHistory([]); // Очищаем хранилище
    renderHistory(); // Обновляем UI
    usernameInput.value = "";
    profileSection.classList.add("hidden");
    reposSection.classList.add("hidden");
    paginationDiv.classList.add("hidden");
    clearError();
});

// ПОЧЕМУ делегирование клика на document? — Закрывает подсказки при клике вне формы, не требуя обработчиков на каждом элементе.
document.addEventListener("click", (event) => {
    if (!searchForm.contains(event.target)) hideSuggestions();
});

// --- Инициализация ---
// ПОЧЕМУ DOMContentLoaded? — Гарантирует, что DOM построен до выполнения скрипта, исключая ошибки "element is null".
document.addEventListener("DOMContentLoaded", () => {
    renderHistory();
    appState.perPage = perPageSelect.value;
    appState.windowStart = 1;
    initScrollToTop();
    if (sortBySelect) {
        sortBySelect.value = "updated_desc";
    }
});

// --- Экспорт для тестов ---
if (typeof window !== "undefined") {
    window.normalizeUsername = normalizeUsername;
    window.debounce = debounce;
    window.delay = delay;
}