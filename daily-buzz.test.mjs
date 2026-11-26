// Run with Node.js (20+) using: node --test daily-buzz.test.mjs
// Keep this file beside index.html. It exercises the inline application script
// with a small DOM fixture and a deterministic clock. Rendering needs a browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Script, createContext } from 'node:vm';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const appScript = new Script(scripts[0][2], { filename: 'index.html' });
const storageKey = 'testbees.dailybuzz.v1';

// Model only the DOM operations used by the app. Read the actual HTML and templates.
class TestElement {
  constructor(tag, document, attributes = {}) {
    this.tag = tag;
    this.document = document;
    this.attributes = { ...attributes };
    this.children = [];
    this.text = '';
    this.handlers = new Map();
    this.value = attributes.value || '';
    this.checked = 'checked' in attributes;
    this.disabled = 'disabled' in attributes;
    this.dataset = {};
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.clientWidth = 600;
    this.offsetWidth = 62;
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        if (force) classes.add(name);
        else classes.delete(name);
        this.className = [...classes].join(' ');
      },
      add: (...names) => names.forEach(name => this.classList.toggle(name, true)),
      remove: (...names) => names.forEach(name => this.classList.toggle(name, false)),
    };
  }

  get firstElementChild() { return this.children[0] || null; }
  get content() { return this; }
  get className() { return this.attributes.class || ''; }
  set className(value) { this.attributes.class = value; }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get id() { return this.attributes.id || ''; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.text = String(value); this.children = []; }
  set innerHTML(value) { this.textContent = ''; this.insertAdjacentHTML('afterbegin', value); }

  getAttribute(name) { return this.hasAttribute(name) ? this.attributes[name] : null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }

  insertAdjacentHTML(position, markup) {
    assert.equal(position, 'afterbegin');
    assert.match(markup, /^<svg\b/);
    const svg = this.document.createElement('svg');
    svg.parent = this;
    this.children.unshift(svg);
  }

  appendChild(child) {
    if (child.tag === '#fragment') {
      for (const node of child.children.slice()) this.appendChild(node);
    } else {
      child.remove();
      child.parent = this;
      this.children.push(child);
    }
    return child;
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }

  cloneNode(deep) {
    const copy = new TestElement(this.tag, this.document, this.attributes);
    copy.text = this.text;
    if (deep) this.children.forEach(child => copy.appendChild(child.cloneNode(true)));
    return copy;
  }

  querySelectorAll(selector) {
    const space = selector.indexOf(' ');
    if (space !== -1) {
      return this.querySelectorAll(selector.slice(0, space))
        .flatMap(node => node.querySelectorAll(selector.slice(space + 1)));
    }
    const inputType = selector.match(/^\w+\[type=(\w+)\]$/);
    const matches = node => {
      if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
      if (selector.startsWith('#')) return node.id === selector.slice(1);
      if (inputType) return node.tag === 'input' && node.getAttribute('type') === inputType[1];
      return node.tag === selector;
    };
    const results = [];
    const visit = node => {
      for (const child of node.children) {
        if (matches(child)) results.push(child);
        if (child.tag !== 'template') visit(child);
      }
    };
    visit(this);
    return results;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.document.activeElement = this; }
  select() { this.selectionStart = 0; this.selectionEnd = this.value.length; }
  addEventListener(type, handler) { this.handlers.set(type, handler); }
  fire(type, details = {}) {
    return this.handlers.get(type)?.({ target: this, preventDefault() {}, ...details });
  }
  click() { if (!this.disabled) return this.fire('click'); }
}

function createDocument(nativeDialog) {
  const document = new TestElement('#document', null);
  document.document = document;
  document.createElement = tag => new TestElement(tag, document);
  document.createDocumentFragment = () => document.createElement('#fragment');
  document.getElementById = id => document.querySelector('#' + id);
  document.execCommand = () => false;
  const voidTags = new Set(['input', 'br', 'img', 'hr', 'meta', 'link']);
  const body = html.slice(html.indexOf('<body>'), html.indexOf('<script>'));
  const stack = [document];
  for (const token of body.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)) {
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) {
      assert.equal(stack.pop().tag, token.slice(2, -1));
    } else if (token.startsWith('<')) {
      const [, tag, attributes] = token.match(/^<([\w-]+)([\s\S]*?)\/?>$/);
      const props = Object.fromEntries([...attributes.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)]
        .map(([, name, value]) => [name, value ?? '']));
      const node = new TestElement(tag, document, props);
      stack.at(-1).appendChild(node);
      if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push(node);
    } else {
      stack.at(-1).text += token;
    }
  }
  document.body = document.querySelector('body');
  document.documentElement = document.createElement('html');
  document.activeElement = document.body;
  if (nativeDialog) {
    const dialog = document.getElementById('extrasDialog');
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => dialog.removeAttribute('open');
  }
  return document;
}

