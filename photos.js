/* ============================================================
   photos.js — список картинок-референсов
   ------------------------------------------------------------
   Это просто массив. Каждая картинка — объект из трёх полей:

     src      — путь к файлу или полная ссылка из интернета
     category — одна из четырёх категорий:
                'people'  — люди
                'animals' — животные
                'faces'   — лица
                'hands'   — кисти рук
     tags     — подписи, которые видит пользователь

   Чтобы добавить свою картинку:
     1. Положите файл в папку images/
     2. Добавьте строку в массив ниже.

   Пример со ссылкой из интернета:
     { src: 'https://example.com/photo.jpg', category: 'people', tags: ['портрет'] }

   ВАЖНО: после последней картинки в объекте нет запятой,
   а между картинками — есть.
   ============================================================ */

const PHOTOS = [
  { src: 'images/people-01.svg', category: 'people', tags: ['девушка', 'половина тела', 'студия'] },
  { src: 'images/people-02.svg', category: 'people', tags: ['парень', 'в полный рост', 'улица'] },
  { src: 'images/people-03.svg', category: 'people', tags: ['два человека', 'диалог', 'кафе'] },

  { src: 'images/animals-01.svg', category: 'animals', tags: ['кот', 'сидит', 'профиль'] },
  { src: 'images/animals-02.svg', category: 'animals', tags: ['собака', 'бежит', 'парк'] },
  { src: 'images/animals-03.svg', category: 'animals', tags: ['птица', 'крылья', 'небо'] },

  { src: 'images/faces-01.svg', category: 'faces', tags: ['лицо 3/4', 'портрет', 'мягкий свет'] },
  { src: 'images/faces-02.svg', category: 'faces', tags: ['профиль', 'глаза', 'контражур'] },

  { src: 'images/hands-01.svg', category: 'hands', tags: ['жест', 'крупный план', 'тени'] },
  { src: 'images/hands-02.svg', category: 'hands', tags: ['рука с карандашом', 'набросок', 'стол'] }
];
