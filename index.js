const mkdirp = require('mkdirp');
const puppeteer = require('puppeteer-core');
const untildify = require('untildify');
const { promisify } = require('util');
require('array-foreach-async');

const SERVER = 'http://localhost:3000';
const LOGIN = ['admin', 'smartvm'];
const OUTPUT = '~/miq-puppet-screenshots';


function logRequest(req) {
  const url = req.url();

  // skip assets
  if (url.match(/\?body=1$/))
    return;
  // skip webpack packs
  if (url.match(/\/packs\//))
    return;
  // skip fonts, custom css, images
  if (url.match(/\.(css|svg|ico|png|woff2|ttf)/))
    return;
  // skip angular templates
  if (url.match(/\/static\//))
    return;

  console.log('REQUEST: ', url);
}

function logConsole(msg) {
  const text = msg.text();
  const type = msg.type();

  // hide info and debug level
  if (type === 'info' || type === 'debug')
    return;

  console.log('PAGE LOG:', text);
}

async function goto(page, path) {
  const fullpath = path.match(/^https?:/) ? path : SERVER + path;
  await page.goto(fullpath);
}

async function login(page, user, pass) {
  await goto(page, '/dashboard/login');

  const userEl = await page.$('#user_name');
  const passEl = await page.$('#user_password');
  const loginEl = await page.$('#login');

  await userEl.type(user);
  await passEl.type(pass);

  await loginEl.click();
  await page.waitForNavigation();
}

async function menuItems(page) {
  return page.evaluate(() => {
    function children(parent, ...selectors) {
      if (! parent)
        return [];

      const [selector, ...rest] = selectors;
      const items = [];
      parent.querySelectorAll(':scope > li > a').forEach((el) => {
        items.push({
          href: el.href,
          title: $(el).text().trim(),
          items: children(el.parentElement.querySelector(`${selector} > ul`), ...rest),
        });
      });

      return items;
    }

    return children(document.querySelector('#maintab'), '.nav-pf-secondary-nav', '.nav-pf-tertiary-nav');
  });
}

async function screenshot(page, name) {
  await promisify(mkdirp)(untildify(OUTPUT));

  await page.screenshot({
    path: `${untildify(OUTPUT)}/${name}.png`,
  });

  console.log('SCREENSHOT', `${untildify(OUTPUT)}/${name}.png`);
}

async function recurseMenu(menu, callback, ...parents) {
  await menu.forEachAsync(async function(item) {
    await callback(item, parents);

    await recurseMenu(item.items, callback, ...parents, item);
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

function randomWait(min = 500, max = 1500) {
  return wait(Math.trunc(Math.random() * Math.abs(max - min) + Math.min(min, max)));
}

async function waitReady(page) {
  let inFlight = true;
  while (inFlight) {
    // TODO this blocks when wait_for_task

    inFlight = await page.evaluate(() => {
      return ManageIQ.qe.anythingInFlight();
    });

    if (inFlight) {
      console.log('QE: waiting for !anythingInFlight');
      await wait(500);
    }
  }
}

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: '/usr/bin/chromium',
//    headless: false,
//    devtools: true,
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
  });

  const page = await browser.newPage();
  page.on('console', logConsole);
  page.on('request', logRequest);

  await login(page, ...LOGIN);

  const menu = await menuItems(page);
  await recurseMenu(menu, async (item, parents) => {
    await randomWait();

    let path = "";
    parents.forEach((p) => {
      path += `${p.title} > `;
    });
    path += item.title;

    console.log('RECURSE:', path);
    await goto(page, item.href);
    await waitReady(page);
    await screenshot(page, path.replace(/[^-a-zA-Z0-9_]/g, '_'));
  });

  await browser.close();
})();