function createClock() {
  const tasks = new Map();
  let id = 0;
  let now = 0;
  const schedule = (callback, delay) => {
    tasks.set(++id, { callback, time: now + delay });
    return id;
  };
  const cancel = task => tasks.delete(task);
  return {
    performance: { now: () => now },
    setTimeout: schedule,
    clearTimeout: cancel,
    requestAnimationFrame: callback => schedule(callback, 16),
    cancelAnimationFrame: cancel,
    advance(duration) {
      const target = now + duration;
      while (tasks.size) {
        const [next, task] = [...tasks].reduce((a, b) => a[1].time <= b[1].time ? a : b);
        if (task.time > target) break;
        tasks.delete(next);
        now = task.time;
        task.callback(now);
      }
      now = target;
    },
  };
}

function openApp(options = {}) {
  const document = createDocument(options.nativeDialog !== false);
  const clock = createClock();
  let value = options.raw ?? (options.saved ? JSON.stringify(options.saved) : null);
  const math = Object.create(Math);
  if (options.random) math.random = options.random;
  const browser = {
    document,
    navigator: { clipboard: { async writeText() { throw new Error('Clipboard blocked'); } } },
    localStorage: {
      getItem(key) {
        assert.equal(key, storageKey);
        if (options.storageBlocked) throw new Error('Storage blocked');
        return value;
      },
      setItem(key, saved) {
        assert.equal(key, storageKey);
        if (options.storageBlocked || options.writeBlocked) throw new Error('Storage blocked');
        value = saved;
      },
    },
    crypto: options.crypto || { getRandomValues(sample) { sample[0] = 0; } },
    confirm: options.confirm || (() => true),
    Math: math,
    addEventListener() {},
    ...clock,
  };
  browser.window = browser;
  appScript.runInContext(createContext(browser));
  const element = id => {
    const match = document.getElementById(id);
    assert.ok(match, 'Missing element #' + id);
    return match;
  };
  return {
    element,
    document,
    advance: clock.advance,
    click(id) { return element(id).click(); },
    text(id) { return element(id).textContent.trim(); },
    check(id, checked) {
      const input = element(id);
      input.checked = checked;
      input.fire('change');
    },
    change(id, value, type = 'change') {
      const input = element(id);
      input.value = String(value);
      input.fire(type);
    },
    storage: () => value,
    saved: () => JSON.parse(value),
    lanes: () => element('lanes').querySelectorAll('.lane'),
    rows: () => element('roster').querySelectorAll('.person'),
    hosts: () => element('weekGrid').querySelectorAll('.filled').map(day => day.querySelector('strong').textContent),
  };
}

const nineParticipants = Array.from({ length: 9 }, (_, index) => ({
  id: 'id-' + index,
  name: 'Person ' + index,
  style: index,
  active: true,
}));
const fiveParticipants = nineParticipants.slice(0, 5);

test('the package is one document with inline code and four embedded scenes', () => {
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0][1], '');
  assert.equal((html.match(/<style\b/g) || []).length, 1);
  assert.doesNotMatch(html, /<link\b|<script[^>]+\bsrc\s*=|<img[^>]+\bsrc\s*=|@import\b/);
  const css = html.split('<style>')[1].split('</style>')[0];
  const urls = Array.from(css.matchAll(/url\((.*?)\)/g), match => match[1]);
  assert.equal(urls.length, 4);
  urls.forEach(url => assert.match(url, /^"data:image\/svg\+xml,/));
});

test('the slider accepts 3–30 seconds, updates the clock and saves the value', () => {
  const app = openApp();
  const slider = app.element('durationSlider');
  assert.equal(slider.getAttribute('min'), '3');
  assert.equal(slider.getAttribute('max'), '30');
  assert.equal(slider.getAttribute('step'), '1');
  assert.equal(app.text('clock'), '00:05');
  for (const duration of [3, 30]) {
    app.change('durationSlider', duration, 'input');
    assert.equal(app.text('durationValue'), duration + ' s');
    assert.equal(app.text('clock'), '00:' + String(duration).padStart(2, '0'));
    assert.equal(app.saved().duration, duration);
  }
  assert.equal(openApp({ raw: app.storage() }).text('durationValue'), '30 s');
});

