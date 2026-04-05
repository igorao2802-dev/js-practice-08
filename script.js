"use strict";

// --- Состояние приложения ---
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

// --- DOM-элементы (ИСПРАВЛЕНЫ ПРОБЕЛЫ В СЕЛЕКТОРАХ) ---
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

// --- Утилиты управления UI ---
function showLoader() {
  loader.classList.remove("hidden");
}
function hideLoader() {
  loader.classList.add("hidden");
}

function showError(message) {
  clearError();
  errorDiv.textContent = message;
  errorDiv.classList.remove("hidden");
}

function clearError() {
  errorDiv.textContent = "";
  errorDiv.classList.add("hidden");
}

function clearContainer(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function hideSuggestions() {
  suggestionsContainer.classList.add("hidden");
  clearContainer(suggestionsContainer);
}

// --- Debounce ---
function debounce(func, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

// --- Utility: минимальная задержка для UX ---
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- История поиска ---
const HISTORY_KEY = "gh_search_history";
const MAX_HISTORY = 3;

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (error) {
    console.error("Ошибка чтения истории:", error);
    return [];
  }
}

function saveHistory(historyArray) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyArray));
  } catch (error) {
    console.error("Ошибка записи истории:", error);
  }
}

function updateHistory(username) {
  const clean = username.trim().toLowerCase();
  if (!clean) return;
  const history = loadHistory().filter((u) => u !== clean);
  saveHistory([clean, ...history].slice(0, MAX_HISTORY));
  renderHistory();
}

function renderHistory() {
  clearContainer(historyDiv);
  const history = loadHistory();
  if (history.length === 0) {
    historySection.classList.add("hidden");
    return;
  }
  historySection.classList.remove("hidden");
  history.forEach((login) => {
    const tag = document.createElement("button");
    tag.textContent = login;
    tag.addEventListener("click", () => {
      usernameInput.value = login;
      searchForm.dispatchEvent(new Event("submit"));
      hideSuggestions();
    });
    historyDiv.appendChild(tag);
  });
}

// --- API Запросы ---
async function getUser(username) {
  try {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}`,
    );
    if (!response.ok) {
      if (response.status === 404) throw new Error("Пользователь не найден");
      if (response.status === 403)
        throw new Error("Превышен лимит запросов GitHub.");
      throw new Error(`Ошибка сервера: ${response.status}`);
    }
    const contentType = response.headers.get("Content-Type");
    if (!contentType?.includes("application/json"))
      throw new Error("Неверный формат ответа");
    return await response.json();
  } catch (error) {
    if (error.name === "TypeError")
      throw new Error("Ошибка сети: проверьте интернет");
    throw error;
  }
}

// Запрос репозиториев с параметрами page и per_page
async function getRepos(username, page = 1, perPage = 5) {
  try {
    const params = new URLSearchParams({
      sort: "updated",
      per_page: perPage,
      page: page,
    });
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?${params}`,
    );
    if (!response.ok)
      throw new Error(`Не удалось загрузить репозитории: ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === "TypeError")
      throw new Error("Ошибка сети при загрузке репозиториев");
    throw error;
  }
}

async function getSuggestions(query) {
  if (appState.abortController) appState.abortController.abort();
  appState.abortController = new AbortController();

  try {
    if (query.length < 2) return [];
    const params = new URLSearchParams({ q: query, per_page: 5 });
    const response = await fetch(
      `https://api.github.com/search/users?${params}`,
      {
        signal: appState.abortController.signal,
      },
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    if (error.name !== "AbortError") console.warn("Ошибка подсказок:", error);
    return [];
  }
}

// --- Skeleton Loader (забавная анимация вместо "Загрузка...") ---
function showSkeletonLoader() {
  clearContainer(reposList);

  // ПОЧЕМУ снимаем hidden? — Секция репозиториев должна быть видима,
  // чтобы пользователь видел скелетоны во время загрузки.
  reposSection.classList.remove("hidden");

  const skeletonContainer = document.createElement("div");
  skeletonContainer.className = "skeleton-container";

  // Показываем 5 скелетонов (или меньше, если perPage меньше)
  const itemsCount = Math.min(parseInt(appState.perPage) || 5, 5);

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

    const descLine2 = document.createElement("div");
    descLine2.className = "skeleton-line desc";
    skeletonItem.appendChild(descLine2);

    skeletonContainer.appendChild(skeletonItem);
  }

  reposList.appendChild(skeletonContainer);
}

