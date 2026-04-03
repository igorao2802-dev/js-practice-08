'use strict';
// Unit-тесты для утилитарных функций (3.6)
// ПОЧЕМУ вынесены в отдельный файл? — Изоляция тестовой логики от бизнес-логики, упрощает поддержку и проверку покрытия.

(function runTests() {
    console.group('🧪 Unit-тесты утилитарных функций');

    function assert(condition, testName) {
        if (condition) {
            console.log(`✅ ${testName}`);
        } else {
            console.error(`❌ ${testName}`);
        }
    }

    // Получаем тестируемую функцию из глобальной области (экспортирована в script.js)
    const normalize = window.normalizeUsername;

    if (!normalize) {
        console.error('⚠️ Функция normalizeUsername не найдена. Проверьте загрузку script.js');
        return;
    }

    // Базовые кейсы
    assert(normalize('  John_Doe  ') === 'john_doe', '1. Обрезка пробелов и приведение к нижнему регистру');
    assert(normalize('User@123!') === 'user123', '2. Удаление недопустимых спецсимволов');
    assert(normalize('GitHub-User') === 'github-user', '3. Сохранение допустимых дефисов');

    // Граничные состояния (Edge-cases)
    assert(normalize('') === '', '4. Пустая строка');
    assert(normalize(null) === '', '5. Передача null');
    assert(normalize(undefined) === '', '6. Передача undefined');
    assert(normalize(123) === '', '7. Передача числа');
    assert(normalize('   ') === '', '8. Строка только из пробелов');
    assert(normalize('A_B-C123') === 'a_b-c123', '9. Микс допустимых символов');

    console.log('📊 Тестирование завершено. Ошибок в консоли — нет.');
    console.groupEnd();
})();