test('a 3-second race uses the chosen duration and locks the controls until the result', () => {
  const app = openApp({ saved: { people: fiveParticipants, duration: 3, mode: 'single' } });
  app.click('start');
  assert.equal(app.text('status'), 'On your marks');
  assert.equal(app.element('durationSlider').disabled, true);
  app.change('durationSlider', 30, 'input');
  assert.equal(app.text('durationValue'), '3 s');
  app.advance(400);
  assert.equal(app.text('status'), 'Race in progress');
  app.advance(2999);
  assert.equal(app.element('winnerOverlay').hidden, true);
  app.advance(16);
  assert.equal(app.text('clock'), '00:00');
  assert.equal(app.text('winnerName'), 'Person 0');
  assert.equal(app.element('winnerOverlay').hidden, false);
  assert.equal(app.element('durationSlider').disabled, false);
  assert.equal(app.element('week').hidden, true);
  assert.equal(app.saved().week, undefined);
});

test('a 30-second race reaches the finish after the full 30 seconds', () => {
  const app = openApp({ saved: { people: fiveParticipants, duration: 30 } });
  app.click('start');
  app.advance(800 + 29999);
  assert.equal(app.element('winnerOverlay').hidden, true);
  app.advance(16);
  assert.equal(app.text('clock'), '00:00');
  assert.equal(app.text('winnerName'), 'Person 0');
  assert.deepEqual(app.hosts(), ['Person 0']);
});

test('participant names travel with their bees and the winner keeps its label', () => {
  const name = 'Alex & Sam – a longer TestBee name';
  const people = [{ ...fiveParticipants[0], name }, fiveParticipants[1]];
  const app = openApp({ saved: { people, duration: 3, mode: 'single', events: false } });
  const labels = () => app.lanes().map(lane => lane.querySelector('.racer .racer-name'));
  assert.deepEqual(labels().map(label => label.textContent), [name, people[1].name]);

  app.click('start');
  const label = labels()[0];
  const racer = label.parent;
  const startPosition = racer.style.transform;
  app.advance(1400);
  assert.notEqual(racer.style.transform, startPosition);
  assert.equal(labels()[0], label);
  assert.equal(label.title, name);

  app.advance(2100);
  assert.equal(app.lanes()[0].classList.contains('winner'), true);
  assert.equal(labels()[0].textContent, app.text('winnerName'));
});

test('the automatic draw fills five unique weekdays and records one completed week', () => {
  const app = openApp({ saved: { people: fiveParticipants, duration: 3 } });
  app.click('autoWeek');
  app.advance(27000);
  assert.deepEqual(app.hosts(), fiveParticipants.map(person => person.name));
  assert.equal(app.lanes().length, 1);
  assert.equal(app.element('start').disabled, false);
  assert.equal(app.text('start'), 'New weekly draw');
  assert.equal(app.saved().history.length, 1);
  assert.deepEqual(app.saved().history[0].hosts, app.saved().week);
  const reloaded = openApp({ raw: app.storage() });
  assert.deepEqual(reloaded.hosts(), app.hosts());
  reloaded.click('newWeek');
  assert.equal(reloaded.hosts().length, 0);
  assert.equal(reloaded.lanes().length, 5);
  assert.equal(reloaded.saved().history.length, 1);
});

test('stopping an automatic draw keeps completed winners and cancels pending rounds', () => {
  const app = openApp({ saved: { people: fiveParticipants, duration: 3 } });
  app.click('autoWeek');
  app.advance(3500);
  assert.deepEqual(app.hosts(), ['Person 0']);
  assert.match(app.text('again'), /Stop automatic draw/);
  app.click('reset');
  app.advance(12000);
  assert.deepEqual(app.hosts(), ['Person 0']);
  assert.equal(app.element('durationSlider').disabled, false);
  assert.equal(app.text('again'), 'Next: Tuesday');
  app.click('again');
  app.advance(3500);
  assert.deepEqual(app.hosts(), ['Person 0', 'Person 1']);
});

test('cancelling during countdown or flight prevents any result from being saved', () => {
  for (const elapsed of [100, 900]) {
    const app = openApp({ saved: { people: fiveParticipants, duration: 3 } });
    app.click('start');
    app.advance(elapsed);
    app.click('reset');
    app.advance(6000);
    assert.deepEqual(app.hosts(), []);
    assert.equal(app.text('status'), 'Ready to race');
    assert.equal(app.element('winnerOverlay').hidden, true);
    assert.equal(app.element('durationSlider').disabled, false);
  }
});

test('a single weekly bee can win, while single races need two eligible bees', () => {
  const app = openApp({ saved: { people: fiveParticipants.slice(0, 1), duration: 3 } });
  assert.equal(app.element('autoWeek').disabled, true);
  app.click('singleMode');
  assert.equal(app.element('start').disabled, true);
  app.click('weeklyMode');
  app.click('start');
  app.advance(3500);
  assert.deepEqual(app.hosts(), ['Person 0']);
  assert.equal(app.element('again').disabled, true);
});