// --- Отрисовка данных ---
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

  const reposCountEl = document.createElement("span");
  // ✅ СОХРАНЯЕМ ОБЩЕЕ ЧИСЛО РЕПОЗИТОРИЕВ В СОСТОЯНИЕ ПРИЛОЖЕНИЯ
  appState.totalRepos = data.public_repos || 0;

  reposCountEl.textContent = `Публичных репозиториев: ${appState.totalRepos}`;
  info.appendChild(reposCountEl);

  card.appendChild(info);
  profileDiv.appendChild(card);
  profileSection.classList.remove("hidden");
}

function renderRepos(repos, append = false) {
  if (!append) clearContainer(reposList);

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
    stats.appendChild(stars);

    const forks = document.createElement("span");
    forks.textContent = `🍴 ${repo.forks_count}`;
    stats.appendChild(forks);

    if (repo.language) {
      const lang = document.createElement("span");
      lang.textContent = `💻 ${repo.language}`;
      stats.appendChild(lang);
    }

    li.appendChild(stats);
    reposList.appendChild(li);
  });

  if (!append) reposSection.classList.remove("hidden");
}

// --- Scroll to Top Button ---
function initScrollToTop() {
  if (!scrollToTopBtn) return;
  scrollToTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  window.addEventListener("scroll", () => {
    const showThreshold = window.innerHeight;
    if (window.pageYOffset > showThreshold / 4) {
      scrollToTopBtn.classList.remove("hidden");
    } else {
      scrollToTopBtn.classList.add("hidden");
    }
  });
}

// ==========================================
// ✅ ИСПРАВЛЕНИЕ: ДОБАВЛЕНА ФУНКЦИЯ createPageButton
// ==========================================
function createPageButton(pageNum) {
  const btn = document.createElement("button");
  btn.textContent = pageNum;

  if (pageNum === appState.currentPage) {
    btn.classList.add("active");
    btn.disabled = true;
  }

  btn.addEventListener("click", () => {
    appState.currentPage = pageNum;
    // ✅ Теперь при клике вызывает функцию загрузки
    fetchAndRenderRepos();
  });

  return btn;
}

async function fetchAndRenderRepos() {
  if (appState.isFetching) return;
  appState.isFetching = true;

  searchBtn.disabled = true;
  perPageSelect.disabled = true;
  showSkeletonLoader();
  showLoader();

  try {
    // ПОЧЕМУ Promise.all с delay? — Гарантируем минимальное время показа скелетона,
    // чтобы анимация была заметна пользователю при переключении страниц.
    const [reposData] = await Promise.all([
      getRepos(
        appState.currentUsername,
        appState.currentPage,
        parseInt(appState.perPage),
      ),
      delay(500), // Чуть меньше для пагинации (500мс)
    ]);

    renderRepos(reposData, false);

    const perPage = parseInt(appState.perPage);
    const hasMore = reposData.length === perPage;
    const totalPages = hasMore
      ? appState.currentPage + 5
      : appState.currentPage;

    renderPagination(Math.max(appState.currentPage, totalPages));
    reposSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showError(error.message || "Ошибка загрузки репозиториев");
    console.error("Fetch repos error:", error);
  } finally {
    hideLoader();
    searchBtn.disabled = false;
    perPageSelect.disabled = false;
    appState.isFetching = false;
  }
}

