'use strict';

// TODO: Получить ссылки на DOM-элементы
const searchForm = document.getElementById('search-form');
const usernameInput = document.getElementById('username');
const searchBtn = document.getElementById('searchBtn');
const errorDiv = document.getElementById('error');
const loader = document.getElementById('loader');
const profileSection = document.getElementById('profile-section');
const profileDiv = document.getElementById('profile');
const reposSection = document.getElementById('repos-section');
const reposList = document.getElementById('repos');
const historySection = document.getElementById('history-section');
const historyDiv = document.getElementById('history');
const clearHistoryBtn = document.getElementById('clearHistory');

// TODO: Функция для получения данных профиля пользователя
async function getUser(username) {
  // ПОЧЕМУ async/await? — Позволяет писать асинхронный код как синхронный, проще читать.
  // ПОЧЕМУ try/catch? — Для обработки ошибок сети и исключений.
  // ПОЧЕМУ проверяем response.ok? — fetch не выбрасывает ошибку при 404, нужно проверять вручную.
}

// TODO: Функция для получения репозиториев пользователя
async function getRepos(username) {
  // Аналогично getUser, fetch репозиториев
}

// TODO: Функция для отображения профиля
function renderProfile(data) {
  // Создайте элементы через createElement, вставьте данные через textContent
  // Не используйте innerHTML для данных от API!
}

// TODO: Функция для отображения репозиториев
function renderRepos(repos) {
  // Создайте список li с ссылками и описаниями
}

// TODO: Функция для отображения ошибок
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');
}

// TODO: Функция для очистки ошибок
function clearError() {
  errorDiv.textContent = '';
  errorDiv.classList.add('hidden');
}

// TODO: Функция для управления loader
function showLoader() {
  loader.classList.remove('hidden');
}

function hideLoader() {
  loader.classList.add('hidden');
}

// TODO: Обработчик формы поиска
searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  profileSection.classList.add('hidden');
  reposSection.classList.add('hidden');
  historySection.classList.add('hidden');

  const username = usernameInput.value.trim();
  if (!username) {
    showError('Введите имя пользователя GitHub');
    return;
  }

  searchBtn.disabled = true;
  showLoader();

  // TODO: Вызвать getUser и getRepos, отрисовать данные, обработать ошибки

  hideLoader();
  searchBtn.disabled = false;
});

// TODO: Функции для работы с историей поиска в localStorage

// TODO: Инициализация приложения — загрузка истории и др.