test('roster edits preserve row controls and duplicate names are rejected', () => {
  const app = openApp({ saved: { people: fiveParticipants } });
  const firstRow = app.rows()[0];
  const secondRow = app.rows()[1];
  const name = firstRow.querySelector('input[type=text]');
  name.value = '  person 1  ';
  name.fire('change');
  assert.equal(name.value, 'Person 0');
  assert.match(app.text('notice'), /already in the hive/);
  name.value = 'Renamed';
  name.fire('change');
  assert.equal(app.rows()[1], secondRow);
  assert.equal(app.saved().people[0].name, 'Renamed');
  const checkbox = secondRow.querySelector('input[type=checkbox]');
  checkbox.checked = false;
  checkbox.fire('change');
  assert.equal(app.lanes().length, 4);
});

test('saved settings from v0.6 and intact data in partially corrupted saves still load', () => {
  const week = fiveParticipants.map(({ id, name }) => ({ id, name }));
  const original = {
    people: fiveParticipants, duration: 17, mode: 'weekly', events: false,
    season: 'spring', week: week.slice(0, 1), photo: false, rare: false,
    custom: [{ text: 'Showtime', type: 'boost' }],
    history: [{ date: '2026-11-20T09:00:00.000Z', hosts: week }],
  };
  const app = openApp({ saved: original });
  assert.equal(app.text('durationValue'), '17 s');
  assert.deepEqual(app.hosts(), ['Person 0']);
  assert.equal(app.lanes().length, 4);
  assert.equal(app.element('course').dataset.season, 'spring');
  app.click('extras');
  assert.equal(app.element('photoToggle').checked, false);
  assert.equal(app.element('rareToggle').checked, false);
  assert.match(app.text('eventList'), /Showtime/);
  assert.match(app.text('historySummary'), /1 completed weekly draws/);

  const partial = openApp({ saved: {
    ...original, people: [fiveParticipants[0], null, fiveParticipants[1]],
    week: [week[0], null, week[2]], custom: [null, ...original.custom],
  } });
  assert.equal(partial.rows().length, 2);
  assert.equal(partial.text('durationValue'), '17 s');
  assert.deepEqual(partial.hosts(), ['Person 0']);
  assert.equal(partial.lanes().length, 1);
});

test('invalid JSON and denied storage both allow a playable session', () => {
  const corrupt = openApp({ raw: '{invalid' });
  assert.match(corrupt.text('privacy'), /could not be read/);
  assert.equal(corrupt.storage(), '{invalid');
  assert.equal(corrupt.lanes().length, 9);
  for (const options of [{ storageBlocked: true }, { writeBlocked: true }]) {
    const session = openApp(options);
    session.change('durationSlider', 3, 'input');
    assert.match(session.text('privacy'), /session only/);
    session.click('start');
    session.advance(3500);
    assert.equal(session.hosts().length, 1);
    assert.equal(session.storage(), null);
  }
});

test('a blocked clipboard offers the complete lineup as selectable text', async () => {
  const app = openApp({ saved: { people: fiveParticipants, week: [fiveParticipants[0]] } });
  await app.click('copyWeek');
  const copy = app.element('manualCopy');
  assert.equal(copy.hidden, false);
  assert.equal(copy.selectionEnd, copy.value.length);
  assert.match(copy.value, /^Next week’s Daily hosts\nMonday: Person 0\n/);
  assert.match(copy.value, /\nFriday: —$/);
});

test('extras remain usable without the native dialog and can close with Escape', () => {
  const app = openApp({ nativeDialog: false });
  app.click('extras');
  assert.equal(app.element('extrasDialog').hasAttribute('open'), true);
  app.change('season', 'winter');
  assert.equal(app.element('course').dataset.season, 'winter');
  app.element('customText').value = 'Demo boost';
  app.element('customType').value = 'boost';
  app.element('customForm').fire('submit');
  assert.match(app.text('eventList'), /Demo boost/);
  app.document.fire('keydown', { key: 'Escape' });
  assert.equal(app.element('extrasDialog').hasAttribute('open'), false);
  assert.equal(app.document.activeElement, app.element('extras'));
  assert.equal(app.saved().custom[0].text, 'Demo boost');
});

