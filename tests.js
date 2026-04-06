'use strict';
/**
 * Unit-тесты для утилитарных функций проекта GitHub Spy
 * ПОЧЕМУ вынесены в отдельный файл? — Изоляция тестовой логики от бизнес-логики,
 * упрощает поддержку и проверку покрытия кода тестами.
 */
(function runTests() {
    console.group('🧪 Unit-тесты утилитарных функций');

    function assert(condition, testName) {
        if (condition) {
            console.log(`✅ ${testName}`);
        } else {
            console.error(`❌ ${testName}`);
        }
    }

    // Тесты для normalizeUsername
    const normalize = window.normalizeUsername;
    if (normalize) {
        console.group('📋 normalizeUsername');
        assert(normalize('  John_Doe  ') === 'john_doe', '1. Обрезка пробелов и lowerCase');
        assert(normalize('User@123!') === 'user123', '2. Удаление недопустимых спецсимволов');
        assert(normalize('GitHub-User') === 'github-user', '3. Сохранение допустимых дефисов');
        assert(normalize('') === '', '4. Пустая строка');
        assert(normalize(null) === '', '5. Передача null');
        assert(normalize(undefined) === '', '6. Передача undefined');
        assert(normalize(123) === '', '7. Передача числа');
        assert(normalize('   ') === '', '8. Строка только из пробелов');
        assert(normalize('A_B-C123') === 'a_b-c123', '9. Микс допустимых символов');
        console.groupEnd();
    } else {
        console.warn('⚠️ Функция normalizeUsername не найдена');
    }

    // Тесты для debounce
    const debounce = window.debounce;
    if (debounce) {
        console.group('⏱ debounce');
        let called = false;
        const testFn = debounce(() => { called = true; }, 100);
        testFn();
        assert(called === false, '1. Не выполняется синхронно');
        setTimeout(() => {
            assert(called === true, '2. Выполняется после задержки ~100ms');
            console.groupEnd();
        }, 150);
    } else {
        console.warn('⚠️ Функция debounce не найдена');
    }

    // Тесты для delay
    const delay = window.delay;
    if (delay && typeof delay === 'function') {
        console.group('⏳ delay');
        const startTime = Date.now();
        delay(200).then(() => {
            const elapsed = Date.now() - startTime;
            assert(elapsed >= 150 && elapsed <= 300, `1. Задержка ~200ms (прошло: ${elapsed}ms)`);
            console.groupEnd();
            console.log('📊 Тестирование завершено.');
            console.groupEnd();
        });
    } else {
        console.warn('⚠️ Функция delay не найдена');
        console.log('📊 Тестирование завершено.');
        console.groupEnd();
    }
})();