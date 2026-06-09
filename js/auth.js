// js/auth.js
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('loginForm');
    const errorEl = document.getElementById('error');
    const logoutBtn = document.getElementById('logoutBtn');
    const exportBtn = document.getElementById('exportPdfBtn');

    // обработка логина (index.html)
    if (loginForm) {
      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (username === MD_CONFIG.credentials.username &&
            password === MD_CONFIG.credentials.password) {
          sessionStorage.setItem('md_auth', MD_CONFIG.authTokenValue);
          sessionStorage.setItem('md_user', username);
          window.location.href = 'dashboard.html';
        } else {
          if (errorEl) errorEl.textContent = 'Неверный логин или пароль';
        }
      });
    }

    // кнопка выхода (dashboard.html)
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        sessionStorage.removeItem('md_auth');
        sessionStorage.removeItem('md_user');
        window.location.href = 'index.html';
      });
    }

    // пока заглушка для экспорта (дальше добавим)
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        alert('Экспорт в PDF подключим на следующем шаге.');
      });
    }
  });
})();