test('presentation still works without the fullscreen API', async () => {
  const app = openApp();
  await app.click('present');
  assert.equal(app.element('present').getAttribute('aria-pressed'), 'true');
  assert.equal(app.document.body.classList.contains('presentation'), true);
  app.document.fire('keydown', { key: 'Escape' });
  assert.equal(app.element('present').getAttribute('aria-pressed'), 'false');
});

test('the draw rejects extra random values that would bias a winner', () => {
  const draws = [0xffffffff, 1];
  const crypto = { getRandomValues(sample) { sample[0] = draws.shift(); } };
  const app = openApp({ crypto, saved: { people: fiveParticipants, duration: 3, events: false } });
  app.click('start');
  app.advance(3500);
  assert.deepEqual(app.hosts(), ['Person 1']);
  assert.equal(draws.length, 0);
});

function eventNames(root) {
  return root.querySelectorAll('.event-name').map(label => label.textContent);
}

function removeEvent(app, name) {
  const button = app.element('eventList').querySelectorAll('button').find(candidate =>
    candidate.getAttribute('aria-label') === 'Remove event ' + name);
  assert.ok(button, 'Missing remove button for ' + name);
  assert.equal(button.textContent, '×');
  button.click();
}

function removeEventGroup(app, name) {
  const group = app.element('eventList').querySelectorAll('.event-group').find(section =>
    section.querySelector('h4').textContent === name);
  assert.ok(group, 'Missing event group ' + name);
  eventNames(group).forEach(event => removeEvent(app, event));
}

function addEvent(app, name, type) {
  app.element('customText').value = name;
  app.element('customType').value = type;
  app.element('customForm').fire('submit');
}

function selectedEvents(app) {
  return app.lanes().map(lane => lane.querySelector('.event-bubble').textContent).filter(Boolean);
}

test('Extras groups all 28 original events and keeps management collapsed by default', () => {
  const app = openApp();
  const extras = app.element('extrasDialog');
  assert.equal(extras.querySelector('#sound'), app.element('sound'));
  assert.equal(extras.querySelector('#events'), app.element('events'));
  for (const id of ['eventManager', 'advancedSettings', 'hallOfFame']) {
    assert.equal(app.element(id).hasAttribute('open'), false);
  }
  app.click('extras');
  const list = app.element('eventList');
  assert.deepEqual(list.querySelectorAll('h4').map(heading => heading.textContent),
    ['Slowdown', 'Boost', 'Rare Events']);
  assert.equal(eventNames(list).length, 28);
  assert.equal(app.text('eventCount'), '28 active events');
  const rare = list.querySelectorAll('.event-group')[2];
  assert.deepEqual(rare.querySelectorAll('.event-effect').map(label => label.textContent),
    ['Slowdown · 0.015×', 'Boost · 2.9×', 'Slowdown · 0.035×', 'Boost · 2.8×']);
  assert.equal(app.element('restoreEvents').disabled, true);
});

test('removed regular and rare events stay out of the race pool after reload', () => {
  const app = openApp();
  app.click('extras');
  removeEvent(app, 'Bug detected!');
  removeEvent(app, '🐝 Queen’s orders!');
  assert.deepEqual(app.saved().excludedEventIds, ['bug-detected', 'queen-orders']);
  assert.equal(app.text('eventCount'), '26 active events');
  for (const [random, next] of [[.5, 'Debugging…'], [.049, '🚀 Warp drive!']]) {
    const reloaded = openApp({ raw: app.storage(), random: () => random });
    reloaded.click('extras');
    const names = eventNames(reloaded.element('eventList'));
    assert.equal(names.includes('Bug detected!'), false);
    assert.equal(names.includes('🐝 Queen’s orders!'), false);
    assert.equal(reloaded.text('eventCount'), '26 active events');
    reloaded.click('doneExtras');
    reloaded.click('start');
    assert.deepEqual(selectedEvents(reloaded), [next]);
  }
});

test('custom events support both effects and reject duplicate names including removed defaults', () => {
  const app = openApp();
  app.click('extras');
  addEvent(app, 'Waiting for reviews', 'slow');
  addEvent(app, 'Team buzz', 'boost');
  assert.equal(app.text('eventCount'), '30 active events');
  assert.match(app.text('eventList'), /Waiting for reviewsSlowdown · 0.08× · Custom/);
  assert.match(app.text('eventList'), /Team buzzBoost · 2.35× · Custom/);
  removeEvent(app, 'Honey boost!');
  removeEvent(app, '🍯 Golden honey!');
  for (const duplicate of ['  TEAM BUZZ  ', 'honey BOOST!', '🍯 golden honey!']) {
    addEvent(app, duplicate, 'boost');
    assert.match(app.text('customNotice'), /different from the default and custom events/);
  }
  assert.deepEqual(app.saved().custom, [
    { text: 'Waiting for reviews', type: 'slow' },
    { text: 'Team buzz', type: 'boost' },
  ]);
  removeEvent(app, 'Waiting for reviews');
  const reloaded = openApp({ raw: app.storage() });
  reloaded.click('extras');
  assert.equal(eventNames(reloaded.element('eventList')).includes('Waiting for reviews'), false);
  assert.deepEqual(reloaded.saved().custom, [{ text: 'Team buzz', type: 'boost' }]);
});

