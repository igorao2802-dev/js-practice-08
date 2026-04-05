("use strict");

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

// --- DOM-элементы ---
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

// --- Утилиты ---
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

// --- Задержка для UX ---
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

async function getRepos(
  username,
  page = 1,
  perPage = 5,
  sortBy = "updated_desc",
) {
  try {
    const [sortField, sortOrder] = sortBy.split("_");
    const params = new URLSearchParams({
      sort: sortField,
      direction: sortOrder,
      per_page: perPage,
      page: page,
    });

    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?${params}`,
    );
    if (!response.ok) {
      throw new Error(`Не удалось загрузить репозитории: ${response.status}`);
    }
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
      { signal: appState.abortController.signal },
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    if (error.name !== "AbortError") console.warn("Ошибка подсказок:", error);
    return [];
  }
}

// --- Skeleton Loader ---
function showSkeletonLoader() {
  clearContainer(reposList);
  reposSection.classList.remove("hidden");

  const loadingText = document.createElement("div");
  loadingText.className = "loading-text";
  loadingText.textContent = "⏳ Загрузка...";
  loadingText.style.cssText =
    "text-align: center; padding: 20px; color: #586069; font-size: 1.1rem; font-weight: 500;";
  reposList.appendChild(loadingText);

  const skeletonContainer = document.createElement("div");
  skeletonContainer.className = "skeleton-container";
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

    skeletonContainer.appendChild(skeletonItem);
  }
  reposList.appendChild(skeletonContainer);
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

  appState.totalRepos = data.public_repos || 0;
  const reposCountEl = document.createElement("span");
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
    const shortDate = updateDate.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
    updated.textContent = `📅 ${shortDate}`;
    updated.title = `Последнее обновление: ${updateDate.toLocaleDateString(
      "ru-RU",
      {
        day: "2-digit",
        month: "long",
        year: "numeric",
      },
    )}`;
    stats.appendChild(updated);

    li.appendChild(stats);
    reposList.appendChild(li);
  });

  if (!append) reposSection.classList.remove("hidden");
}

// --- Scroll to Top ---
function initScrollToTop() {
  if (!scrollToTopBtn) return;

  scrollToTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", () => {
    const showThreshold = window.innerHeight / 4;
    if (window.pageYOffset > showThreshold) {
      scrollToTopBtn.classList.remove("hidden");
    } else {
      scrollToTopBtn.classList.add("hidden");
    }
  });
}

// --- Создание кнопки пагинации ---
function createPageButton(pageNum) {
  const btn = document.createElement("button");
  btn.textContent = pageNum;

  if (pageNum === appState.currentPage) {
    btn.classList.add("active");
    btn.disabled = true;
  }

  btn.addEventListener("click", () => {
    appState.currentPage = pageNum;
    fetchAndRenderRepos();
  });

  return btn;
}

// --- Пагинация ---
function renderPagination(totalPages) {
  clearContainer(paginationDiv);

  if (totalPages <= 1) {
    paginationDiv.classList.add("hidden");
    return;
  }

  paginationDiv.classList.remove("hidden");

  if (totalPages <= 10) {
    if (appState.currentPage > 1) {
      const prevBtn = document.createElement("button");
      prevBtn.className = "nav-btn prev";
      prevBtn.innerHTML = "<span>← Назад</span>";
      prevBtn.addEventListener("click", () => {
        if (appState.currentPage > 1) {
          appState.currentPage--;
          fetchAndRenderRepos();
        }
      });
      paginationDiv.appendChild(prevBtn);
    }

    for (let i = 1; i <= totalPages; i++) {
      paginationDiv.appendChild(createPageButton(i));
    }

    if (appState.currentPage < totalPages) {
      const nextBtn = document.createElement("button");
      nextBtn.className = "nav-btn next";
      nextBtn.innerHTML = "<span>Вперёд →</span>";
      nextBtn.addEventListener("click", () => {
        if (appState.currentPage < totalPages) {
          appState.currentPage++;
          fetchAndRenderRepos();
        }
      });
      paginationDiv.appendChild(nextBtn);
    }
    return;
  }

  if (appState.currentPage < appState.windowStart) {
    appState.windowStart = appState.currentPage;
  } else if (appState.currentPage >= appState.windowStart + PAGES_PER_WINDOW) {
    appState.windowStart = appState.currentPage - PAGES_PER_WINDOW + 1;
  }

  if (appState.windowStart < 1) appState.windowStart = 1;
  if (appState.windowStart + PAGES_PER_WINDOW - 1 > totalPages) {
    appState.windowStart = Math.max(1, totalPages - PAGES_PER_WINDOW + 1);
  }

  const windowEnd = Math.min(
    appState.windowStart + PAGES_PER_WINDOW - 1,
    totalPages,
  );

  if (appState.windowStart > 1) {
    const prevBtn = document.createElement("button");
    prevBtn.className = "nav-btn prev";
    prevBtn.innerHTML = "<span>← Назад</span>";
    prevBtn.addEventListener("click", () => {
      appState.windowStart = Math.max(
        1,
        appState.windowStart - PAGES_PER_WINDOW,
      );
      appState.currentPage = appState.windowStart;
      fetchAndRenderRepos();
    });
    paginationDiv.appendChild(prevBtn);
  }

  for (let i = appState.windowStart; i <= windowEnd; i++) {
    paginationDiv.appendChild(createPageButton(i));
  }

  if (windowEnd < totalPages) {
    const ellipsis = document.createElement("button");
    ellipsis.textContent = "...";
    ellipsis.className = "ellipsis";
    ellipsis.disabled = true;
    paginationDiv.appendChild(ellipsis);

    paginationDiv.appendChild(createPageButton(totalPages));

    const nextBtn = document.createElement("button");
    nextBtn.className = "nav-btn next";
    nextBtn.innerHTML = "<span>Вперёд →</span>";
    nextBtn.addEventListener("click", () => {
      const newWindowStart = appState.windowStart + PAGES_PER_WINDOW;
      if (newWindowStart <= totalPages) {
        appState.windowStart = newWindowStart;
        appState.currentPage = appState.windowStart;
        fetchAndRenderRepos();
      }
    });
    paginationDiv.appendChild(nextBtn);
  }
}

// --- Основная функция постраничной загрузки репозиториев ---
async function fetchAndRenderRepos() {
  if (appState.isFetching) return;
  appState.isFetching = true;

  // Блокируем интерфейс на время запроса
  searchBtn.disabled = true;
  perPageSelect.disabled = true;
  if (sortBySelect) sortBySelect.disabled = true;

  showSkeletonLoader();
  showLoader();

  try {
    // Теперь perPage всегда число, так как в HTML нет опции "all"
    const perPageValue = parseInt(appState.perPage);

    const [reposData] = await Promise.all([
      getRepos(
        appState.currentUsername,
        appState.currentPage,
        perPageValue,
        sortBySelect ? sortBySelect.value : "updated_desc",
      ),
      delay(700),
    ]);

    renderRepos(reposData, false);

    // Рассчитываем точное количество страниц
    const totalPages =
      appState.totalRepos > 0
        ? Math.ceil(appState.totalRepos / perPageValue)
        : 1;

    renderPagination(totalPages);
    reposSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showError(error.message || "Ошибка загрузки репозиториев");
    console.error("Fetch repos error:", error);
  } finally {
    hideLoader();
    searchBtn.disabled = false;
    perPageSelect.disabled = false;
    if (sortBySelect) sortBySelect.disabled = false;
    appState.isFetching = false;
  }
}

function updateReposDisplay() {
  appState.currentPage = 1;
  appState.windowStart = 1;
  fetchAndRenderRepos();
}

function renderSuggestions(users) {
  clearContainer(suggestionsContainer);
  if (!users || users.length === 0) {
    hideSuggestions();
    return;
  }
  users.forEach((user) => {
    const li = document.createElement("li");
    li.textContent = user.login;
    li.addEventListener("click", () => {
      usernameInput.value = user.login;
      hideSuggestions();
      searchForm.dispatchEvent(new Event("submit"));
    });
    suggestionsContainer.appendChild(li);
  });
  suggestionsContainer.classList.remove("hidden");
}

// --- Обработчики ---
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
    const [userData, reposData] = await Promise.all([
      getUser(appState.currentUsername),
      getRepos(
        appState.currentUsername,
        1,
        parseInt(appState.perPage),
        sortBySelect ? sortBySelect.value : "updated_desc",
      ),
      delay(700),
    ]);
    renderProfile(userData);
    renderRepos(reposData, false);

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

perPageSelect.addEventListener("change", (event) => {
  appState.perPage = event.target.value;
  updateReposDisplay();
});

if (sortBySelect) {
  sortBySelect.addEventListener("change", () => {
    appState.currentPage = 1;
    appState.windowStart = 1;
    fetchAndRenderRepos();
  });
}

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

  if (sortBySelect) {
    sortBySelect.value = "updated_desc";
  }
});
