// ============================================
// bitrix.js — Обработка данных Битрикс24
// Doctor Travel — реальная структура данных
// 
// ФАЙЛЫ:
//   bitrix_lost.csv    — отказники (Воронка = "Отказники")
//   bitrix_active.csv  — активные (Воронка = "Продажа туров")
//   prepayments.csv    — предоплаты от бухгалтера
// ============================================

const BitrixModule = (() => {

  // ============================================
  // КОНФИГУРАЦИЯ — все настройки в одном месте
  // ============================================
  const CONFIG = {

    // Названия колонок в CRM-файлах (активные + отказники)
    cols: {
      id:           'ID',
      funnel:       'Воронка',
      stage:        'Стадия сделки',
      dealTitle:    'Название сделки',
      source:       'Источник',               // прямой источник сделки
      contactSource:'Контакт: Источник',      // ГЛАВНЫЙ источник (обязательно)
      tourType:     'тип тура',               // групповой / индивидуальный / агентский
      lostReason:   'Причина отказа',
      amount:       'Сумма',
      currency:     'Валюта',
      dateCreate:   'Дата создания',
      responsible:  'Ответственный',
      contact:      'Контакт',
      prepaySize:   'Размер предоплаты',
      utmSource:    'UTM Source',
      utmMedium:    'UTM Medium',
      utmCampaign:  'UTM Campaign',
    },

    // Колонки в файле бухгалтера (предоплаты)
    prepCols: {
      date:         'МАЙ 2026',    // первая колонка — дата
      name:         'ФИО',
      direction:    'Направление',
      tourDate:     'Дата начала тура',
    },

    // Стадии "в работе" (не отказ, не закрыта)
    activeStages: [
      'Новая заявка',
      'Выявил потребность',
      'Предложение направлено',
      'Договор выслан',
      'Тур забронирован',
    ],

    // Стадии "стал клиентом"
    clientStages: [
      'Тур забронирован',
      'Договор выслан',
    ],

    // Маппинг источников — приводим к единому виду
    // Ключ: что может встретиться в данных (lowercase)
    // Значение: как показываем в дашборде
    sourceMap: {
      'реклама фб':       'Реклама Facebook',
      'реклама fb':       'Реклама Facebook',
      'facebook':         'Реклама Facebook',
      'инстаграм':        'Instagram',
      'instagram':        'Instagram',
      'реклама блогеры':  'Реклама у блогеров',
      'блогер':           'Реклама у блогеров',
      'по рекомендации':  'Рекомендация',
      'рекомендация':     'Рекомендация',
      'telegram':         'Telegram',
      'тг':               'Telegram',
      'whatsapp':         'WhatsApp',
      'веб-сайт':         'Сайт',
      'сайт':             'Сайт',
      'яндекс':           'Яндекс',
      'google':           'Google',
      'tgapi telegram':   'Telegram',
      'marquiz':          'Сайт (квиз)',
    },

    // Группировка направлений по ключевым словам
    // Порядок важен: более специфичные — первыми
    destinationGroups: [
      { name: 'Кения',                  keywords: ['кения', 'kenya', 'миграция', 'масаи'] },
      { name: 'Австралия',              keywords: ['австрал', 'тасмания', 'фиджи'] },
      { name: 'Перу / Боливия',         keywords: ['перу', 'боливия', 'амазонка'] },
      { name: 'Руанда / Уганда',        keywords: ['руанда', 'уганда'] },
      { name: 'ЮАР / ЗЗБ',             keywords: ['юар', 'uar', 'космос', 'зимбабве', 'замбия', 'ботсвана', 'ззб'] },
      { name: 'Мадагаскар',             keywords: ['мадагаскар', 'маврикий'] },
      { name: 'Танзания / Занзибар',    keywords: ['танзания', 'занзибар', 'тарангире', 'нгоронгоро'] },
      { name: 'Намибия',                keywords: ['намибия'] },
      { name: 'Эфиопия',               keywords: ['эфиопия'] },
      { name: 'Южная Америка',          keywords: ['бразили', 'аргентин', 'чили'] },
      { name: 'Другое / Несколько',     keywords: [] }, // fallback
    ],
  };

  // ============================================
  // СОСТОЯНИЕ
  // ============================================
  let state = {
    lost:         [],    // отказники
    active:       [],    // активные сделки
    prepayments:  [],    // предоплаты бухгалтера
    period:       null,
  };

  // ============================================
  // ГЛАВНАЯ ФУНКЦИЯ ЗАГРУЗКИ
  // ============================================

  /**
   * Загружает данные за период
   * @param {string} period — '2025-05'
   * @returns {Promise<BitrixMetrics>}
   */
  async function loadPeriod(period) {
    console.log(`[Bitrix] Загрузка периода ${period}...`);
    state.period = period;

    const basePath = `data/${period}`;

    // Загружаем все файлы параллельно
    const results = await Promise.allSettled([
      DataLoader.loadFile(`${basePath}/bitrix_lost.csv`),
      DataLoader.loadFile(`${basePath}/bitrix_active.csv`),
      DataLoader.loadFile(`${basePath}/prepayments.csv`),
    ]);

    state.lost        = results[0].status === 'fulfilled' ? results[0].value : [];
    state.active      = results[1].status === 'fulfilled' ? results[1].value : [];
    state.prepayments = results[2].status === 'fulfilled' ? results[2].value : [];

    console.log(`[Bitrix] Отказники: ${state.lost.length}`);
    console.log(`[Bitrix] Активные: ${state.active.length}`);
    console.log(`[Bitrix] Предоплаты: ${state.prepayments.length}`);

    return buildMetrics();
  }

  // ============================================
  // ПОСТРОЕНИЕ ВСЕХ МЕТРИК
  // ============================================

  function buildMetrics() {
    return {
      summary:          buildSummary(),
      bySource:         buildBySource(),
      byDestination:    buildByDestination(),
      byTourType:       buildByTourType(),
      lostReasons:      buildLostReasons(),
      salesByDirection: buildSalesByDirection(),
      timeline:         buildTimeline(),
      topDeals:         buildTopDeals(),
      rawLost:          state.lost,
      rawActive:        state.active,
      rawPrepayments:   state.prepayments,
    };
  }

  // ============================================
  // МЕТРИКА 1: СВОДКА (главные цифры)
  // ============================================

  function buildSummary() {
    const totalLost    = state.lost.length;
    const totalActive  = state.active.length;
    const totalLeads   = totalLost + totalActive;

    // Считаем "стали клиентами" — те кто в CRM в стадиях договор/бронь
    const clientsInCRM = state.active.filter(row => {
      const stage = String(row[CONFIG.cols.stage] || '').trim();
      return CONFIG.clientStages.includes(stage);
    }).length;

    // Сравниваем с предоплатами от бухгалтера
    // Бухгалтер — источник истины для фактических оплат
    const prepCount = state.prepayments.filter(
      row => row[CONFIG.prepCols.name] && 
             String(row[CONFIG.prepCols.name]).trim() !== ''
    ).length;

    // Сумма предоплат (у бухгалтера нет суммы, берём из CRM)
    const totalRevenue = state.active.reduce((sum, row) => {
      const stage = String(row[CONFIG.cols.stage] || '').trim();
      if (!CONFIG.clientStages.includes(stage)) return sum;
      return sum + parseAmount(row[CONFIG.cols.amount]);
    }, 0);

    // Конверсия из заявки в работу
    const conversionToWork = totalLeads > 0
      ? ((totalActive / totalLeads) * 100).toFixed(1)
      : 0;

    // Конверсия в клиента (от всех заявок)
    const conversionToClient = totalLeads > 0
      ? ((prepCount / totalLeads) * 100).toFixed(1)
      : 0;

    return {
      totalLeads,           // Всего новых заявок
      totalActive,          // В работе (не в отказе)
      totalLost,            // Отказники
      clientsInCRM,         // Стали клиентами (по CRM)
      prepCount,            // Предоплат по данным бухгалтера
      totalRevenue,         // Сумма по сделкам
      conversionToWork,     // % в работе от общего
      conversionToClient,   // % стали клиентами
      avgDeal: clientsInCRM > 0
        ? Math.round(totalRevenue / clientsInCRM)
        : 0,
    };
  }

  // ============================================
  // МЕТРИКА 2: ПО ИСТОЧНИКАМ
  // ============================================

  function buildBySource() {
    const sources = {};

    // Функция получения источника из строки CRM
    const getSource = (row) => {
      // Приоритет: "Контакт: Источник" → "Источник"
      const raw = row[CONFIG.cols.contactSource] || 
                  row[CONFIG.cols.source] || 
                  '';
      return normalizeSource(raw);
    };

    // Считаем все заявки (активные + отказники)
    [...state.active, ...state.lost].forEach(row => {
      const src = getSource(row);
      if (!sources[src]) {
        sources[src] = {
          name:    src,
          leads:   0,
          active:  0,
          lost:    0,
          clients: 0,
        };
      }
      sources[src].leads++;
    });

    // Отдельно активные
    state.active.forEach(row => {
      const src = getSource(row);
      if (sources[src]) sources[src].active++;
    });

    // Отдельно отказники
    state.lost.forEach(row => {
      const src = getSource(row);
      if (sources[src]) sources[src].lost++;
    });

    // Клиенты (по стадии в CRM)
    state.active.forEach(row => {
      const stage = String(row[CONFIG.cols.stage] || '').trim();
      if (CONFIG.clientStages.includes(stage)) {
        const src = getSource(row);
        if (sources[src]) sources[src].clients++;
      }
    });

    // Добавляем конверсии
    return Object.values(sources)
      .map(s => ({
        ...s,
        conversionToWork:   s.leads > 0 ? ((s.active / s.leads) * 100).toFixed(1) : 0,
        conversionToClient: s.leads > 0 ? ((s.clients / s.leads) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.leads - a.leads);
  }

  // ============================================
  // МЕТРИКА 3: ПО НАПРАВЛЕНИЯМ
  // ============================================

  function buildByDestination() {
    const destinations = {};

    const addToDest = (row, type) => {
      const title = String(row[CONFIG.cols.dealTitle] || '').toLowerCase();
      const dest  = detectDestination(title);

      if (!destinations[dest]) {
        destinations[dest] = {
          name:    dest,
          leads:   0,
          active:  0,
          lost:    0,
          clients: 0,
          titles:  [], // примеры названий сделок
        };
      }

      destinations[dest].leads++;
      destinations[dest][type]++;

      // Сохраняем уникальные названия (не более 5)
      const titleRaw = row[CONFIG.cols.dealTitle] || '';
      if (
        destinations[dest].titles.length < 5 &&
        !destinations[dest].titles.includes(titleRaw)
      ) {
        destinations[dest].titles.push(titleRaw);
      }
    };

    state.active.forEach(row => {
      addToDest(row, 'active');
      const stage = String(row[CONFIG.cols.stage] || '').trim();
      if (CONFIG.clientStages.includes(stage)) {
        destinations[detectDestination(
          String(row[CONFIG.cols.dealTitle] || '').toLowerCase()
        )].clients++;
      }
    });

    state.lost.forEach(row => addToDest(row, 'lost'));

    return Object.values(destinations)
      .sort((a, b) => b.leads - a.leads);
  }

  // ============================================
  // МЕТРИКА 4: ПО ТИПУ ТУРА
  // ============================================

  function buildByTourType() {
    const types = {};

    [...state.active, ...state.lost].forEach(row => {
      const raw  = String(row[CONFIG.cols.tourType] || '').trim();
      const type = raw || 'Не указан';

      if (!types[type]) {
        types[type] = { name: type, count: 0, active: 0, lost: 0 };
      }
      types[type].count++;
    });

    state.active.forEach(row => {
      const type = String(row[CONFIG.cols.tourType] || 'Не указан').trim();
      if (types[type]) types[type].active++;
    });

    state.lost.forEach(row => {
      const type = String(row[CONFIG.cols.tourType] || 'Не указан').trim();
      if (types[type]) types[type].lost++;
    });

    return Object.values(types)
      .sort((a, b) => b.count - a.count);
  }

  // ============================================
  // МЕТРИКА 5: ПРИЧИНЫ ОТКАЗОВ
  // ============================================

  function buildLostReasons() {
    const reasons = {};
    const total   = state.lost.length;

    state.lost.forEach(row => {
      const reason = String(row[CONFIG.cols.lostReason] || '').trim() 
                     || 'Причина не указана';

      if (!reasons[reason]) {
        reasons[reason] = { reason, count: 0 };
      }
      reasons[reason].count++;
    });

    return Object.values(reasons)
      .map(r => ({
        ...r,
        percent: total > 0 
          ? ((r.count / total) * 100).toFixed(1) 
          : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  // ============================================
  // МЕТРИКА 6: ПРОДАЖИ ПО НАПРАВЛЕНИЯМ
  // (из файла предоплат бухгалтера)
  // ============================================

  function buildSalesByDirection() {
    const directions = {};

    state.prepayments.forEach(row => {
      const rawDir = String(row[CONFIG.prepCols.direction] || '').trim();
      if (!rawDir) return;

      // Нормализуем направление через detectDestination
      const dest = detectDestination(rawDir.toLowerCase());

      if (!directions[dest]) {
        directions[dest] = {
          name:  dest,
          count: 0,
          rawNames: [], // оригинальные названия из файла бухгалтера
        };
      }
      directions[dest].count++;

      if (
        directions[dest].rawNames.length < 3 &&
        !directions[dest].rawNames.includes(rawDir)
      ) {
        directions[dest].rawNames.push(rawDir);
      }
    });

    // Добавляем сумму из CRM (по совпадению названия)
    Object.keys(directions).forEach(destKey => {
      const matchingDeals = state.active.filter(row => {
        const stage = String(row[CONFIG.cols.stage] || '').trim();
        if (!CONFIG.clientStages.includes(stage)) return false;
        const title = String(row[CONFIG.cols.dealTitle] || '').toLowerCase();
        return detectDestination(title) === destKey;
      });

      const revenue = matchingDeals.reduce((sum, row) => {
        return sum + parseAmount(row[CONFIG.cols.amount]);
      }, 0);

      directions[destKey].revenue   = revenue;
      directions[destKey].dealsCount = matchingDeals.length;
    });

    return Object.values(directions)
      .sort((a, b) => b.count - a.count);
  }

  // ============================================
  // МЕТРИКА 7: ВРЕМЕННАЯ ДИНАМИКА
  // ============================================

  function buildTimeline() {
    const timeline = {};

    const addToTimeline = (row, type) => {
      const date = parseDate(row[CONFIG.cols.dateCreate]);
      if (!date) return;

      const key = formatDateKey(date);
      if (!timeline[key]) {
        timeline[key] = {
          date:   key,
          leads:  0,
          active: 0,
          lost:   0,
        };
      }
      timeline[key].leads++;
      timeline[key][type]++;
    };

    state.active.forEach(row => addToTimeline(row, 'active'));
    state.lost.forEach(row   => addToTimeline(row, 'lost'));

    return Object.values(timeline)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // ============================================
  // МЕТРИКА 8: ТОП СДЕЛОК (крупнейшие)
  // ============================================

  function buildTopDeals() {
    return state.active
      .filter(row => {
        const stage  = String(row[CONFIG.cols.stage] || '').trim();
        const amount = parseAmount(row[CONFIG.cols.amount]);
        return CONFIG.clientStages.includes(stage) && amount > 0;
      })
      .map(row => ({
        id:        row[CONFIG.cols.id],
        title:     row[CONFIG.cols.dealTitle],
        amount:    parseAmount(row[CONFIG.cols.amount]),
        currency:  row[CONFIG.cols.currency],
        stage:     row[CONFIG.cols.stage],
        contact:   row[CONFIG.cols.contact],
        manager:   row[CONFIG.cols.responsible],
        date:      row[CONFIG.cols.dateCreate],
        tourType:  row[CONFIG.cols.tourType],
        source:    normalizeSource(
                     row[CONFIG.cols.contactSource] || 
                     row[CONFIG.cols.source] || ''
                   ),
        destination: detectDestination(
                       String(row[CONFIG.cols.dealTitle] || '').toLowerCase()
                     ),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20); // топ-20
  }

  // ============================================
  // СРАВНЕНИЕ ПЕРИОДОВ
  // ============================================

  /**
   * Сравнивает два набора метрик
   * @param {Object} current  — buildMetrics() текущего периода
   * @param {Object} previous — buildMetrics() прошлого периода
   */
  function comparePeriods(current, previous) {
    if (!current || !previous) return null;

    const c = current.summary;
    const p = previous.summary;

    const delta = (curr, prev) => {
      const diff    = curr - prev;
      const percent = prev > 0 ? ((diff / prev) * 100).toFixed(1) : null;
      return {
        current:    curr,
        previous:   prev,
        diff,
        percent,
        trend:      diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
        isPositive: diff >= 0,
      };
    };

    return {
      totalLeads:        delta(c.totalLeads,        p.totalLeads),
      totalActive:       delta(c.totalActive,       p.totalActive),
      totalLost:         delta(c.totalLost,         p.totalLost),
      prepCount:         delta(c.prepCount,         p.prepCount),
      totalRevenue:      delta(c.totalRevenue,      p.totalRevenue),
      conversionToWork:  delta(
                           parseFloat(c.conversionToWork),
                           parseFloat(p.conversionToWork)
                         ),
      conversionToClient: delta(
                            parseFloat(c.conversionToClient),
                            parseFloat(p.conversionToClient)
                          ),
    };
  }

  // ============================================
  // СОПОСТАВЛЕНИЕ CRM С БУХГАЛТЕРОМ
  // ============================================

  /**
   * Находит совпадения между предоплатами бухгалтера и сделками CRM
   * по имени клиента
   * @returns {Array} массив совпадений и расхождений
   */
  function matchPrepaymentsToCRM() {
    const results = {
      matched:    [],   // есть в обоих
      onlyBuh:    [],   // только у бухгалтера (нет в CRM)
      onlyCRM:    [],   // только в CRM (нет у бухгалтера)
    };

    // Клиенты из бухгалтерии
    const buhNames = state.prepayments
      .filter(row => row[CONFIG.prepCols.name])
      .map(row => ({
        name:      String(row[CONFIG.prepCols.name]).trim(),
        direction: row[CONFIG.prepCols.direction],
        date:      row[CONFIG.prepCols.date],
      }));

    // Клиенты из CRM (только забронировавшие)
    const crmClients = state.active
      .filter(row => {
        const stage = String(row[CONFIG.cols.stage] || '').trim();
        return CONFIG.clientStages.includes(stage);
      })
      .map(row => ({
        name:    String(row[CONFIG.cols.contact] || '').trim(),
        title:   row[CONFIG.cols.dealTitle],
        amount:  parseAmount(row[CONFIG.cols.amount]),
        source:  normalizeSource(
                   row[CONFIG.cols.contactSource] || 
                   row[CONFIG.cols.source] || ''
                 ),
      }));

    // Ищем совпадения (нечёткое сравнение по части имени)
    buhNames.forEach(buh => {
      const buhLower    = buh.name.toLowerCase();
      const crmMatch    = crmClients.find(crm => {
        const crmLower = crm.name.toLowerCase();
        // Проверяем содержится ли первое слово одного в другом
        const buhParts = buhLower.split(/\s+/);
        const crmParts = crmLower.split(/\s+/);
        return buhParts.some(bp => 
          bp.length > 3 && crmParts.some(cp => 
            cp.includes(bp) || bp.includes(cp)
          )
        );
      });

      if (crmMatch) {
        results.matched.push({ buh, crm: crmMatch });
      } else {
        results.onlyBuh.push(buh);
      }
    });

    // Находим тех кто только в CRM
    const matchedCRMNames = results.matched.map(m => m.crm.name);
    crmClients.forEach(crm => {
      if (!matchedCRMNames.includes(crm.name)) {
        results.onlyCRM.push(crm);
      }
    });

    return results;
  }

  // ============================================
  // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  // ============================================

  /**
   * Нормализует источник
   */
  function normalizeSource(raw) {
    if (!raw) return 'Не указан';
    const str = String(raw).trim();
    const lower = str.toLowerCase();

    for (const [key, value] of Object.entries(CONFIG.sourceMap)) {
      if (lower.includes(key)) return value;
    }

    return str || 'Не указан';
  }

  /**
   * Определяет направление по тексту
   */
  function detectDestination(textLower) {
    for (const group of CONFIG.destinationGroups) {
      if (group.keywords.length === 0) continue; // пропускаем fallback
      for (const kw of group.keywords) {
        if (textLower.includes(kw)) return group.name;
      }
    }
    return 'Другое / Несколько';
  }

  /**
   * Парсит сумму из строки
   * Форматы: "3950.00", "$800.00", "1 200.00 €", "82110.00"
   */
  function parseAmount(raw) {
    if (!raw) return 0;
    const str = String(raw)
      .replace(/[^\d.,]/g, '') // убираем всё кроме цифр и разделителей
      .replace(',', '.')
      .trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Парсит дату
   * Форматы: "29.05.2026 10:14:54", "2026-05-29"
   */
  function parseDate(raw) {
    if (!raw) return null;
    const str = String(raw).trim();

    // DD.MM.YYYY HH:mm:ss (битрикс формат)
    const dmyMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dmyMatch) {
      return new Date(
        parseInt(dmyMatch[3]),
        parseInt(dmyMatch[2]) - 1,
        parseInt(dmyMatch[1])
      );
    }

    // YYYY-MM-DD
    const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) {
      return new Date(
        parseInt(ymdMatch[1]),
        parseInt(ymdMatch[2]) - 1,
        parseInt(ymdMatch[3])
      );
    }
  
        // Excel serial number (число)
    if (!isNaN(raw) && raw !== '') {
      const excelDate = new Date((Number(raw) - 25569) * 86400 * 1000);
      if (excelDate instanceof Date && !isNaN(excelDate)) {
        return excelDate;
      }
    }

    return null;
  }

  /**
   * Форматирует дату в ключ 'YYYY-MM-DD'
   */
  function formatDateKey(date) {
    if (!date || !(date instanceof Date) || isNaN(date)) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Пустые метрики — если файлы не загрузились
   */
  function getEmptyMetrics() {
    return {
      summary: {
        totalLeads:           0,
        totalActive:          0,
        totalLost:            0,
        clientsInCRM:         0,
        prepCount:            0,
        totalRevenue:         0,
        conversionToWork:     '0.0',
        conversionToClient:   '0.0',
        avgDeal:              0,
      },
      bySource:         [],
      byDestination:    [],
      byTourType:       [],
      lostReasons:      [],
      salesByDirection: [],
      timeline:         [],
      topDeals:         [],
      rawLost:          [],
      rawActive:        [],
      rawPrepayments:   [],
    };
  }

  // ============================================
  // ПУБЛИЧНОЕ API
  // ============================================

  return {
    // Главные функции
    loadPeriod,
    comparePeriods,
    matchPrepaymentsToCRM,

    // Утилиты (для дебага и correlations.js)
    utils: {
      normalizeSource,
      detectDestination,
      parseAmount,
      parseDate,
      formatDateKey,
    },

    // Доступ к состоянию и конфигу
    getState:  () => ({ ...state }),
    getConfig: () => ({ ...CONFIG }),
  };

})();