test('restoring the original events retains custom entries and toggle preferences', () => {
  const app = openApp();
  app.click('extras');
  const allDefaults = eventNames(app.element('eventList'));
  addEvent(app, 'Team buzz', 'boost');
  removeEvent(app, 'Coffee break');
  removeEvent(app, '🚀 Warp drive!');
  app.check('rareToggle', false);
  app.click('restoreEvents');
  assert.deepEqual(app.saved().excludedEventIds, []);
  assert.deepEqual(app.saved().custom, [{ text: 'Team buzz', type: 'boost' }]);
  assert.equal(app.saved().rare, false);
  assert.equal(app.text('eventCount'), '25 active events · Rare surprises are off.');
  const restored = eventNames(app.element('eventList'));
  assert.equal(restored.length, 29);
  assert.ok(allDefaults.every(name => restored.includes(name)));
  assert.equal(app.element('restoreEvents').disabled, true);
  app.check('events', false);
  assert.equal(app.text('eventCount'), '0 active events · Race events are off.');
  assert.equal(eventNames(app.element('eventList')).length, 29);
});

test('the 5% rare draw falls back to the only active category and handles empty pools', () => {
  const saved = { people: fiveParticipants.slice(0, 2), duration: 3 };
  for (const [random, name] of [[.049, '🐝 Queen’s orders!'], [.05, 'Bug detected!']]) {
    const app = openApp({ saved, random: () => random });
    app.click('start');
    assert.deepEqual(selectedEvents(app), [name]);
  }

  const rareOnly = openApp({ saved, random: () => .5 });
  rareOnly.click('extras');
  removeEventGroup(rareOnly, 'Slowdown');
  removeEventGroup(rareOnly, 'Boost');
  assert.equal(rareOnly.text('eventCount'), '4 active events');
  rareOnly.click('doneExtras');
  rareOnly.click('start');
  assert.deepEqual(selectedEvents(rareOnly), ['🐝 Queen’s orders!']);
  rareOnly.click('reset');
  rareOnly.click('extras');
  rareOnly.check('rareToggle', false);
  assert.equal(rareOnly.text('eventCount'), '0 active events · Rare surprises are off.');
  rareOnly.click('doneExtras');
  rareOnly.click('start');
  assert.deepEqual(selectedEvents(rareOnly), []);
  rareOnly.click('reset');
  rareOnly.click('extras');
  rareOnly.check('rareToggle', true);
  removeEventGroup(rareOnly, 'Rare Events');
  assert.equal(rareOnly.text('eventCount'), '0 active events');
  rareOnly.click('doneExtras');
  rareOnly.click('start');
  rareOnly.advance(3500);
  assert.deepEqual(selectedEvents(rareOnly), []);
  assert.deepEqual(rareOnly.hosts(), ['Person 0']);

  const regularOnly = openApp({ saved, random: () => .01 });
  regularOnly.click('extras');
  removeEventGroup(regularOnly, 'Rare Events');
  regularOnly.click('doneExtras');
  regularOnly.click('start');
  assert.deepEqual(selectedEvents(regularOnly), ['Bug detected!']);
});

test('legacy custom events with an Easter egg name retain their effect under a unique name', () => {
  const name = '🐝 Queen’s orders!';
  const app = openApp({ saved: { custom: [
    { text: name, type: 'boost' },
    { text: name + ' (custom)', type: 'slow' },
  ] } });
  app.click('extras');
  assert.equal(app.element('repeatToggle').checked, false);
  assert.ok(eventNames(app.element('eventList')).includes(name));
  addEvent(app, 'New event', 'slow');
  assert.deepEqual(app.saved().custom, [
    { text: name + ' (custom 2)', type: 'boost' },
    { text: name + ' (custom)', type: 'slow' },
    { text: 'New event', type: 'slow' },
  ]);
  assert.equal(app.saved().allowRepeatWinners, false);
  assert.deepEqual(app.saved().excludedEventIds, []);
});