// --- Пагинация ---
function renderPagination(totalPages) {
  clearContainer(paginationDiv);

  // 1. Рассчитываем точное количество страниц на основе данных из профиля
  const perPage =
    appState.perPage === "all"
      ? appState.totalRepos
      : parseInt(appState.perPage);
  const finalTotalPages =
    appState.totalRepos > 0 ? Math.ceil(appState.totalRepos / perPage) : 0;

  // Если страниц 0 или 1, пагинация не нужна
  if (finalTotalPages <= 1) {
    paginationDiv.classList.add("hidden");
    return;
  }
  paginationDiv.classList.remove("hidden");

  // 2. Вычисляем границы текущего "окна" из 5 кнопок
  // Логика: (страница - 1) / 5 округляем вниз, умножаем на 5 и прибавляем 1
  // Пример: стр 1 -> начало 1. Стр 6 -> начало 6. Стр 12 -> начало 11.
  const windowStart =
    Math.floor((appState.currentPage - 1) / PAGES_PER_WINDOW) *
      PAGES_PER_WINDOW +
    1;
  const windowEnd = Math.min(
    windowStart + PAGES_PER_WINDOW - 1,
    finalTotalPages,
  );

  // 3. Кнопка "Назад" (Переход на 5 страниц назад)
  // Появляется, если мы не в самом первом блоке
  if (windowStart > 1) {
    const prevBtn = document.createElement("button");
    prevBtn.className = "nav-btn prev";
    prevBtn.innerHTML = "<span>← Назад</span>";
    prevBtn.addEventListener("click", () => {
      // Прыгаем на начало предыдущего блока (например, со стр 6 на стр 1)
      appState.currentPage = windowStart - PAGES_PER_WINDOW;
      fetchAndRenderRepos();
    });
    paginationDiv.appendChild(prevBtn);
  }

  // 4. Рисуем номера страниц внутри текущего окна (1, 2, 3, 4, 5 или 6, 7, 8, 9, 10)
  for (let i = windowStart; i <= windowEnd; i++) {
    paginationDiv.appendChild(createPageButton(i));
  }

  // 5. Кнопка "Вперёд" (Переход на 5 страниц вперёд)
  // Появляется, если есть страницы после текущего блока
  if (windowEnd < finalTotalPages) {
    // Многоточие и кнопка последней страницы (для быстрого перехода в конец)
    const ellipsis = document.createElement("button");
    ellipsis.textContent = "...";
    ellipsis.className = "ellipsis";
    ellipsis.disabled = true;
    paginationDiv.appendChild(ellipsis);

    paginationDiv.appendChild(createPageButton(finalTotalPages));

    // Сама кнопка Вперёд
    const nextBtn = document.createElement("button");
    nextBtn.className = "nav-btn next";
    nextBtn.innerHTML = "<span>Вперёд →</span>";
    nextBtn.addEventListener("click", () => {
      // Прыгаем на начало следующего блока (например, со стр 1 на стр 6)
      const nextPage = windowStart + PAGES_PER_WINDOW;
      if (nextPage <= finalTotalPages) {
        appState.currentPage = nextPage;
        fetchAndRenderRepos();
      }
    });
    paginationDiv.appendChild(nextBtn);
  }
}

// --- Обработчики событий ---
searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideSuggestions();
  clearError();
  profileSection.classList.add("hidden");
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
    // ПОЧЕМУ Promise.all с delay? — Гарантируем минимальное время показа скелетона (700мс),
    // чтобы пользователь успел увидеть анимацию загрузки, даже если API ответил мгновенно.
    const [userData, reposData] = await Promise.all([
      getUser(appState.currentUsername),
      getRepos(appState.currentUsername, 1, parseInt(appState.perPage)),
      delay(700), // Минимальная задержка для UX
    ]);

    renderProfile(userData);
    renderRepos(reposData, false);

    // Рассчитываем точное количество страниц
    const perPage = parseInt(appState.perPage);
    const totalPages = Math.ceil(userData.public_repos / perPage);
    renderPagination(totalPages);

    updateHistory(appState.currentUsername);
  } catch (error) {
    showError(error.message || "Ошибка загрузки данных");
    console.error("Fetch error:", error);
  } finally {
    hideLoader();
    searchBtn.disabled = false;
  }
});

perPageSelect.addEventListener("change", () => {
  appState.perPage = perPageSelect.value;
  appState.currentPage = 1;
  fetchAndRenderRepos(); // Перезагрузка при смене кол-ва на странице
});

usernameInput.addEventListener(
  "input",
  debounce(async (event) => {
    const query = event.target.value.trim();
    if (query.length < 2) {
      hideSuggestions();
      return;
    }
    const users = await getSuggestions(query);
    renderSuggestions(users);
  }, 300),
);

clearHistoryBtn.addEventListener("click", () => {
  saveHistory([]);
  renderHistory();
  usernameInput.value = "";
  profileSection.classList.add("hidden");
  reposSection.classList.add("hidden");
  paginationDiv.classList.add("hidden");
  clearError();
});

document.addEventListener("click", (event) => {
  if (!searchForm.contains(event.target)) hideSuggestions();
});

// --- Инициализация ---
document.addEventListener("DOMContentLoaded", () => {
  renderHistory();
  appState.perPage = perPageSelect.value;
  appState.windowStart = 1;
  initScrollToTop();
});
