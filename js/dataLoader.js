// ============================================
// dataLoader.js — Загрузка CSV и Excel файлов
// 
// Зависимости:
//   libs/xlsx.min.js  — для Excel (.xlsx)
//
// Использование:
//   const rows = await DataLoader.loadFile('data/2025-05/bitrix_active.csv');
//   // rows = [{колонка1: значение, колонка2: значение}, ...]
// ============================================

const DataLoader = (() => {

  // ============================================
  // ГЛАВНАЯ ФУНКЦИЯ
  // ============================================

  /**
   * Загружает файл и возвращает массив объектов
   * Автоматически определяет формат по расширению
   *
   * @param {string} filePath — путь к файлу
   * @returns {Promise<Array<Object>>}
   */
  async function loadFile(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();

    try {
      const response = await fetch(filePath);

      if (!response.ok) {
        console.warn(`[DataLoader] Файл не найден: ${filePath}`);
        return [];
      }

      if (ext === 'csv') {
        const text = await response.text();
        return parseCSV(text);
      }

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await response.arrayBuffer();
        return parseExcel(buffer);
      }

      if (ext === 'json') {
        return await response.json();
      }

      console.warn(`[DataLoader] Неизвестный формат: ${ext}`);
      return [];

    } catch (error) {
      console.error(`[DataLoader] Ошибка загрузки ${filePath}:`, error);
      return [];
    }
  }

  // ============================================
  // ПАРСИНГ CSV
  // ============================================

  /**
   * Парсит CSV текст в массив объектов
   * Поддерживает:
   *   - запятую и точку с запятой как разделитель
   *   - поля в кавычках (с запятыми внутри)
   *   - Windows (CRLF) и Unix (LF) переносы строк
   *   - UTF-8 BOM
   *
   * @param {string} text — содержимое CSV файла
   * @returns {Array<Object>}
   */
  function parseCSV(text) {
    // Убираем BOM если есть
    const cleaned = text.replace(/^\uFEFF/, '').trim();

    if (!cleaned) return [];

    // Разбиваем на строки
    const lines = cleaned.split(/\r?\n/);
    if (lines.length < 2) return [];

    // Определяем разделитель автоматически
    const delimiter = detectDelimiter(lines[0]);

    // Парсим заголовок
    const headers = parseLine(lines[0], delimiter).map(h => h.trim());

    // Парсим данные
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // пропускаем пустые строки

      const values = parseLine(line, delimiter);

      // Пропускаем строки где все значения пустые
      if (values.every(v => !v.trim())) continue;

      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] !== undefined
          ? values[index].trim()
          : '';
      });

      rows.push(row);
    }

    console.log(`[DataLoader] CSV загружен: ${rows.length} строк, ${headers.length} колонок`);
    return rows;
  }

  /**
   * Определяет разделитель CSV (запятая или точка с запятой)
   */
  function detectDelimiter(firstLine) {
    const commas     = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    return semicolons > commas ? ';' : ',';
  }

  /**
   * Парсит одну строку CSV с учётом кавычек
   */
  function parseLine(line, delimiter) {
    const values = [];
    let current  = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char     = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Экранированная кавычка ""
          current += '"';
          i++;
        } else {
          // Начало или конец кавычек
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current); // последнее значение
    return values;
  }

  // ============================================
  // ПАРСИНГ EXCEL
  // ============================================

  /**
   * Парсит Excel файл через библиотеку XLSX
   * Автоматически берёт первый лист
   *
   * @param {ArrayBuffer} buffer
   * @returns {Array<Object>}
   */
  function parseExcel(buffer) {
    if (typeof XLSX === 'undefined') {
      console.error('[DataLoader] XLSX библиотека не подключена! Добавь libs/xlsx.min.js');
      return [];
    }

    try {
      const workbook  = XLSX.read(buffer, {
        type:        'array',
        cellDates:   true,  // даты как объекты Date
        cellNF:      false,
        cellText:    false,
      });

      // Берём первый лист
      const sheetName = workbook.SheetNames[0];
      const sheet     = workbook.Sheets[sheetName];

      // Конвертируем в массив объектов
      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval:  '',    // значение по умолчанию для пустых ячеек
        raw:     false, // форматируем значения как строки
      });

      console.log(`[DataLoader] Excel загружен: ${rows.length} строк (лист: ${sheetName})`);
      return rows;

    } catch (error) {
      console.error('[DataLoader] Ошибка парсинга Excel:', error);
      return [];
    }
  }

  // ============================================
  // ЗАГРУЗКА ЧЕРЕЗ FILE INPUT (ручная загрузка)
  // ============================================

  /**
   * Загружает файл через <input type="file">
   * Используется если файлы лежат локально
   *
   * @param {File} file — объект File из input
   * @returns {Promise<Array<Object>>}
   */
  function loadFromInput(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const ext    = file.name.split('.').pop().toLowerCase();

      reader.onload = (e) => {
        try {
          if (ext === 'csv') {
            const text = e.target.result;
            resolve(parseCSV(text));
          } else if (ext === 'xlsx' || ext === 'xls') {
            const buffer = e.target.result;
            resolve(parseExcel(buffer));
          } else {
            resolve([]);
          }
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(reader.error);

      if (ext === 'csv') {
        reader.readAsText(file, 'UTF-8');
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  }

  // ============================================
  // ЗАГРУЗКА НЕСКОЛЬКИХ ФАЙЛОВ СРАЗУ
  // ============================================

  /**
   * Загружает несколько файлов параллельно
   *
   * @param {Object} files — { ключ: путь }
   * @returns {Promise<Object>} — { ключ: данные }
   *
   * Пример:
   *   const data = await DataLoader.loadMany({
   *     active:  'data/2025-05/bitrix_active.csv',
   *     lost:    'data/2025-05/bitrix_lost.csv',
   *     prepay:  'data/2025-05/prepayments.csv',
   *   });
   */
  async function loadMany(files) {
    const keys    = Object.keys(files);
    const paths   = Object.values(files);
    const results = await Promise.allSettled(paths.map(p => loadFile(p)));

    const output = {};
    keys.forEach((key, i) => {
      output[key] = results[i].status === 'fulfilled'
        ? results[i].value
        : [];
    });

    return output;
  }

  // ============================================
  // УТИЛИТЫ ДЛЯ РАБОТЫ С ДАННЫМИ
  // ============================================

  /**
   * Показывает все уникальные заголовки из файла
   * Удобно для дебага — посмотреть что есть в CSV
   *
   * @param {Array<Object>} rows
   * @returns {Array<string>}
   */
  function getHeaders(rows) {
    if (!rows || rows.length === 0) return [];
    return Object.keys(rows[0]);
  }

  /**
   * Показывает уникальные значения колонки
   * Удобно для настройки sourceMap и destinationGroups
   *
   * @param {Array<Object>} rows
   * @param {string} column — название колонки
   * @returns {Array<string>}
   */
  function getUniqueValues(rows, column) {
    if (!rows || rows.length === 0) return [];
    const values = rows
      .map(row => String(row[column] || '').trim())
      .filter(v => v !== '');
    return [...new Set(values)].sort();
  }

  /**
   * Фильтрует строки по значению колонки
   *
   * @param {Array<Object>} rows
   * @param {string} column
   * @param {string|Array} value — значение или массив значений
   * @returns {Array<Object>}
   */
  function filterBy(rows, column, value) {
    const values = Array.isArray(value) ? value : [value];
    return rows.filter(row =>
      values.includes(String(row[column] || '').trim())
    );
  }

  // ============================================
  // ПУБЛИЧНОЕ API
  // ============================================

  return {
    loadFile,
    loadMany,
    loadFromInput,
    parseCSV,
    parseExcel,
    utils: {
      getHeaders,
      getUniqueValues,
      filterBy,
      detectDelimiter,
    },
  };

})();