for (const allowRepeatWinners of [false, true]) {
  for (const count of [1, 2, 3, 9]) {
    test('auto draw with ' + count + ' bees and repeat winners ' + (allowRepeatWinners ? 'on' : 'off'), () => {
      const people = nineParticipants.slice(0, count);
      const app = openApp({ saved: { people, duration: 3, events: false, allowRepeatWinners } });
      const canFill = allowRepeatWinners || count >= 5;
      assert.equal(app.element('autoWeek').disabled, !canFill);
      assert.equal(app.element('start').disabled, false);
      assert.equal(app.element('newWeek').hidden, true);
      app.click('autoWeek');
      app.advance(27000);
      if (!canFill) {
        assert.deepEqual(app.hosts(), []);
        assert.match(app.text('weekNote'), /Not enough eligible bees/);
        return;
      }
      const expected = allowRepeatWinners ? Array(5).fill(people[0].name) : people.slice(0, 5).map(person => person.name);
      assert.deepEqual(app.hosts(), expected);
      assert.equal(app.saved().history.length, 1);
      assert.deepEqual(app.saved().history[0].hosts, app.saved().week);
      assert.equal(app.text('weekTitle'), 'Weekly lineup complete!');
      assert.equal(app.element('newWeek').classList.contains('primary'), true);
      assert.equal(app.element('start').classList.contains('primary'), false);
    });
  }
}

test('manually inactive participants stay out of the draw when winners can repeat', () => {
  const people = [
    { ...fiveParticipants[0], active: false }, fiveParticipants[1], fiveParticipants[2],
  ];
  const draws = [1, 0, 0, 1, 0];
  const crypto = { getRandomValues(sample) { sample[0] = draws.shift(); } };
  const app = openApp({ crypto, saved: { people, duration: 3, events: false, allowRepeatWinners: true } });
  app.click('autoWeek');
  app.advance(27000);
  assert.deepEqual(app.hosts(), ['Person 2', 'Person 1', 'Person 1', 'Person 2', 'Person 1']);
  assert.equal(draws.length, 0);
  assert.equal(app.saved().people[0].active, false);

  const none = openApp({ saved: { people: people.slice(0, 1), allowRepeatWinners: true } });
  assert.equal(none.element('start').disabled, true);
  assert.equal(none.element('autoWeek').disabled, true);
});

test('changing repeat winners midweek keeps assignments and updates eligibility for remaining races', () => {
  const app = openApp({ saved: { people: fiveParticipants, duration: 3, events: false } });
  const first = app.rows()[0];
  const include = first.querySelector('input[type=checkbox]');
  app.click('start');
  app.advance(3500);
  assert.deepEqual(app.hosts(), ['Person 0']);
  assert.equal(include.disabled, true);
  assert.equal(first.classList.contains('assigned'), true);

  app.click('extras');
  assert.equal(app.element('repeatWeekNote').hidden, false);
  app.check('repeatToggle', true);
  app.click('doneExtras');
  assert.deepEqual(app.hosts(), ['Person 0']);
  assert.equal(include.checked, true);
  assert.equal(include.disabled, false);
  assert.equal(first.classList.contains('assigned'), false);
  assert.equal(first.querySelector('.assigned-label').textContent, 'Mon');
  assert.match(app.text('weekNote'), /Previous winners remain eligible/);

  app.click('start');
  assert.equal(app.element('repeatToggle').disabled, true);
  app.check('repeatToggle', false);
  assert.equal(app.element('repeatToggle').checked, true);
  assert.equal(app.saved().allowRepeatWinners, true);
  app.advance(3500);
  assert.deepEqual(app.hosts(), ['Person 0', 'Person 0']);
  assert.equal(first.querySelector('.assigned-label').textContent, 'Mon · Tue');

  app.click('extras');
  app.check('repeatToggle', false);
  app.click('doneExtras');
  assert.deepEqual(app.hosts(), ['Person 0', 'Person 0']);
  assert.equal(include.disabled, true);
  const reloaded = openApp({ raw: app.storage() });
  assert.deepEqual(reloaded.hosts(), app.hosts());
  reloaded.click('start');
  reloaded.advance(3500);
  assert.deepEqual(reloaded.hosts(), ['Person 0', 'Person 0', 'Person 1']);
});

test('repeat winners is locked even between automatic races', () => {
  const app = openApp({ saved: { people: fiveParticipants.slice(0, 2), duration: 3, allowRepeatWinners: true } });
  app.click('autoWeek');
  app.advance(3500);
  assert.match(app.text('again'), /Stop automatic draw/);
  assert.equal(app.element('repeatToggle').disabled, true);
  app.check('repeatToggle', false);
  assert.equal(app.element('repeatToggle').checked, true);
  assert.equal(app.saved().allowRepeatWinners, true);
  app.advance(24000);
  assert.deepEqual(app.hosts(), Array(5).fill('Person 0'));
});

test('the repeat setting applies only in Weekly mode', () => {
  const people = fiveParticipants.slice(0, 2);
  const app = openApp({ saved: { people, week: [people[0]], duration: 3, events: false, mode: 'single' } });
  for (const setting of [false, true]) {
    app.click('extras');
    app.check('repeatToggle', setting);
    app.click('doneExtras');
    assert.equal(app.element('week').hidden, true);
    assert.equal(app.lanes().length, 2);
    app.click('start');
    app.advance(3500);
    assert.equal(app.text('winnerName'), people[0].name);
    assert.deepEqual(app.hosts(), [people[0].name]);
    assert.deepEqual(app.saved().history, []);
    app.click('dismiss');
  }
});

test('repeated winners survive reload and count once per assigned day in history and copy', async () => {
  const people = fiveParticipants.slice(0, 2);
  const draws = [0, 1, 0, 0, 1];
  const crypto = { getRandomValues(sample) { sample[0] = draws.shift(); } };
  const app = openApp({ crypto, saved: { people, duration: 3, events: false, allowRepeatWinners: true } });
  app.click('autoWeek');
  app.advance(27000);
  app.click('extras');
  app.check('repeatToggle', false);
  const reloaded = openApp({ raw: app.storage() });
  const expected = ['Person 0', 'Person 1', 'Person 0', 'Person 0', 'Person 1'];
  assert.deepEqual(reloaded.hosts(), expected);
  assert.equal(reloaded.element('repeatToggle').checked, false);
  reloaded.click('extras');
  const rows = reloaded.element('historyList').querySelectorAll('.extra-item');
  assert.deepEqual(rows.map(row => [row.querySelector('span').textContent, row.querySelector('strong').textContent]),
    [['Person 0', '3'], ['Person 1', '2']]);
  const abbreviated = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  assert.ok(reloaded.text('historyWeeks').includes(abbreviated.map((day, index) => day + ': ' + expected[index]).join(' · ')));
  reloaded.click('doneExtras');
  await reloaded.click('copyWeek');
  assert.deepEqual(reloaded.element('manualCopy').value.split('\n').slice(1), [
    'Monday: Person 0', 'Tuesday: Person 1', 'Wednesday: Person 0', 'Thursday: Person 0', 'Friday: Person 1',
  ]);
  reloaded.click('extras');
  reloaded.click('clearHistory');
  assert.deepEqual(reloaded.saved().history, []);
  assert.deepEqual(reloaded.hosts(), expected);
});

test('both completed-week actions confirm and reset only the current lineup', () => {
  const people = fiveParticipants.map((person, index) => ({ ...person, active: index !== 4, style: index + 1 }));
  const week = people.map(({ id, name }) => ({ id, name }));
  const saved = { people, week, duration: 17, mode: 'weekly', season: 'autumn',
    sound: true, events: false, allowRepeatWinners: true, photo: false, rare: false,
    custom: [{ text: 'Team demo', type: 'slow' }], excludedEventIds: ['bug-detected', 'warp-drive'],
    history: [{ date: '2026-11-20T09:00:00.000Z', hosts: week }],
  };
  for (const action of ['newWeek', 'start']) {
    let allowReset = false;
    const app = openApp({ saved, confirm: () => allowReset });
    assert.equal(app.element('copyWeek').hidden, false);
    assert.equal(app.text(action), 'New weekly draw');
    app.click(action);
    assert.deepEqual(app.hosts(), week.map(host => host.name));
    allowReset = true;
    app.click(action);
    app.advance(60000);
    assert.deepEqual(app.saved(), { ...saved, week: [] });
    assert.deepEqual(app.hosts(), []);
    assert.equal(app.lanes().length, 4);
    assert.equal(app.text('start'), '▶ Race for Monday');
    assert.equal(app.text('clock'), '00:17');
    assert.equal(app.text('status'), 'Ready to race');
    assert.equal(app.element('newWeek').hidden, true);
  }
});

test('a partial lineup keeps the next race primary and asks before clearing', () => {
  const people = fiveParticipants;
  const app = openApp({ saved: { people, week: [people[0]] }, confirm: () => false });
  assert.equal(app.text('start'), '▶ Race for Tuesday');
  assert.equal(app.element('start').classList.contains('primary'), true);
  assert.equal(app.text('newWeek'), 'Reset lineup');
  assert.equal(app.element('newWeek').classList.contains('linkbtn'), true);
  app.click('newWeek');
  assert.deepEqual(app.hosts(), ['Person 0']);
});
